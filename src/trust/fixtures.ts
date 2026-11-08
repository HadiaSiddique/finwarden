// Shared test and seed fixtures for Sara's business.
import type { PayeeRecord, PaymentIntent } from "./types";

export const NOW = new Date("2026-11-10T09:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

export function payee(over: Partial<PayeeRecord> & Pick<PayeeRecord, "id" | "name">): PayeeRecord {
  return {
    type: "supplier",
    verifiedPayout: { method: "paypal_email", receiver: `${over.id}@example.com`, currency: "USD" },
    payoutVerifiedAt: daysAgo(200),
    contacts: { phones: [], emails: [], domains: [] },
    createdAt: daysAgo(200),
    firstPaidAt: daysAgo(180),
    ...over,
  };
}

export const ACME = payee({
  id: "acme",
  name: "Acme Ltd",
  verifiedPayout: { method: "paypal_email", receiver: "billing@acme.com", currency: "USD" },
  contacts: { phones: ["+1 415 555 0100"], emails: ["billing@acme.com"], domains: ["acme.com"] },
  typicalAmount: { median: 60_000, max: 90_000 },
});

export const PRINTHUB = payee({
  id: "printhub",
  name: "PrintHub",
  verifiedPayout: { method: "paypal_email", receiver: "pay@printhub.io", currency: "USD" },
  contacts: { phones: ["+1 212 555 0199"], emails: ["pay@printhub.io"], domains: ["printhub.io"] },
});

export const HAMZA = payee({
  id: "hamza",
  name: "Hamza Khan",
  type: "freelancer",
  verifiedPayout: { method: "paypal_email", receiver: "hamza.design@gmail.com", currency: "USD" },
  contacts: { phones: ["+92 300 555 0101"], emails: ["hamza.design@gmail.com"], domains: [] },
});

export const OMAR = payee({
  id: "omar",
  name: "Omar Siddiq",
  type: "employee",
  paydayDayOfMonth: 15,
  verifiedPayout: { method: "paypal_email", receiver: "omar@sarastudio.com", currency: "USD" },
  contacts: { phones: ["+1 646 555 0123"], emails: ["omar@sarastudio.com"], domains: ["sarastudio.com"] },
});

export const PAYEES = [ACME, PRINTHUB, HAMZA, OMAR];

let n = 0;
export function intent(over: Partial<PaymentIntent> & Pick<PaymentIntent, "payeeName" | "amount">): PaymentIntent {
  const p = PAYEES.find((x) => x.name === over.payeeName);
  return {
    id: `pi_${++n}`,
    payeeId: p?.id ?? null,
    currency: "USD",
    payout: p?.verifiedPayout ?? { method: "paypal_email", receiver: "unknown@example.com", currency: "USD" },
    createdAt: NOW,
    createdBy: "sara",
    status: "PENDING_APPROVAL",
    ...over,
  };
}

export { daysAgo };
