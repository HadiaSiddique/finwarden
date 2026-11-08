// Demo data for Sara's design studio. Fictional people and businesses only.
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
      typicalMedian: 60_000,
      typicalMax: 90_000,
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
      typicalMedian: 25_000,
      typicalMax: 40_000,
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
      typicalMedian: 50_000,
      typicalMax: 80_000,
    },
    {
      id: "lina",
      name: "Lina Park",
      type: "freelancer",
      verifiedPayout: { method: "venmo", receiver: "+1 718 555 0142", currency: "USD", country: "US" },
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
      typicalMedian: 300_000,
      typicalMax: 300_000,
    },
  ]);

  await db.insert(schema.invoices).values([
    { id: "inv_ali_1", clientId: "ali", number: "SS-1041", description: "Logo design", amount: 80_000, status: "SENT", issuedAt: ago(40), dueAt: ago(10), reminderStage: 1, lastReminderAt: ago(5) },
    { id: "inv_bright_1", clientId: "bright", number: "SS-1042", description: "Menu redesign", amount: 45_000, status: "PAID", issuedAt: ago(35), dueAt: ago(5), paidAt: ago(6) },
    { id: "inv_nova_1", clientId: "nova", number: "SS-1043", description: "App store screenshots", amount: 120_000, status: "SENT", issuedAt: ago(10), dueAt: ahead(4) },
    { id: "inv_ali_2", clientId: "ali", number: "SS-1044", description: "Business cards", amount: 30_000, status: "SENT", issuedAt: ago(3), dueAt: ahead(11) },
    { id: "inv_bright_2", clientId: "bright", number: "SS-1045", description: "Social media kit", amount: 65_000, status: "SENT", issuedAt: ago(50), dueAt: ago(20), reminderStage: 2, lastReminderAt: ago(3) },
  ]);

  await db.insert(schema.demoState).values({ id: "singleton", clockOffsetMs: 0 });
}
