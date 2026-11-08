import { describe, expect, it } from "vitest";
import { ACME, HAMZA, NOW, OMAR, PAYEES, daysAgo, intent, payee } from "./fixtures";
import { looksLike } from "./lookalike";
import { contactMismatch, evaluatePayment, type RuleContext } from "./rules";
import { DEFAULT_THRESHOLDS, type MessageSignals, type PaymentIntent } from "./types";

function ctx(i: PaymentIntent, over: Partial<RuleContext> = {}): RuleContext {
  return {
    now: NOW,
    intent: i,
    payee: PAYEES.find((p) => p.id === i.payeeId) ?? null,
    allPayees: PAYEES,
    recentIntents: [],
    thresholds: DEFAULT_THRESHOLDS,
    ...over,
  };
}

const ids = (c: RuleContext) => evaluatePayment(c).map((f) => `${f.ruleId}:${f.severity}`);

const calm: MessageSignals = {
  urgency: false,
  authorityClaim: false,
  secrecyRequest: false,
  offChannelRequest: false,
  paymentDetailsChange: false,
  claimedSender: null,
};

describe("normal payments", () => {
  it("raises nothing for a routine payment to a known payee", () => {
    expect(ids(ctx(intent({ payeeName: "Acme Ltd", amount: 60_000, invoiceNumber: "A-101" })))).toEqual([]);
  });

  it("does not flag a monthly retainer with a new invoice number", () => {
    const last = intent({ payeeName: "Hamza Khan", amount: 50_000, invoiceNumber: "H-10", createdAt: daysAgo(30) });
    const now = intent({ payeeName: "Hamza Khan", amount: 50_000, invoiceNumber: "H-11" });
    expect(ids(ctx(now, { recentIntents: [last] }))).toEqual([]);
  });
});

describe("R1 payout details changed", () => {
  it("holds a payment to new bank details", () => {
    const i = intent({ payeeName: "Acme Ltd", amount: 60_000, payout: { method: "bank", receiver: "GB29 NWBK 6016 1331 9268 19", currency: "USD" } });
    expect(ids(ctx(i))).toContain("R1:red");
  });
});

describe("R2 lookalikes", () => {
  it.each(["Acrne Ltd", "Аcme Ltd" /* Cyrillic А */, "ACME LTD.", "Acme Limited"])("handles %s", (name) => {
    const m = looksLike(name, "Acme Ltd");
    if (/acme (ltd\.?|limited)/i.test(name)) expect(m).toBeNull();
    else expect(m?.reason).toBe("confusable");
  });

  it("catches swapped letters", () => {
    expect(looksLike("Hamza Kahn", "Hamza Khan")?.reason).toBe("near-spelling");
  });

  it("does not treat a different brand's domain as imitation", () => {
    const i = intent({ payeeName: "Acme Labs", amount: 30_000, payeeId: null, payout: { method: "paypal_email", receiver: "pay@acmelabs.example", currency: "USD" } });
    expect(ids(ctx(i, { payee: null }))).not.toContain("R2:red");
  });

  it("does not confuse genuinely different businesses", () => {
    expect(looksLike("Acme Labs", "Acme Ltd")).toBeNull();
    expect(looksLike("Nova Apps", "Nova Ads")).toBeNull();
    expect(looksLike("PrintHub", "PaintHub Studio")).toBeNull();
  });

  it("flags a new payee named like an existing one", () => {
    const i = intent({ payeeName: "Acrne Ltd", amount: 60_000, payeeId: null, payout: { method: "paypal_email", receiver: "billing@acrne.com", currency: "USD" } });
    expect(ids(ctx(i, { payee: null }))).toContain("R2:red");
  });

  it("flags a receiving email on a lookalike domain", () => {
    const i = intent({ payeeName: "Acme Ltd", amount: 60_000, payout: { method: "paypal_email", receiver: "billing@acme-payments.com", currency: "USD" } });
    expect(ids(ctx(i))).toContain("R2:red");
  });
});

describe("R3 duplicates", () => {
  it("blocks the same invoice number twice", () => {
    const first = intent({ payeeName: "Acme Ltd", amount: 60_000, invoiceNumber: "INV-0042", createdAt: daysAgo(3) });
    const again = intent({ payeeName: "Acme Ltd", amount: 60_000, invoiceNumber: "inv 42" });
    expect(ids(ctx(again, { recentIntents: [first] }))).toContain("R3:red");
  });

  it("blocks an altered copy of an invoice for the same amount", () => {
    const first = intent({ payeeName: "Acme Ltd", amount: 60_000, invoiceNumber: "INV-1042", createdAt: daysAgo(20) });
    const again = intent({ payeeName: "Acme Ltd", amount: 60_000, invoiceNumber: "INV-1042-A" });
    expect(ids(ctx(again, { recentIntents: [first] }))).toContain("R3:red");
  });

  it("treats a slash suffix as an altered copy", () => {
    const first = intent({ payeeName: "Acme Ltd", amount: 60_000, invoiceNumber: "INV-2183", createdAt: daysAgo(20) });
    const again = intent({ payeeName: "Acme Ltd", amount: 60_000, invoiceNumber: "INV-2183/1" });
    expect(ids(ctx(again, { recentIntents: [first] }))).toContain("R3:red");
  });

  it("lets the next invoice in sequence through", () => {
    const first = intent({ payeeName: "Acme Ltd", amount: 60_000, invoiceNumber: "INV-1042", createdAt: daysAgo(20) });
    const next = intent({ payeeName: "Acme Ltd", amount: 60_000, invoiceNumber: "INV-1043" });
    expect(ids(ctx(next, { recentIntents: [first] }))).toEqual([]);
  });
});

describe("R4 split payments", () => {
  it("catches payments that each stay under the limit", () => {
    const earlier = [1, 2, 3].map((h) =>
      intent({ payeeName: "Hamza Khan", amount: 45_000, createdAt: new Date(NOW.getTime() - h * 3_600_000), invoiceNumber: `S-${h}` }),
    );
    const i = intent({ payeeName: "Hamza Khan", amount: 45_000, invoiceNumber: "S-9" });
    expect(ids(ctx(i, { recentIntents: earlier }))).toContain("R4:red");
  });
});

describe("R5 payroll diversion", () => {
  it("holds an employee bank change days before payday", () => {
    const i = intent({ payeeName: "Omar Siddiq", amount: 300_000, payout: { method: "bank", receiver: "PK36SCBL0000001123456702", currency: "USD" } });
    const c = ctx(i, { now: new Date("2026-11-12T09:00:00Z"), payee: OMAR });
    expect(ids(c)).toEqual(expect.arrayContaining(["R1:red", "R5:red"]));
  });
});

describe("R6 new payee", () => {
  it("warns on a first payment", () => {
    const fresh = payee({ id: "lina", name: "Lina Park", type: "freelancer", firstPaidAt: null, createdAt: daysAgo(2) });
    const i = intent({ payeeName: "Lina Park", amount: 20_000, payeeId: "lina", payout: fresh.verifiedPayout! });
    expect(ids(ctx(i, { payee: fresh, allPayees: [...PAYEES, fresh] }))).toEqual(["R6:amber"]);
  });
});

describe("R7 pressure and impersonation", () => {
  it("blocks an urgent CEO request to a new account", () => {
    const i = intent({ payeeName: "Global Consulting LLC", amount: 950_000, payeeId: null });
    const signals = { ...calm, urgency: true, authorityClaim: true, secrecyRequest: true, claimedSender: "Sara (CEO)" };
    expect(ids(ctx(i, { payee: null, signals }))).toContain("R7:red");
  });

  it("only warns when a known payee is merely in a hurry", () => {
    const i = intent({ payeeName: "Acme Ltd", amount: 60_000 });
    expect(ids(ctx(i, { signals: { ...calm, urgency: true } }))).toEqual(["R7:amber"]);
  });
});

describe("R8 contact mismatch", () => {
  it("flags a 'PayPal' invoice with a phone number to call", () => {
    const f = contactMismatch({ phones: ["+1 (888) 555-0147"], emails: [], urls: [] }, "PayPal", PAYEES);
    expect(f?.severity).toBe("red");
  });

  it("flags a supplier email with an unknown phone number", () => {
    const f = contactMismatch({ phones: ["+1 415 555 9999"], emails: [], urls: [] }, "Acme Ltd", PAYEES);
    expect(f?.ruleId).toBe("R8");
  });

  it("accepts the supplier's own contacts", () => {
    const f = contactMismatch({ phones: ["(415) 555-0100"], emails: ["billing@acme.com"], urls: ["https://www.acme.com/invoices/42"] }, "Acme Ltd", PAYEES);
    expect(f).toBeNull();
  });
});

describe("R9 amount anomaly", () => {
  it("warns when far above the usual amount", () => {
    expect(ids(ctx(intent({ payeeName: "Acme Ltd", amount: 400_000 })))).toContain("R9:amber");
  });
});

it("fixtures stay consistent", () => {
  expect(ACME.verifiedPayout?.receiver).toBe("billing@acme.com");
  expect(HAMZA.type).toBe("freelancer");
});
