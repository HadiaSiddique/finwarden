CREATE TABLE "ai_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"task" text NOT NULL,
	"model" text NOT NULL,
	"output" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"session_id" text NOT NULL,
	"task" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"cached" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"intent_id" text NOT NULL,
	"user_id" text NOT NULL,
	"intent_hash" text NOT NULL,
	"passkey_verified" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"rule_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"why" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"purpose" text NOT NULL,
	"challenge" text NOT NULL,
	"intent_id" text,
	"intent_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"country" text DEFAULT 'US' NOT NULL,
	"language" text DEFAULT 'en' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demo_state" (
	"id" text PRIMARY KEY NOT NULL,
	"clock_offset_ms" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "flags" (
	"id" text PRIMARY KEY NOT NULL,
	"intent_id" text,
	"inbox_item_id" text,
	"rule_id" text NOT NULL,
	"severity" text NOT NULL,
	"why" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"resolution" text,
	"acknowledged_by" text,
	"acknowledged_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "inbox_items" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"raw_text" text NOT NULL,
	"signals" jsonb,
	"contacts" jsonb,
	"verdict" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"paypal_invoice_id" text,
	"number" text NOT NULL,
	"description" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"reminder_stage" integer DEFAULT 0 NOT NULL,
	"last_reminder_at" timestamp with time zone,
	CONSTRAINT "invoices_paypal_invoice_id_unique" UNIQUE("paypal_invoice_id")
);
--> statement-breakpoint
CREATE TABLE "passkeys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"public_key" text NOT NULL,
	"counter" bigint DEFAULT 0 NOT NULL,
	"transports" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payee_change_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"payee_id" text NOT NULL,
	"requested_payout" jsonb NOT NULL,
	"source" text NOT NULL,
	"source_text" text,
	"status" text NOT NULL,
	"callback_contact" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payees" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"country" text DEFAULT 'US' NOT NULL,
	"verified_payout" jsonb,
	"payout_verified_at" timestamp with time zone,
	"contacts" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_paid_at" timestamp with time zone,
	"payday_day_of_month" integer,
	"typical_median" integer,
	"typical_max" integer
);
--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" text PRIMARY KEY NOT NULL,
	"payee_id" text,
	"payee_name" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"payout" jsonb NOT NULL,
	"invoice_number" text,
	"memo" text,
	"status" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scheduled_for" timestamp with time zone,
	"batch_id" text,
	"source_text" text
);
--> statement-breakpoint
CREATE TABLE "payout_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"sender_batch_id" text NOT NULL,
	"paypal_batch_id" text,
	"status" text NOT NULL,
	"intent_ids" jsonb NOT NULL,
	"stub" boolean DEFAULT false NOT NULL,
	"response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payout_batches_sender_batch_id_unique" UNIQUE("sender_batch_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"resource" jsonb NOT NULL,
	"verified" boolean NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_intent_id_payment_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_challenges" ADD CONSTRAINT "auth_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "flags" ADD CONSTRAINT "flags_intent_id_payment_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payee_change_requests" ADD CONSTRAINT "payee_change_requests_payee_id_payees_id_fk" FOREIGN KEY ("payee_id") REFERENCES "public"."payees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_payee_id_payees_id_fk" FOREIGN KEY ("payee_id") REFERENCES "public"."payees"("id") ON DELETE no action ON UPDATE no action;