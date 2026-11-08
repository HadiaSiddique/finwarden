// Payment intents: create, re-check, flag handling, approvals. Money only moves via trust/executor.ts.
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { intentHash } from "@/trust/hash";
import { coolingOffEndsAt, requiredApprovers, validApprovals } from "@/trust/policy";
import { evaluatePayment } from "@/trust/rules";
import type { Flag, MessageContacts, MessageSignals, PayoutDetails } from "@/trust/types";
import { TrustError, audit, newId, now } from "./core";
import { loadAllPayees, loadApprovals, loadFlags, loadIntent, loadPayee, loadRecentIntents, thresholds } from "./repo";

const DAY = 86_400_000;

export interface CreateIntentInput {
  payeeId?: string | null;
  payeeName: string;
  amount: number; // cents
  currency?: string;
  payout?: PayoutDetails;
  invoiceNumber?: string;
  memo?: string;
  scheduledFor?: Date;
  sourceText?: string;
  // From the AI (or the eval set) when the request came from a message.
  signals?: MessageSignals;
  messageContacts?: MessageContacts;
}

export interface Actor {
  type: "user" | "agent" | "system";
  id: string;
}

async function runRules(intentId: string, extra: Pick<CreateIntentInput, "signals" | "messageContacts"> = {}) {
  const intent = await loadIntent(intentId);
  if (!intent) throw new TrustError(`Intent ${intentId} not found`);
  const at = await now();
  const flags = evaluatePayment({
    now: at,
    intent,
    payee: await loadPayee(intent.payeeId),
    allPayees: await loadAllPayees(),
    recentIntents: await loadRecentIntents(new Date(at.getTime() - 90 * DAY), intent.id),
    thresholds: thresholds(),
    ...extra,
  });
  return { intent, flags, at };
}

export async function createIntent(input: CreateIntentInput, actor: Actor) {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new TrustError("Amount must be a positive number of cents.");
  const db = await getDb();
  const payee = await loadPayee(input.payeeId ?? null);
  const payout = input.payout ?? payee?.verifiedPayout;
  if (!payout) throw new TrustError("No payout details: choose a saved payee or give details.");

  const id = newId("pi");
  const at = await now();
  await db.insert(schema.paymentIntents).values({
    id,
    payeeId: payee?.id ?? null,
    payeeName: input.payeeName,
    amount: input.amount,
    currency: (input.currency ?? payout.currency).toUpperCase(),
    payout,
    invoiceNumber: input.invoiceNumber,
    memo: input.memo,
    status: "PENDING_APPROVAL",
    createdBy: actor.id,
    createdAt: at,
    scheduledFor: input.scheduledFor,
    sourceText: input.sourceText,
  });

  const { flags } = await runRules(id, input);
  await storeFlags(id, flags);
  await audit({
    actorType: actor.type,
    actorId: actor.id,
    action: "intent.created",
    subjectType: "payment_intent",
    subjectId: id,
    ruleIds: flags.map((f) => f.ruleId),
    why: flags.length
      ? `Payment to ${input.payeeName} created and held for review: ${flags.map((f) => f.why).join(" ")}`
      : `Payment to ${input.payeeName} created. No warning signs found; it needs passkey approval.`,
    data: { amount: input.amount, payeeId: payee?.id ?? null },
  });
  return { id, flags };
}

async function storeFlags(intentId: string, flags: Flag[]) {
  if (!flags.length) return;
  const db = await getDb();
  await db.insert(schema.flags).values(flags.map((f) => ({ ...f, id: newId("fl"), intentId })));
}

// Re-run the rules after something changed (for example a payee change was verified).
// Flags whose condition has cleared are resolved by the system; new ones are added.
export async function recheckIntent(intentId: string, actor: Actor) {
  const db = await getDb();
  const { flags: current, at } = await runRules(intentId);
  const all = await loadFlags(intentId);
  const stored = all.filter((f) => !f.resolvedAt);
  const firing = new Set(current.map((f) => f.ruleId));
  for (const f of stored) {
    if (!firing.has(f.ruleId) && f.ruleId !== "R7" && f.ruleId !== "R8") {
      await db
        .update(schema.flags)
        .set({ resolvedAt: at, resolvedBy: "system", resolution: "Condition no longer applies after re-check." })
        .where(eq(schema.flags.id, f.id));
    }
  }
  // A rule that already raised a flag on this payment (even one a person cleared) isn't raised again.
  const seen = new Set(all.map((f) => f.ruleId));
  await storeFlags(intentId, current.filter((f) => !seen.has(f.ruleId)));
  await audit({
    actorType: actor.type,
    actorId: actor.id,
    action: "intent.rechecked",
    subjectType: "payment_intent",
    subjectId: intentId,
    ruleIds: [...firing],
    why: firing.size ? `Re-checked: still flagged by ${[...firing].join(", ")}.` : "Re-checked: no warning signs remain.",
  });
  await refreshStatus(intentId);
}

export async function acknowledgeFlag(flagId: string, userId: string) {
  const db = await getDb();
  const [flag] = await db.select().from(schema.flags).where(eq(schema.flags.id, flagId));
  if (!flag) throw new TrustError("Flag not found.");
  if (flag.severity !== "amber") throw new TrustError("Red flags must be resolved, not just acknowledged.");
  const at = await now();
  await db.update(schema.flags).set({ acknowledgedBy: userId, acknowledgedAt: at }).where(eq(schema.flags.id, flagId));
  await audit({
    actorType: "user",
    actorId: userId,
    action: "flag.acknowledged",
    subjectType: "payment_intent",
    subjectId: flag.intentId ?? "",
    ruleIds: [flag.ruleId],
    why: `Warning ${flag.ruleId} acknowledged: ${flag.why}`,
  });
  if (flag.intentId) await refreshStatus(flag.intentId);
}

// Only the owner can clear a red flag by hand, with a written reason. R1 can't be cleared by hand:
// changed details must go through a verified payee change request.
export async function resolveFlag(flagId: string, userId: string, reason: string) {
  const db = await getDb();
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (user?.role !== "owner") throw new TrustError("Only the business owner can clear a red flag.");
  if (reason.trim().length < 10) throw new TrustError("Write a short reason (at least 10 characters).");
  const [flag] = await db.select().from(schema.flags).where(eq(schema.flags.id, flagId));
  if (!flag) throw new TrustError("Flag not found.");
  if (flag.ruleId === "R1" || flag.ruleId === "R5")
    throw new TrustError("Changed payment details can only be cleared by verifying the change with the contact on file.");
  const at = await now();
  await db.update(schema.flags).set({ resolvedBy: userId, resolvedAt: at, resolution: reason }).where(eq(schema.flags.id, flagId));
  await audit({
    actorType: "user",
    actorId: userId,
    action: "flag.resolved",
    subjectType: "payment_intent",
    subjectId: flag.intentId ?? "",
    ruleIds: [flag.ruleId],
    why: `Red flag ${flag.ruleId} cleared by ${user.name}: "${reason}"`,
  });
  if (flag.intentId) await refreshStatus(flag.intentId);
}

// Called only after the server has verified a passkey assertion for this exact intent hash.
export async function recordVerifiedApproval(intentId: string, userId: string, verifiedHash: string) {
  const db = await getDb();
  const intent = await loadIntent(intentId);
  if (!intent) throw new TrustError("Payment not found.");
  if (intent.status !== "PENDING_APPROVAL" && intent.status !== "APPROVED")
    throw new TrustError(`This payment is ${intent.status.toLowerCase()} and can't be approved.`);
  if (verifiedHash !== intentHash(intent)) throw new TrustError("The payment changed after you started approving. Review it again.");
  const flags = await loadFlags(intentId);
  const blocking = flags.filter((f) => f.severity === "red" && !f.resolvedAt);
  if (blocking.length) throw new TrustError("Resolve the red flags first.", blocking.map((f) => f.why));

  const existing = await loadApprovals(intentId);
  if (existing.some((a) => a.userId === userId && a.intentHash === verifiedHash))
    throw new TrustError("You've already approved this payment. A second person must approve it.");

  await db.insert(schema.approvals).values({
    id: newId("ap"),
    intentId,
    userId,
    intentHash: verifiedHash,
    passkeyVerified: true,
    createdAt: await now(),
  });
  await audit({
    actorType: "user",
    actorId: userId,
    action: "intent.approved",
    subjectType: "payment_intent",
    subjectId: intentId,
    why: "Approved in the app with a passkey, bound to this exact amount and recipient.",
    data: { intentHash: verifiedHash },
  });
  await refreshStatus(intentId);
}

// PENDING_APPROVAL <-> APPROVED, based on approvals and flags. The executor re-checks everything anyway.
export async function refreshStatus(intentId: string) {
  const db = await getDb();
  const intent = await loadIntent(intentId);
  if (!intent || (intent.status !== "PENDING_APPROVAL" && intent.status !== "APPROVED")) return;
  const flags = await loadFlags(intentId);
  const clear = flags.every((f) => f.resolvedAt || (f.severity === "amber" && f.acknowledgedAt));
  const enough = validApprovals(intent, await loadApprovals(intentId)).length >= requiredApprovers(intent, thresholds());
  const next = clear && enough ? "APPROVED" : "PENDING_APPROVAL";
  if (next !== intent.status) {
    await db
      .update(schema.paymentIntents)
      .set({ status: next })
      .where(and(eq(schema.paymentIntents.id, intentId), eq(schema.paymentIntents.status, intent.status)));
  }
}

export async function cancelIntent(intentId: string, userId: string, reason: string) {
  const db = await getDb();
  const [row] = await db
    .update(schema.paymentIntents)
    .set({ status: "CANCELLED" })
    .where(and(eq(schema.paymentIntents.id, intentId), isNull(schema.paymentIntents.batchId)))
    .returning();
  if (!row) throw new TrustError("This payment has already been sent and can't be cancelled.");
  await audit({
    actorType: "user",
    actorId: userId,
    action: "intent.cancelled",
    subjectType: "payment_intent",
    subjectId: intentId,
    why: `Cancelled: ${reason}`,
  });
}

// What the UI needs to show for one held payment.
export async function intentStatusView(intentId: string) {
  const intent = await loadIntent(intentId);
  if (!intent) return null;
  const payee = await loadPayee(intent.payeeId);
  const approvals = validApprovals(intent, await loadApprovals(intentId));
  return {
    intent,
    flags: await loadFlags(intentId),
    approvers: approvals.map((a) => a.userId),
    requiredApprovers: requiredApprovers(intent, thresholds()),
    coolingOffEndsAt: coolingOffEndsAt(payee, thresholds()),
    intentHash: intentHash(intent),
  };
}
