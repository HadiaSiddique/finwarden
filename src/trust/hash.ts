import { createHash } from "node:crypto";
import type { PaymentIntent, PayoutDetails } from "./types";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function normaliseReceiver(details: PayoutDetails): string {
  const r = details.receiver.trim().toLowerCase();
  if (details.method === "paypal_phone") return r.replace(/\D/g, "");
  if (details.method === "bank") return r.replace(/[\s-]/g, "");
  return r;
}

// Identifies where money goes. Any change to method, receiver, currency or country changes it.
export function payoutFingerprint(details: PayoutDetails): string {
  return sha256(
    [details.method, normaliseReceiver(details), details.currency.toUpperCase(), (details.country ?? "").toUpperCase()].join("|"),
  );
}

// Approvals are bound to this hash. If any part of the intent changes, approvals are void.
export function intentHash(intent: Pick<PaymentIntent, "id" | "amount" | "currency" | "payeeId" | "payout">): string {
  return sha256(
    JSON.stringify([intent.id, intent.amount, intent.currency.toUpperCase(), intent.payeeId ?? "", payoutFingerprint(intent.payout)]),
  );
}

export function senderBatchId(intentIds: string[]): string {
  return "fw-" + sha256([...intentIds].sort().join(",")).slice(0, 24);
}
