// Labelled evaluation cases. Synthetic, built from documented fraud patterns:
// FBI IC3 2025 (business email compromise, account takeover), the Arup deepfake-CFO case,
// PayPal's list of common scams, and KnowBe4's report on PayPal invoice phishing.
// The split is fixed by a seed so the held-out "test" set is frozen before any tuning.
import { ACME, HAMZA, NOW, OMAR, PAYEES, PRINTHUB, payee } from "../src/trust/fixtures";
import type { MessageContacts, MessageSignals, PayeeRecord, PayoutDetails } from "../src/trust/types";

export interface CaseIntent {
  payeeId: string | null;
  payeeName: string;
  amount: number;
  payout?: PayoutDetails;
  invoiceNumber?: string;
  hoursAgo?: number;
}

export interface EvalCase {
  id: string;
  split: "train" | "test";
  label: "scam" | "normal";
  pattern: string;
  lang: string;
  kind: "payment" | "message";
  description: string;
  now?: string;
  intent?: CaseIntent;
  history?: CaseIntent[];
  extraPayees?: PayeeRecord[];
  payeeOverride?: Partial<PayeeRecord>;
  message?: string;
  signals?: MessageSignals;
  contacts?: MessageContacts;
}

function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261109);
const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
const between = (lo: number, hi: number) => Math.round((lo + rand() * (hi - lo)) / 100) * 100;

const calm: MessageSignals = { urgency: false, authorityClaim: false, secrecyRequest: false, offChannelRequest: false, paymentDetailsChange: false, claimedSender: null };
const noContacts: MessageContacts = { phones: [], emails: [], urls: [] };
const email = (receiver: string): PayoutDetails => ({ method: "paypal_email", receiver, currency: "USD" });

type Draft = Omit<EvalCase, "id" | "split">;
const drafts: Draft[] = [];
const add = (d: Draft) => drafts.push(d);

// ---------- Scams ----------

// R1: supplier "changed bank details" (BEC, IC3 2025: $3.05B).
for (const [p, receiver] of [
  [ACME, "acme.billing@protonmail.example"], [ACME, "payments@acme-finance.example"], [PRINTHUB, "printhub.accounts@gmail.example"],
  [PRINTHUB, "pay@printhub-billing.example"], [HAMZA, "hamza.k.payments@example.net"], [ACME, "remit@acme.example.co"],
  [PRINTHUB, "finance@print-hub.example"], [HAMZA, "khan.hamza.pay@example.org"], [ACME, "accounts@acmeltd.example"], [PRINTHUB, "billing@printhub.example.net"],
] as const) {
  add({ label: "scam", pattern: "bank_detail_change", lang: "en", kind: "payment", description: `${p.name} payment redirected to ${receiver}`,
    intent: { payeeId: p.id, payeeName: p.name, amount: between(20_000, 90_000), payout: email(receiver), invoiceNumber: `INV-${between(2000, 9000) / 100}` },
    signals: { ...calm, paymentDetailsChange: true, claimedSender: p.name } });
}

// R2: lookalike payee names, sent to new accounts.
for (const name of ["Acrne Ltd", "Аcme Ltd", "Acme Ltd.", "Acmee Ltd", "PrlntHub", "Pr1ntHub", "PrintHub", "Hamza Kahn", "Harnza Khan", "Ηamza Khan"]) {
  const isExact = name === "Acme Ltd." || name === "PrintHub";
  // Exact same name on a brand-new payee record is caught by R2 only if it looks different; skip true duplicates here.
  if (isExact) continue;
  add({ label: "scam", pattern: "lookalike_payee", lang: "en", kind: "payment", description: `New payee "${name}" imitating an existing one`,
    intent: { payeeId: null, payeeName: name, amount: between(30_000, 95_000), payout: email(`billing@${name.toLowerCase().replace(/[^a-z0-9]/g, "")}.example`) } });
}

// R2: known payee name, receiving address on a lookalike domain.
for (const [p, receiver] of [
  [ACME, "billing@acme-payments.com"], [ACME, "billing@acme.co"], [ACME, "billing@acrne.com"],
  [PRINTHUB, "pay@printhub.co"], [PRINTHUB, "pay@prlnthub.io"], [PRINTHUB, "pay@printhub-invoices.io"],
] as const) {
  add({ label: "scam", pattern: "lookalike_domain", lang: "en", kind: "payment", description: `${p.name} paid to ${receiver}`,
    intent: { payeeId: p.id, payeeName: p.name, amount: between(20_000, 80_000), payout: email(receiver) } });
}

// R3: duplicate and altered-copy invoices.
for (let i = 0; i < 8; i++) {
  const p = pick([ACME, PRINTHUB, HAMZA]);
  const n = between(100_000, 900_000) / 100;
  const altered = pick([`INV-${n}`, `INV-${n}-A`, `INV ${n}`, `inv-0${n}`, `INV-${n}B`, `INV-${n}/1`]);
  const amount = between(20_000, 80_000);
  add({ label: "scam", pattern: "duplicate_invoice", lang: "en", kind: "payment", description: `Invoice INV-${n} re-submitted as ${altered}`,
    intent: { payeeId: p.id, payeeName: p.name, amount, invoiceNumber: altered },
    history: [{ payeeId: p.id, payeeName: p.name, amount, invoiceNumber: `INV-${n}`, hoursAgo: between(24, 40 * 24) / 100 * 100 }] });
}

// R4: split payments just under the two-person limit.
for (let i = 0; i < 6; i++) {
  const p = pick([HAMZA, PRINTHUB, ACME]);
  const count = 2 + Math.floor(rand() * 3);
  const each = between(52_000, 98_000);
  add({ label: "scam", pattern: "split_payments", lang: "en", kind: "payment", description: `${count + 1} payments of ~$${each / 100} to ${p.name} within 72h`,
    intent: { payeeId: p.id, payeeName: p.name, amount: each, invoiceNumber: `S-${i}-0` },
    history: Array.from({ length: count }, (_, k) => ({ payeeId: p.id, payeeName: p.name, amount: between(52_000, 98_000), invoiceNumber: `S-${i}-${k + 1}`, hoursAgo: 2 + k * 10 })) });
}

// R5: payroll diversion right before payday (Omar is paid on the 15th; NOW is Nov 10).
for (let i = 0; i < 5; i++) {
  add({ label: "scam", pattern: "payroll_diversion", lang: "en", kind: "payment", description: "Employee pay redirected days before payday",
    now: `2026-11-${10 + i}T09:00:00Z`,
    intent: { payeeId: OMAR.id, payeeName: OMAR.name, amount: 300_000, payout: email(`omar.siddiq${i}@example.net`) },
    signals: { ...calm, paymentDetailsChange: true, claimedSender: OMAR.name } });
}

// R7: CEO / boss impersonation (Arup: HK$200M in 15 transfers).
const ceoMessages: [string, string][] = [
  ["en", "Sara here. I'm in a meeting, can't talk. Pay $9,500 to Global Consulting today, it's urgent and confidential. Don't tell Omar."],
  ["en", "This is the CEO. Wire the deposit to our new partner before 3pm or we lose the deal. Keep this between us."],
  ["en", "Hi, it's Sara from my personal number. Urgent: the auditor needs a payment to this new account in the next hour."],
  ["en", "Board approved. Please process payment to Northwind Advisory immediately, I'll explain later. Use WhatsApp only."],
  ["ur", "سارہ بول رہی ہوں، میٹنگ میں ہوں۔ فوراً اس نئے اکاؤنٹ میں 8,000 ڈالر بھیج دیں، کسی کو مت بتائیں۔"],
  ["ar", "هنا المدير التنفيذي. حوّل المبلغ إلى الحساب الجديد خلال ساعة، الأمر عاجل وسري."],
  ["es", "Soy Sara. Necesito que pagues hoy mismo a esta nueva cuenta, es urgente y confidencial. No llames, escríbeme por WhatsApp."],
  ["en", "Omar, the CEO asked me to get this paid now. New vendor, details attached. Please don't delay."],
];
ceoMessages.forEach(([lang, text], i) => {
  add({ label: "scam", pattern: "ceo_impersonation", lang, kind: "payment", description: `Urgent "boss" request to a new account (${lang})`,
    intent: { payeeId: null, payeeName: pick(["Global Consulting LLC", "Northwind Advisory", "Apex Partners", "Blue Harbor Trading"]), amount: between(500_000, 990_000) },
    message: text,
    signals: { urgency: true, authorityClaim: true, secrecyRequest: /confidential|don't tell|keep this|مت بتائیں|سري|confidencial/i.test(text), offChannelRequest: /whatsapp|personal number|can't talk/i.test(text), paymentDetailsChange: false, claimedSender: i === 7 ? "the CEO" : "Sara (CEO)" } });
});

// R8: real-looking PayPal invoices with a scammer's phone number (KnowBe4 / IT Security Guru, Oct 2025).
for (const [lang, phone, text] of [
  ["en", "+1 (888) 555-0147", "PayPal invoice: Norton LifeLock renewal $499.99. If you did not authorise this charge, call +1 (888) 555-0147 within 24 hours."],
  ["en", "1-808-555-0199", "You've been billed $823.00 for a Bitcoin purchase. To cancel or dispute, call PayPal support at 1-808-555-0199."],
  ["en", "+1 877 555 0123", "Invoice from PayPal Billing Dept. Geek Squad annual plan $389. Questions? Call +1 877 555 0123."],
  ["es", "+1 866 555 0111", "Factura de PayPal: cargo de $650 por iPhone. Si no reconoce el cargo, llame al +1 866 555 0111."],
  ["en", "+44 20 5550 1234", "PayPal: Your account will be charged £299. Not you? Call our fraud team on +44 20 5550 1234."],
  ["ur", "+92 21 555 0100", "پے پال انوائس: 700 ڈالر کی ادائیگی۔ اگر یہ آپ نے نہیں کی تو فوراً +92 21 555 0100 پر کال کریں۔"],
] as const) {
  add({ label: "scam", pattern: "paypal_invoice_phone", lang, kind: "message", description: "PayPal-branded invoice with a call-back number", message: text,
    signals: { ...calm, urgency: true, claimedSender: "PayPal" }, contacts: { phones: [phone], emails: [], urls: [] } });
}

// R8: messages claiming to be a known supplier with unknown contact details.
for (const [contacts, text] of [
  [{ phones: ["+1 415 555 9999"], emails: [], urls: [] }, "Acme Ltd here, please call our new accounts line +1 415 555 9999 to confirm payment."],
  [{ phones: [], emails: ["accounts@acme-ltd.example"], urls: [] }, "From Acme Ltd: please send remittance to accounts@acme-ltd.example from now on."],
  [{ phones: [], emails: [], urls: ["https://acme-invoices.example/pay/7741"] }, "Acme Ltd: your invoice is ready, pay here https://acme-invoices.example/pay/7741"],
  [{ phones: ["+1 212 555 0000"], emails: [], urls: [] }, "PrintHub billing: our number changed to +1 212 555 0000, call to update your payment method."],
  [{ phones: [], emails: [], urls: ["http://printhub.example.payments-secure.example/login"] }, "PrintHub: verify your account to avoid service interruption http://printhub.example.payments-secure.example/login"],
] as const) {
  const sender = text.startsWith("PrintHub") ? "PrintHub" : "Acme Ltd";
  add({ label: "scam", pattern: "supplier_contact_mismatch", lang: "en", kind: "message", description: `Message as ${sender} with unknown contact`, message: text,
    signals: { ...calm, claimedSender: sender }, contacts: { ...contacts, phones: [...contacts.phones], emails: [...contacts.emails], urls: [...contacts.urls] } });
}

// ---------- Normal ----------

// Routine payments to known payees at usual amounts.
for (let i = 0; i < 25; i++) {
  const p = pick([ACME, PRINTHUB, HAMZA]);
  add({ label: "normal", pattern: "routine_payment", lang: "en", kind: "payment", description: `Routine payment to ${p.name}`,
    intent: { payeeId: p.id, payeeName: p.name, amount: p === ACME ? between(40_000, 90_000) : between(15_000, 70_000), invoiceNumber: `R-${i + 100}` } });
}

// Monthly retainers with sequential invoice numbers and the same amount.
for (let i = 0; i < 12; i++) {
  const p = pick([HAMZA, PRINTHUB]);
  const n = 200 + i * 7;
  add({ label: "normal", pattern: "monthly_retainer", lang: "en", kind: "payment", description: `Retainer ${p.name}, next invoice in sequence`,
    intent: { payeeId: p.id, payeeName: p.name, amount: 50_000, invoiceNumber: `RT-${n + 1}` },
    history: [{ payeeId: p.id, payeeName: p.name, amount: 50_000, invoiceNumber: `RT-${n}`, hoursAgo: (28 + Math.floor(rand() * 5)) * 24 }] });
}

// New payees with names similar to, but genuinely different from, existing ones.
for (const name of ["Acme Labs", "Acme Design Co", "Apex Ltd", "Nova Ads", "PrintHouse", "PaintHub Studio", "Hamid Khan", "Hamza Ali", "Acorn Ltd", "Printful Hub"]) {
  add({ label: "normal", pattern: "similar_but_different", lang: "en", kind: "payment", description: `New, genuinely different payee "${name}"`,
    intent: { payeeId: null, payeeName: name, amount: between(10_000, 60_000), payout: email(`pay@${name.toLowerCase().replace(/[^a-z]/g, "")}.example`) } });
}

// Bank changes that were properly verified weeks ago.
for (let i = 0; i < 8; i++) {
  const p = pick([ACME, PRINTHUB, HAMZA]);
  const details = email(`new-${i}@${p.contacts.domains[0] ?? "example.com"}`);
  add({ label: "normal", pattern: "verified_detail_change", lang: "en", kind: "payment", description: `${p.name} paid to details verified 2+ weeks ago`,
    payeeOverride: { verifiedPayout: details, payoutVerifiedAt: new Date(NOW.getTime() - (14 + i) * 86_400_000) },
    intent: { payeeId: p.id, payeeName: p.name, amount: between(20_000, 70_000), payout: details } });
}

// Known payees who are in a hurry (warn, don't block).
const hurried: [string, string][] = [
  ["en", "Hi Sara, could you pay invoice R-88 today? We're closing our books tonight. Thanks!"],
  ["en", "Reminder: invoice due today, appreciate a quick payment."],
  ["es", "Hola Sara, ¿podrías pagar la factura hoy? Cerramos el mes. ¡Gracias!"],
  ["ur", "سارہ، اگر ممکن ہو تو آج انوائس کی ادائیگی کر دیں۔ شکریہ"],
  ["en", "Sorry to chase, any chance the payment goes out before the weekend?"],
  ["ar", "مرحباً سارة، هل يمكن دفع الفاتورة اليوم؟ شكراً"],
  ["en", "Final reminder on last month's invoice, please pay when you can today."],
  ["en", "Need this one settled ASAP if possible, our supplier is waiting."],
  ["en", "Quick one: can you send this today? Same account as always."],
  ["en", "Urgent-ish: please pay by end of day, thank you!"],
];
hurried.forEach(([lang, text], i) => {
  const p = pick([ACME, PRINTHUB, HAMZA]);
  add({ label: "normal", pattern: "hurried_known_payee", lang, kind: "payment", description: `${p.name} asks for payment today (${lang})`, message: text,
    intent: { payeeId: p.id, payeeName: p.name, amount: p === ACME ? between(40_000, 90_000) : between(15_000, 60_000), invoiceNumber: `H-${i}` },
    signals: { ...calm, urgency: true, claimedSender: p.name } });
});

// Messages from suppliers using their own contact details.
for (const [contacts, text, sender] of [
  [{ phones: ["(415) 555-0100"], emails: [], urls: [] }, "Acme Ltd: questions about invoice A-102? Call us on (415) 555-0100.", "Acme Ltd"],
  [{ phones: [], emails: ["billing@acme.com"], urls: [] }, "Acme Ltd: statement attached, reply to billing@acme.com.", "Acme Ltd"],
  [{ phones: [], emails: [], urls: ["https://www.acme.com/invoices/102"] }, "Your Acme invoice: https://www.acme.com/invoices/102", "Acme Ltd"],
  [{ phones: ["+1 212 555 0199"], emails: ["pay@printhub.io"], urls: [] }, "PrintHub: order shipped. Billing questions: +1 212 555 0199 or pay@printhub.io", "PrintHub"],
  [{ phones: [], emails: [], urls: ["https://printhub.io/orders/5531"] }, "PrintHub order 5531 is ready: https://printhub.io/orders/5531", "PrintHub"],
  [{ phones: [], emails: ["hamza.design@gmail.com"], urls: [] }, "Hamza here, sent the final files. Invoice from hamza.design@gmail.com as usual.", "Hamza Khan"],
  [noContacts, "Acme Ltd: thanks for your payment last week!", "Acme Ltd"],
  [noContacts, "PrintHub: your proofs are attached for review.", "PrintHub"],
  [{ phones: ["415.555.0100"], emails: [], urls: [] }, "Acme Ltd office hours changed, same number 415.555.0100.", "Acme Ltd"],
  [{ phones: [], emails: [], urls: ["https://printhub.io/help"] }, "PrintHub help centre: https://printhub.io/help", "PrintHub"],
] as const) {
  add({ label: "normal", pattern: "supplier_own_contacts", lang: "en", kind: "message", description: `Message from ${sender} with known contacts`, message: text,
    signals: { ...calm, claimedSender: sender }, contacts: { phones: [...contacts.phones], emails: [...contacts.emails], urls: [...contacts.urls] } });
}

// Genuine PayPal notifications (no phone numbers to call).
for (const text of [
  "PayPal: You received $450.00 USD from Bright Bakery. Log in to paypal.com to see details.",
  "PayPal: Your invoice SS-1042 was paid.",
  "PayPal: A payout of $500.00 was sent to Hamza Khan.",
  "PayPal: Your monthly statement is ready. Log in to view it.",
  "PayPal: Nova Apps viewed your invoice SS-1043.",
  "PayPal: Recibiste un pago de $1,200.00 USD de Nova Apps.",
]) {
  add({ label: "normal", pattern: "genuine_paypal_notice", lang: /Recibiste/.test(text) ? "es" : "en", kind: "message", description: "PayPal notification without call-back number", message: text,
    signals: { ...calm, claimedSender: "PayPal" }, contacts: noContacts });
}

// Two small payments to the same payee in a week, total under the limit.
for (let i = 0; i < 8; i++) {
  const p = pick([HAMZA, PRINTHUB]);
  add({ label: "normal", pattern: "small_repeat_payments", lang: "en", kind: "payment", description: `Two small payments to ${p.name}`,
    intent: { payeeId: p.id, payeeName: p.name, amount: between(10_000, 40_000), invoiceNumber: `SM-${i}-2` },
    history: [{ payeeId: p.id, payeeName: p.name, amount: between(10_000, 40_000), invoiceNumber: `SM-${i}-1`, hoursAgo: 20 + i * 5 }] });
}

// Normal payroll to verified details.
for (let i = 0; i < 7; i++) {
  add({ label: "normal", pattern: "normal_payroll", lang: "en", kind: "payment", description: "Payroll to long-verified details", now: `2026-11-${10 + (i % 5)}T09:00:00Z`,
    intent: { payeeId: OMAR.id, payeeName: OMAR.name, amount: 300_000 } });
}

// Freeze the split: shuffle once with the fixed seed, every case gets an id and split.
const order = drafts.map((d, i) => ({ d, i, r: rand() })).sort((a, b) => a.r - b.r);
export const CASES: EvalCase[] = order.map(({ d }, k) => ({ ...d, id: `c${String(k + 1).padStart(3, "0")}`, split: k % 10 < 3 ? "test" : "train" }));

export const BASE_PAYEES = PAYEES;
export { payee };
