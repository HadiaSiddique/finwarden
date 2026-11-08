// In-memory stand-in for the PayPal sandbox, for tests and local development only.
// The UI shows a "PayPal stub active" banner whenever this is used. Never used in production.
import { randomUUID } from "node:crypto";
import type { PayoutBatchResult, PayoutItemInput } from "./payouts";

const batches = new Map<string, PayoutBatchResult>();

export async function stubCreatePayoutBatch(senderBatchId: string, items: PayoutItemInput[]): Promise<PayoutBatchResult> {
  // Like PayPal, a repeated sender_batch_id is rejected.
  if (batches.has(senderBatchId)) throw new Error(`Batch ${senderBatchId} was already submitted.`);
  const result: PayoutBatchResult = {
    paypalBatchId: "STUB-" + randomUUID().slice(0, 8).toUpperCase(),
    status: "PENDING",
    raw: { stub: true, items: items.map((i) => ({ sender_item_id: i.intentId, amount: i.amount })) },
    debugId: null,
    stub: true,
  };
  batches.set(senderBatchId, result);
  return result;
}
