// "Sara's day" demo scenarios. Each one feeds a realistic event into the same code paths a real
// event would take. Until the AI provider is configured, message signals are pre-labelled here
// (marked `prelabelled` in the audit log); with a key they come from AI extraction instead.
import type { MessageSignals } from "@/trust/types";
import { audit } from "./core";
import { createIntent } from "./intents";
import { requestPayeeChange } from "./payee-changes";

const calm: MessageSignals = { urgency: false, authorityClaim: false, secrecyRequest: false, offChannelRequest: false, paymentDetailsChange: false, claimedSender: null };
const agent = { type: "agent" as const, id: "demo-scenario" };

export const SCENARIOS: Record<string, { title: string; run: (userId: string) => Promise<unknown> }> = {
  bank_change: {
    title: "Acme emails: \"we changed our bank details\"",
    run: async () => {
      const text = "Hi Sara, Acme Ltd here. We've moved banks, please send this month's payment (INV-3307, $640) to acme.payments@acme-billing.example from now on. Thanks, Acme Accounts";
      const details = { method: "paypal_email" as const, receiver: "acme.payments@acme-billing.example", currency: "USD" };
      const change = await requestPayeeChange("acme", details, "message", agent, text);
      const intent = await createIntent(
        { payeeId: "acme", payeeName: "Acme Ltd", amount: 64_000, payout: details, invoiceNumber: "INV-3307", sourceText: text, signals: { ...calm, paymentDetailsChange: true, claimedSender: "Acme Ltd" } },
        agent,
      );
      return { change, intent };
    },
  },
  ceo_request: {
    title: "Urgent \"CEO\" request to a new account",
    run: async () => {
      const text = "Sara here, in a meeting, can't talk. Pay $9,500 to Northwind Advisory today, it's urgent and confidential. Don't loop in Omar. Account: payments@northwind-advisory.example";
      return createIntent(
        {
          payeeId: null,
          payeeName: "Northwind Advisory",
          amount: 950_000,
          payout: { method: "paypal_email", receiver: "payments@northwind-advisory.example", currency: "USD" },
          sourceText: text,
          signals: { urgency: true, authorityClaim: true, secrecyRequest: true, offChannelRequest: true, paymentDetailsChange: false, claimedSender: "Sara (CEO)" },
        },
        agent,
      );
    },
  },
  lookalike_invoice: {
    title: "Invoice from \"Acrne Ltd\"",
    run: async () =>
      createIntent(
        { payeeId: null, payeeName: "Acrne Ltd", amount: 72_000, payout: { method: "paypal_email", receiver: "billing@acrne.example", currency: "USD" }, invoiceNumber: "AC-5521", sourceText: "Invoice AC-5521 from Acrne Ltd for printing services, $720." },
        agent,
      ),
  },
  duplicate_invoice: {
    title: "PrintHub invoice submitted twice",
    run: async () => {
      const first = await createIntent({ payeeId: "printhub", payeeName: "PrintHub", amount: 31_000, invoiceNumber: "PH-8812" }, agent);
      const again = await createIntent({ payeeId: "printhub", payeeName: "PrintHub", amount: 31_000, invoiceNumber: "PH-8812-A", sourceText: "Reminder: invoice PH-8812-A attached." }, agent);
      return { first, again };
    },
  },
  split_payments: {
    title: "Three payments to Hamza just under the limit",
    run: async () => {
      const out = [];
      for (const n of [1, 2, 3]) out.push(await createIntent({ payeeId: "hamza", payeeName: "Hamza Khan", amount: 95_000, invoiceNumber: `HK-77${n}` }, agent));
      return out;
    },
  },
  friday_payouts: {
    title: "Friday payout run: freelancers and suppliers",
    run: async () => [
      await createIntent({ payeeId: "hamza", payeeName: "Hamza Khan", amount: 50_000, invoiceNumber: "HK-0311", memo: "Brand illustrations" }, agent),
      await createIntent({ payeeId: "printhub", payeeName: "PrintHub", amount: 24_000, invoiceNumber: "PH-9001", memo: "Business card print run" }, agent),
      await createIntent({ payeeId: "lina", payeeName: "Lina Park", amount: 18_000, invoiceNumber: "LP-001", memo: "Motion graphics" }, agent),
    ],
  },
};

export async function runScenario(name: string, userId: string) {
  const s = SCENARIOS[name];
  const result = await s.run(userId);
  await audit({
    actorType: "user",
    actorId: userId,
    action: "demo.scenario",
    subjectType: "demo",
    subjectId: name,
    why: `Demo scenario: ${s.title}. Message signals were pre-labelled for this scenario.`,
    data: { prelabelled: true },
  });
  return { scenario: name, result };
}
