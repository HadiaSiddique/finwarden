// PayPal Payouts. Only src/trust/executor.ts may import this file (enforced by a test).
// API reference: https://developer.paypal.com/docs/api/payments.payouts-batch/v1/
import type { PayoutDetails } from "@/trust/types";
import { minorToValue, paypalFetch } from "./client";
import { usingStub } from "./mode";
import { stubCreatePayoutBatch } from "./stub";

export interface PayoutItemInput {
  intentId: string;
  amount: number; // cents
  currency: string;
  payout: PayoutDetails;
  note: string;
}

export interface PayoutBatchResult {
  paypalBatchId: string;
  status: string;
  raw: unknown;
  debugId: string | null;
  stub: boolean;
}

function recipient(p: PayoutDetails) {
  switch (p.method) {
    case "paypal_email":
      return { recipient_type: "EMAIL", receiver: p.receiver, recipient_wallet: "PAYPAL" };
    case "paypal_phone":
      return { recipient_type: "PHONE", receiver: p.receiver, recipient_wallet: "PAYPAL" };
    case "venmo":
      // Venmo payouts are US-only.
      return { recipient_type: "PHONE", receiver: p.receiver, recipient_wallet: "VENMO" };
    case "bank":
      throw new Error("Bank payouts aren't enabled in Finwarden's sandbox build.");
  }
}

export async function createPayoutBatch(senderBatchId: string, items: PayoutItemInput[]): Promise<PayoutBatchResult> {
  if (usingStub()) {
    if (process.env.VERCEL_ENV === "production") throw new Error("The PayPal stub is not allowed in production.");
    return stubCreatePayoutBatch(senderBatchId, items);
  }
  const res = await paypalFetch<{ batch_header: { payout_batch_id: string; batch_status: string } }>("/v1/payments/payouts", {
    method: "POST",
    body: {
      sender_batch_header: {
        sender_batch_id: senderBatchId,
        email_subject: "You have a payment from Sara's Studio",
        email_message: "Sent with Finwarden.",
      },
      items: items.map((i) => ({
        ...recipient(i.payout),
        amount: { value: minorToValue(i.amount), currency: i.currency },
        note: i.note,
        sender_item_id: i.intentId,
      })),
    },
  });
  return {
    paypalBatchId: res.data.batch_header.payout_batch_id,
    status: res.data.batch_header.batch_status,
    raw: res.data,
    debugId: res.debugId,
    stub: false,
  };
}
