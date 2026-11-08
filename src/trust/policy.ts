// Decides whether a payment intent may be executed. Fails closed: any doubt means no.
import { intentHash, payoutFingerprint } from "./hash";
import type { Approval, PayeeRecord, PaymentIntent, StoredFlag, Thresholds } from "./types";

const HOUR = 3_600_000;

export interface ExecutionCheck {
  ok: boolean;
  reasons: string[];
  validApprovers: string[];
  requiredApprovers: number;
}

export function requiredApprovers(intent: PaymentIntent, t: Thresholds): number {
  return intent.amount >= t.twoApproverMinor ? 2 : 1;
}

export function validApprovals(intent: PaymentIntent, approvals: Approval[]): Approval[] {
  const hash = intentHash(intent);
  const seen = new Set<string>();
  return approvals.filter((a) => {
    if (a.intentId !== intent.id || !a.passkeyVerified || a.intentHash !== hash || seen.has(a.userId)) return false;
    seen.add(a.userId);
    return true;
  });
}

// When money to this payee may first go out under the current payout details.
export function coolingOffEndsAt(payee: PayeeRecord | null, t: Thresholds): Date | null {
  if (!payee) return null;
  const start = payee.firstPaidAt ? payee.payoutVerifiedAt : (payee.payoutVerifiedAt ?? payee.createdAt);
  if (!start) return null;
  if (payee.firstPaidAt && payee.payoutVerifiedAt && payee.payoutVerifiedAt <= payee.firstPaidAt) return null;
  return new Date(start.getTime() + t.coolingOffHours * HOUR);
}

export function checkExecution(args: {
  intent: PaymentIntent;
  payee: PayeeRecord | null;
  flags: StoredFlag[];
  approvals: Approval[];
  now: Date;
  thresholds: Thresholds;
}): ExecutionCheck {
  const { intent, payee, flags, approvals, now, thresholds } = args;
  const reasons: string[] = [];

  if (intent.status !== "APPROVED") reasons.push(`Intent status is ${intent.status}, not APPROVED.`);
  if (!payee) reasons.push("Payee is not a saved, verified payee.");
  else if (!payee.verifiedPayout) reasons.push("Payee has no verified payout details.");
  else if (payoutFingerprint(intent.payout) !== payoutFingerprint(payee.verifiedPayout))
    reasons.push("Payout details differ from the payee's verified details.");

  for (const f of flags) {
    if (f.severity === "red" && !f.resolvedAt) reasons.push(`Unresolved red flag ${f.ruleId}: ${f.why}`);
    if (f.severity === "amber" && !f.acknowledgedAt && !f.resolvedAt) reasons.push(`Amber flag ${f.ruleId} not acknowledged.`);
  }

  const ends = coolingOffEndsAt(payee, thresholds);
  if (ends && now < ends) reasons.push(`Cooling-off period runs until ${ends.toISOString()}.`);

  const valid = validApprovals(intent, approvals);
  const required = requiredApprovers(intent, thresholds);
  if (valid.length < required)
    reasons.push(`Needs ${required} passkey approval(s) bound to this exact payment; has ${valid.length}.`);

  return { ok: reasons.length === 0, reasons, validApprovers: valid.map((a) => a.userId), requiredApprovers: required };
}
