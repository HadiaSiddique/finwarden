// Loads database rows as the trust layer's plain types.
import { and, eq, gte, ne } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { Approval, PayeeRecord, PaymentIntent, StoredFlag, Thresholds } from "@/trust/types";
import { DEFAULT_THRESHOLDS } from "@/trust/types";

type PayeeRow = typeof schema.payees.$inferSelect;
type IntentRow = typeof schema.paymentIntents.$inferSelect;
type FlagRow = typeof schema.flags.$inferSelect;

export function toPayee(r: PayeeRow): PayeeRecord {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    verifiedPayout: r.verifiedPayout ?? null,
    payoutVerifiedAt: r.payoutVerifiedAt,
    contacts: r.contacts,
    createdAt: r.createdAt,
    firstPaidAt: r.firstPaidAt,
    paydayDayOfMonth: r.paydayDayOfMonth ?? undefined,
    typicalAmount: r.typicalMedian != null && r.typicalMax != null ? { median: r.typicalMedian, max: r.typicalMax } : undefined,
  };
}

export function toIntent(r: IntentRow): PaymentIntent {
  return {
    id: r.id,
    payeeId: r.payeeId,
    payeeName: r.payeeName,
    amount: r.amount,
    currency: r.currency,
    payout: r.payout,
    invoiceNumber: r.invoiceNumber ?? undefined,
    createdAt: r.createdAt,
    createdBy: r.createdBy,
    status: r.status,
  };
}

export function toFlag(r: FlagRow): StoredFlag {
  return {
    id: r.id,
    ruleId: r.ruleId,
    severity: r.severity,
    why: r.why,
    evidence: r.evidence,
    resolvedBy: r.resolvedBy ?? undefined,
    resolvedAt: r.resolvedAt ?? undefined,
    acknowledgedBy: r.acknowledgedBy ?? undefined,
    acknowledgedAt: r.acknowledgedAt ?? undefined,
  };
}

export function thresholds(): Thresholds {
  const usd = Number(process.env.TWO_APPROVER_THRESHOLD_USD);
  const hours = Number(process.env.COOLING_OFF_HOURS);
  return {
    ...DEFAULT_THRESHOLDS,
    ...(usd > 0 ? { twoApproverMinor: Math.round(usd * 100) } : {}),
    ...(hours > 0 ? { coolingOffHours: hours } : {}),
  };
}

export async function loadPayee(id: string | null): Promise<PayeeRecord | null> {
  if (!id) return null;
  const db = await getDb();
  const [row] = await db.select().from(schema.payees).where(eq(schema.payees.id, id));
  return row ? toPayee(row) : null;
}

export async function loadAllPayees(): Promise<PayeeRecord[]> {
  const db = await getDb();
  return (await db.select().from(schema.payees)).map(toPayee);
}

export async function loadIntent(id: string): Promise<PaymentIntent | null> {
  const db = await getDb();
  const [row] = await db.select().from(schema.paymentIntents).where(eq(schema.paymentIntents.id, id));
  return row ? toIntent(row) : null;
}

export async function loadRecentIntents(since: Date, excludeId?: string): Promise<PaymentIntent[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.paymentIntents)
    .where(and(gte(schema.paymentIntents.createdAt, since), ne(schema.paymentIntents.status, "CANCELLED")));
  return rows.filter((r) => r.id !== excludeId).map(toIntent);
}

export async function loadFlags(intentId: string): Promise<StoredFlag[]> {
  const db = await getDb();
  return (await db.select().from(schema.flags).where(eq(schema.flags.intentId, intentId))).map(toFlag);
}

export async function loadApprovals(intentId: string): Promise<Approval[]> {
  const db = await getDb();
  return db.select().from(schema.approvals).where(eq(schema.approvals.intentId, intentId));
}
