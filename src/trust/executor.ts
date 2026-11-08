// The only code path that moves money. Every intent is re-checked here, right before sending.
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { createPayoutBatch, type PayoutBatchResult, type PayoutItemInput } from "@/paypal/payouts";
import { audit, newId, now } from "@/services/core";
import { loadApprovals, loadFlags, loadIntent, loadPayee, thresholds } from "@/services/repo";
import { senderBatchId } from "./hash";
import { checkExecution } from "./policy";

export interface ExecutionResult {
  sent: string[];
  refused: { intentId: string; reasons: string[] }[];
  batch?: { id: string; paypalBatchId: string; status: string; stub: boolean };
  error?: string;
}

type Sender = (senderBatchId: string, items: PayoutItemInput[]) => Promise<PayoutBatchResult>;

export async function executeIntents(intentIds: string[], actorId: string, send: Sender = createPayoutBatch): Promise<ExecutionResult> {
  const db = await getDb();
  const at = await now();
  const result: ExecutionResult = { sent: [], refused: [] };
  const claimed: PayoutItemInput[] = [];

  for (const id of intentIds) {
    const intent = await loadIntent(id);
    if (!intent) {
      result.refused.push({ intentId: id, reasons: ["Payment not found."] });
      continue;
    }
    const check = checkExecution({
      intent,
      payee: await loadPayee(intent.payeeId),
      flags: await loadFlags(id),
      approvals: await loadApprovals(id),
      now: at,
      thresholds: thresholds(),
    });
    if (!check.ok) {
      result.refused.push({ intentId: id, reasons: check.reasons });
      await audit({
        actorType: "system",
        actorId: "executor",
        action: "execution.refused",
        subjectType: "payment_intent",
        subjectId: id,
        why: `Not sent: ${check.reasons.join(" ")}`,
        data: { requestedBy: actorId },
      });
      continue;
    }
    // Atomic claim so the same payment can never be sent twice.
    const [row] = await db
      .update(schema.paymentIntents)
      .set({ status: "EXECUTING" })
      .where(and(eq(schema.paymentIntents.id, id), eq(schema.paymentIntents.status, "APPROVED"), isNull(schema.paymentIntents.batchId)))
      .returning();
    if (!row) {
      result.refused.push({ intentId: id, reasons: ["Payment is already being sent."] });
      continue;
    }
    claimed.push({ intentId: id, amount: intent.amount, currency: intent.currency, payout: intent.payout, note: `Payment from Sara's Studio${intent.invoiceNumber ? ` for ${intent.invoiceNumber}` : ""}` });
  }

  if (!claimed.length) return result;

  const ids = claimed.map((c) => c.intentId);
  const sbid = senderBatchId(ids);
  const batchId = newId("pb");
  try {
    const res = await send(sbid, claimed);
    await db.insert(schema.payoutBatches).values({
      id: batchId,
      senderBatchId: sbid,
      paypalBatchId: res.paypalBatchId,
      status: res.status,
      intentIds: ids,
      stub: res.stub,
      response: res.raw,
      createdAt: at,
    });
    await db.update(schema.paymentIntents).set({ status: "SENT", batchId }).where(inArray(schema.paymentIntents.id, ids));
    for (const c of claimed) {
      const intent = await loadIntent(c.intentId);
      if (intent?.payeeId) {
        await db
          .update(schema.payees)
          .set({ firstPaidAt: at })
          .where(and(eq(schema.payees.id, intent.payeeId), isNull(schema.payees.firstPaidAt)));
      }
    }
    await audit({
      actorType: "system",
      actorId: "executor",
      action: "payout.submitted",
      subjectType: "payout_batch",
      subjectId: batchId,
      why: `Sent ${ids.length} approved payment(s) to PayPal Payouts${res.stub ? " (PayPal stub, local testing only)" : ""}. Every one passed the trust checks moments before sending.`,
      data: { paypalBatchId: res.paypalBatchId, senderBatchId: sbid, debugId: res.debugId, intentIds: ids, requestedBy: actorId },
    });
    result.sent = ids;
    result.batch = { id: batchId, paypalBatchId: res.paypalBatchId, status: res.status, stub: res.stub };
  } catch (e) {
    // Fail closed: nothing is marked sent. The intents go to FAILED for a person to look at.
    const message = e instanceof Error ? e.message : String(e);
    await db.update(schema.paymentIntents).set({ status: "FAILED" }).where(inArray(schema.paymentIntents.id, ids));
    await audit({
      actorType: "system",
      actorId: "executor",
      action: "payout.failed",
      subjectType: "payout_batch",
      subjectId: sbid,
      why: `PayPal Payouts call failed, so nothing was marked as paid: ${message}`,
      data: { intentIds: ids },
    });
    result.error = message;
  }
  return result;
}
