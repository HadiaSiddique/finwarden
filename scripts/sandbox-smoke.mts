// One real call to each PayPal API Finwarden uses, against the sandbox.
// Usage: npx tsx --env-file=.env.local scripts/sandbox-smoke.mts
import { createAndSendInvoice } from "../src/paypal/invoicing";
import { usingStub } from "../src/paypal/mode";
import { createPayoutBatch } from "../src/paypal/payouts";

console.log("Using stub:", usingStub());

try {
  const inv = await createAndSendInvoice({
    number: "SMOKE",
    description: "Finwarden sandbox check",
    amount: 1000,
    currency: "USD",
    dueDate: new Date(Date.now() + 7 * 86_400_000),
    recipientName: "Ali Raza",
    recipientEmail: process.env.PAYPAL_SANDBOX_BUYER_EMAIL || "ali.raza@example.com",
  });
  console.log("Invoicing OK:", inv.id, inv.status);
} catch (e) {
  const err = e as { status?: number; debugId?: string; body?: unknown; message: string };
  console.log("Invoicing FAILED:", err.status, err.message, JSON.stringify(err.body)?.slice(0, 400));
}

try {
  const batch = await createPayoutBatch(`fw-smoke-${Date.now()}`, [
    { intentId: "smoke-1", amount: 100, currency: "USD", payout: { method: "paypal_email", receiver: "hamza.design@example.com", currency: "USD" }, note: "Finwarden sandbox check" },
  ]);
  console.log("Payouts OK:", batch.paypalBatchId, batch.status);
} catch (e) {
  const err = e as { status?: number; body?: unknown; message: string };
  console.log("Payouts FAILED:", err.status, err.message, JSON.stringify(err.body)?.slice(0, 400));
}
