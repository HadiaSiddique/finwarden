import { bigint, boolean, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import type { IntentStatus, MessageContacts, MessageSignals, PayeeContacts, PayeeType, PayoutDetails, RuleId, Severity } from "@/trust/types";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").$type<"owner" | "approver">().notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const passkeys = pgTable("passkeys", {
  id: text("id").primaryKey(), // credential ID, base64url
  userId: text("user_id").notNull().references(() => users.id),
  publicKey: text("public_key").notNull(), // base64url
  counter: bigint("counter", { mode: "number" }).notNull().default(0),
  transports: jsonb("transports").$type<string[]>().notNull().default([]),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const authChallenges = pgTable("auth_challenges", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  purpose: text("purpose").$type<"register" | "approve">().notNull(),
  challenge: text("challenge").notNull(),
  intentId: text("intent_id"),
  intentHash: text("intent_hash"),
  expiresAt: ts("expires_at").notNull(),
  usedAt: ts("used_at"),
});

export const clients = pgTable("clients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  country: text("country").notNull().default("US"),
  language: text("language").notNull().default("en"),
});

export const payees = pgTable("payees", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").$type<PayeeType>().notNull(),
  country: text("country").notNull().default("US"),
  verifiedPayout: jsonb("verified_payout").$type<PayoutDetails | null>(),
  payoutVerifiedAt: ts("payout_verified_at"),
  contacts: jsonb("contacts").$type<PayeeContacts>().notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  firstPaidAt: ts("first_paid_at"),
  paydayDayOfMonth: integer("payday_day_of_month"),
  typicalMedian: integer("typical_median"),
  typicalMax: integer("typical_max"),
});

export const payeeChangeRequests = pgTable("payee_change_requests", {
  id: text("id").primaryKey(),
  payeeId: text("payee_id").notNull().references(() => payees.id),
  requestedPayout: jsonb("requested_payout").$type<PayoutDetails>().notNull(),
  source: text("source").$type<"message" | "user">().notNull(),
  sourceText: text("source_text"),
  status: text("status").$type<"PENDING_CALLBACK" | "VERIFIED" | "REJECTED">().notNull(),
  callbackContact: text("callback_contact"),
  decidedBy: text("decided_by"),
  decidedAt: ts("decided_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const invoices = pgTable("invoices", {
  id: text("id").primaryKey(),
  clientId: text("client_id").notNull().references(() => clients.id),
  paypalInvoiceId: text("paypal_invoice_id").unique(),
  number: text("number").notNull(),
  description: text("description").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull().default("USD"),
  status: text("status").$type<"DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID" | "CANCELLED">().notNull(),
  issuedAt: ts("issued_at").notNull().defaultNow(),
  dueAt: ts("due_at").notNull(),
  paidAt: ts("paid_at"),
  reminderStage: integer("reminder_stage").notNull().default(0),
  lastReminderAt: ts("last_reminder_at"),
});

export const paymentIntents = pgTable("payment_intents", {
  id: text("id").primaryKey(),
  payeeId: text("payee_id").references(() => payees.id),
  payeeName: text("payee_name").notNull(),
  amount: integer("amount").notNull(),
  currency: text("currency").notNull(),
  payout: jsonb("payout").$type<PayoutDetails>().notNull(),
  invoiceNumber: text("invoice_number"),
  memo: text("memo"),
  status: text("status").$type<IntentStatus>().notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  scheduledFor: ts("scheduled_for"),
  batchId: text("batch_id"),
  sourceText: text("source_text"),
});

export const approvals = pgTable("approvals", {
  id: text("id").primaryKey(),
  intentId: text("intent_id").notNull().references(() => paymentIntents.id),
  userId: text("user_id").notNull().references(() => users.id),
  intentHash: text("intent_hash").notNull(),
  passkeyVerified: boolean("passkey_verified").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const flags = pgTable("flags", {
  id: text("id").primaryKey(),
  intentId: text("intent_id").references(() => paymentIntents.id),
  inboxItemId: text("inbox_item_id"),
  ruleId: text("rule_id").$type<RuleId>().notNull(),
  severity: text("severity").$type<Severity>().notNull(),
  why: text("why").notNull(),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  resolvedBy: text("resolved_by"),
  resolvedAt: ts("resolved_at"),
  resolution: text("resolution"),
  acknowledgedBy: text("acknowledged_by"),
  acknowledgedAt: ts("acknowledged_at"),
});

export const payoutBatches = pgTable("payout_batches", {
  id: text("id").primaryKey(),
  senderBatchId: text("sender_batch_id").notNull().unique(),
  paypalBatchId: text("paypal_batch_id"),
  status: text("status").notNull(),
  intentIds: jsonb("intent_ids").$type<string[]>().notNull(),
  stub: boolean("stub").notNull().default(false),
  response: jsonb("response").$type<unknown>(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(), // PayPal event ID
  eventType: text("event_type").notNull(),
  resource: jsonb("resource").$type<Record<string, unknown>>().notNull(),
  verified: boolean("verified").notNull(),
  receivedAt: ts("received_at").notNull().defaultNow(),
  processedAt: ts("processed_at"),
});

export const inboxItems = pgTable("inbox_items", {
  id: text("id").primaryKey(),
  kind: text("kind").$type<"email" | "invoice" | "money_request" | "payment_claim" | "other">().notNull(),
  rawText: text("raw_text").notNull(),
  signals: jsonb("signals").$type<MessageSignals | null>(),
  contacts: jsonb("contacts").$type<MessageContacts | null>(),
  verdict: text("verdict").$type<"safe" | "suspicious" | "scam" | "pending">().notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

// Append-only: a trigger in the migrations rejects UPDATE and DELETE.
export const auditEvents = pgTable("audit_events", {
  id: serial("id").primaryKey(),
  at: ts("at").notNull().defaultNow(),
  actorType: text("actor_type").$type<"user" | "agent" | "system" | "paypal">().notNull(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id").notNull(),
  ruleIds: jsonb("rule_ids").$type<string[]>().notNull().default([]),
  why: text("why").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
});

export const aiCache = pgTable("ai_cache", {
  key: text("key").primaryKey(),
  task: text("task").notNull(),
  model: text("model").notNull(),
  output: jsonb("output").$type<unknown>().notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const aiUsage = pgTable("ai_usage", {
  id: serial("id").primaryKey(),
  at: ts("at").notNull().defaultNow(),
  sessionId: text("session_id").notNull(),
  task: text("task").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  cached: boolean("cached").notNull(),
});

export const demoState = pgTable("demo_state", {
  id: text("id").primaryKey(),
  clockOffsetMs: bigint("clock_offset_ms", { mode: "number" }).notNull().default(0),
});
