// Demo data for Sara's small design studio. Fictional people and businesses, realistic small amounts.
import { sql } from "drizzle-orm";
import type { DB } from "./index";
import { schema } from "./index";

const DAY = 86_400_000;

export async function resetAndSeed(db: DB, now = new Date()) {
  const ago = (d: number) => new Date(now.getTime() - d * DAY);
  const ahead = (d: number) => new Date(now.getTime() + d * DAY);

  // audit_events is append-only by trigger; a demo reset is the one place it's cleared, via TRUNCATE.
  await db.execute(sql`TRUNCATE audit_events, approvals, flags, payout_batches, payee_change_requests, payment_intents,
    invoices, inbox_items, webhook_events, auth_challenges, passkeys, payees, clients, users, ai_usage, demo_state RESTART IDENTITY CASCADE`);

  await db.insert(schema.users).values([
    { id: "sara", name: "Sara Ahmed", email: "sara@demo.finwarden.app", role: "owner" },
    { id: "omar", name: "Omar Siddiq", email: "omar@demo.finwarden.app", role: "approver" },
  ]);

  await db.insert(schema.clients).values([
    { id: "ali", name: "Ali Raza", email: "ali.raza@example.com", country: "US", language: "en" },
    { id: "bright", name: "Bright Bakery", email: "orders@brightbakery.example", country: "US", language: "en" },
    { id: "nova", name: "Nova Apps", email: "finance@novaapps.example", country: "ES", language: "es" },
    { id: "maple", name: "Maple & Co Café", email: "hello@maplecafe.example", country: "US", language: "en" },
    { id: "riverside", name: "Riverside Yoga", email: "studio@riversideyoga.example", country: "US", language: "en" },
  ]);

  await db.insert(schema.payees).values([
    {
      id: "acme",
      name: "Acme Ltd",
      type: "supplier",
      verifiedPayout: { method: "paypal_email", receiver: "billing@acme.example", currency: "USD" },
      payoutVerifiedAt: ago(300),
      contacts: { phones: ["+1 415 555 0100"], emails: ["billing@acme.example"], domains: ["acme.example"] },
      createdAt: ago(300),
      firstPaidAt: ago(290),
      typicalMedian: 9_500,
      typicalMax: 15_000,
    },
    {
      id: "printhub",
      name: "PrintHub",
      type: "supplier",
      verifiedPayout: { method: "paypal_email", receiver: "pay@printhub.example", currency: "USD" },
      payoutVerifiedAt: ago(200),
      contacts: { phones: ["+1 212 555 0199"], emails: ["pay@printhub.example"], domains: ["printhub.example"] },
      createdAt: ago(200),
      firstPaidAt: ago(190),
      typicalMedian: 5_500,
      typicalMax: 9_000,
    },
    {
      id: "hamza",
      name: "Hamza Khan",
      type: "freelancer",
      country: "PK",
      verifiedPayout: { method: "paypal_email", receiver: "hamza.design@example.com", currency: "USD" },
      payoutVerifiedAt: ago(150),
      contacts: { phones: ["+92 300 555 0101"], emails: ["hamza.design@example.com"], domains: [] },
      createdAt: ago(150),
      firstPaidAt: ago(140),
      typicalMedian: 15_000,
      typicalMax: 24_000,
    },
    {
      id: "lina",
      name: "Lina Park",
      type: "freelancer",
      verifiedPayout: { method: "paypal_email", receiver: "lina.park@example.com", currency: "USD" },
      payoutVerifiedAt: ago(2),
      contacts: { phones: ["+1 718 555 0142"], emails: ["lina.park@example.com"], domains: [] },
      createdAt: ago(2),
      firstPaidAt: null,
    },
    {
      id: "omar-pay",
      name: "Omar Siddiq",
      type: "employee",
      verifiedPayout: { method: "paypal_email", receiver: "omar@sarastudio.example", currency: "USD" },
      payoutVerifiedAt: ago(400),
      contacts: { phones: ["+1 646 555 0123"], emails: ["omar@sarastudio.example"], domains: ["sarastudio.example"] },
      createdAt: ago(400),
      firstPaidAt: ago(380),
      paydayDayOfMonth: 15,
      typicalMedian: 115_000,
      typicalMax: 115_000,
    },
  ]);

  await db.insert(schema.invoices).values([
    { id: "inv_ali_1", clientId: "ali", number: "SS-1041", description: "Logo design", amount: 32_000, status: "SENT", issuedAt: ago(40), dueAt: ago(10), reminderStage: 1, lastReminderAt: ago(5) },
    { id: "inv_bright_1", clientId: "bright", number: "SS-1042", description: "Menu redesign", amount: 18_000, status: "PAID", issuedAt: ago(35), dueAt: ago(5), paidAt: ago(6) },
    { id: "inv_nova_1", clientId: "nova", number: "SS-1043", description: "App store screenshots", amount: 45_000, status: "SENT", issuedAt: ago(10), dueAt: ahead(4) },
    { id: "inv_ali_2", clientId: "ali", number: "SS-1044", description: "Business cards", amount: 12_000, status: "SENT", issuedAt: ago(3), dueAt: ahead(11) },
    { id: "inv_bright_2", clientId: "bright", number: "SS-1045", description: "Social media kit", amount: 26_000, status: "SENT", issuedAt: ago(50), dueAt: ago(20), reminderStage: 2, lastReminderAt: ago(3) },
    { id: "inv_maple_1", clientId: "maple", number: "SS-1046", description: "Café window signage", amount: 15_500, status: "PAID", issuedAt: ago(28), dueAt: ago(14), paidAt: ago(15) },
    { id: "inv_river_1", clientId: "riverside", number: "SS-1047", description: "Class schedule poster", amount: 9_500, status: "SENT", issuedAt: ago(5), dueAt: ahead(9) },
    { id: "inv_maple_2", clientId: "maple", number: "SS-1048", description: "Loyalty card design", amount: 14_000, status: "SENT", issuedAt: ago(2), dueAt: ahead(18) },
  ]);

  // Past payments, so history and "usual amount" checks look like a real business.
  await db.insert(schema.paymentIntents).values([
    { id: "pi_hist_1", payeeId: "hamza", payeeName: "Hamza Khan", amount: 15_000, currency: "USD", payout: { method: "paypal_email", receiver: "hamza.design@example.com", currency: "USD" }, invoiceNumber: "HK-0298", memo: "Icon set", status: "SENT", createdBy: "sara", createdAt: ago(21) },
    { id: "pi_hist_2", payeeId: "printhub", payeeName: "PrintHub", amount: 5_200, currency: "USD", payout: { method: "paypal_email", receiver: "pay@printhub.example", currency: "USD" }, invoiceNumber: "PH-8790", memo: "Flyer print run", status: "SENT", createdBy: "sara", createdAt: ago(18) },
    { id: "pi_hist_3", payeeId: "acme", payeeName: "Acme Ltd", amount: 9_500, currency: "USD", payout: { method: "paypal_email", receiver: "billing@acme.example", currency: "USD" }, invoiceNumber: "INV-3290", memo: "Paper stock", status: "SENT", createdBy: "sara", createdAt: ago(12) },
    { id: "pi_hist_4", payeeId: "omar-pay", payeeName: "Omar Siddiq", amount: 115_000, currency: "USD", payout: { method: "paypal_email", receiver: "omar@sarastudio.example", currency: "USD" }, memo: "October salary", status: "SENT", createdBy: "sara", createdAt: ago(28) },
  ]);

  // A little history so the activity feed and audit log aren't empty on a fresh demo.
  const ev = (daysAgo: number, actorType: "user" | "agent" | "system" | "paypal", actorId: string, action: string, subjectId: string, why: string, ruleIds: string[] = []) => ({
    at: ago(daysAgo),
    actorType,
    actorId,
    action,
    subjectType: action.split(".")[0],
    subjectId,
    ruleIds,
    why,
    data: { seeded: true },
  });
  await db.insert(schema.auditEvents).values([
    ev(28, "system", "executor", "payout.submitted", "pi_hist_4", "Sent Omar Siddiq's October salary ($1,150.00) through PayPal Payouts after two passkey approvals."),
    ev(21, "system", "executor", "payout.submitted", "pi_hist_1", "Sent $150.00 to Hamza Khan for the icon set through PayPal Payouts. Every check passed moments before sending."),
    ev(15, "paypal", "checkout", "invoice.paid", "inv_maple_1", "Maple & Co Café paid invoice SS-1046: PayPal confirmed a completed capture of $155.00."),
    ev(9, "agent", "fraud-guard", "inbox.checked", "seed", "Checked a message: likely scam. It claims to be from PayPal but asks you to call +1 888 555 0147. Don't call it; check your account at paypal.com instead.", ["R8"]),
    ev(6, "paypal", "checkout", "invoice.paid", "inv_bright_1", "Bright Bakery paid invoice SS-1042: PayPal confirmed a completed capture of $180.00."),
    ev(3, "agent", "collections", "invoice.reminded", "inv_bright_2", "Sent a firm reminder to Bright Bakery for SS-1045 ($260.00, 20 days overdue)."),
  ]);

  await db.insert(schema.demoState).values({ id: "singleton", clockOffsetMs: 0 });
}
