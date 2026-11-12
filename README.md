# Finwarden

**Your AI finance team. Every dollar in, every dollar out, guarded.**

Finwarden helps small businesses and freelancers get paid, pay their people, and stop the scams aimed at exactly those moments: fake "we changed our bank details" emails, real-looking PayPal invoices with a scammer's phone number, lookalike suppliers, duplicate invoices, split payments and urgent "CEO" requests.

Built for the PayPal AI Hackathon 2026. PayPal **sandbox only**: no real money moves.

- **Live demo:** _add the Vercel URL here_
- **Video:** _add the YouTube link here_

## Core principle: the AI talks, the code decides

The AI reads messages, extracts facts, drafts invoices and reminders, and explains. It never decides whether money moves. Deterministic rules hold risky payments, and only one module, [`src/trust/executor.ts`](src/trust/executor.ts), can call PayPal Payouts. It re-checks every payment moments before sending. Approvals only happen inside the app with a passkey, bound to the exact amount and recipient.

## Test it in 5 minutes (judges)

1. Open the live demo and sign in with the demo password **`finwarden-demo`**, as **Sara** (owner). **Omar** is the second approver.
2. Click **Add passkey** (fingerprint, face or device PIN). Approvals need it.
3. Open **Demo** and run **Acme: "we changed our bank details"**. In **Review**, the payment is held by R1 and R2, and a card shows the number already on file to call Acme back. Click **They didn't ask**: it stays blocked. (Or **They confirmed**: the change is saved, then a 24-hour cooling-off applies. Use **Fast-forward 24 hours** in Demo.)
4. Run **Urgent "CEO" request**: blocked by pressure and new-payee rules. It can only be approved in the app with a passkey.
5. Run **PayPal invoice with a phone number**, or paste any message into **Scam inbox**, in any language.
6. Run **Friday payout run**, approve with your passkey, then **Send via PayPal**. Payments of $1,000 or more need Omar too.
7. In **Invoices**, type "Bill Ali $800 for the logo, due Friday", draft it, **Send via PayPal**, then **Remind**.
8. **Audit log** shows every decision with a plain-language reason. **Reset everything** in Demo restores the starting data.

## What's built

| Area | What it does | Where |
|---|---|---|
| Trust layer | Passkey approvals bound to an intent hash; two approvers at $1,000+; 24h cooling-off for new or changed payees; red flags block; atomic, send-once execution; fails closed | [`src/trust/`](src/trust), [`src/services/intents.ts`](src/services/intents.ts) |
| Fraud guard rules R1–R9 | Changed payout details, lookalike names and domains (homoglyphs, `rn`→`m`), duplicate or altered invoices, split payments, payroll diversion, new payee, pressure and impersonation, contact mismatch (incl. PayPal invoices with phone numbers), amount anomaly | [`src/trust/rules.ts`](src/trust/rules.ts) |
| Payee change verification | "New bank details" never apply from a message. They wait for a callback on the contact already on file, then cooling-off | [`src/services/payee-changes.ts`](src/services/payee-changes.ts) |
| Scam inbox | Paste any message; AI extracts signals, code parses contacts, rules decide | [`src/services/inbox.ts`](src/services/inbox.ts) |
| Collections agent | Invoice from a sentence; send and remind through PayPal Invoicing; AI-written reminders in the client's language | [`src/services/invoices.ts`](src/services/invoices.ts) |
| Payables | Batch payouts through PayPal Payouts, only via the executor | [`src/trust/executor.ts`](src/trust/executor.ts) |
| Dashboard | KPIs, review queue, AG Grid tables for payments, invoices and the audit log | [`src/components/`](src/components) |
| Audit log | Append-only, enforced by a Postgres trigger; a plain-language "why" for every event | [`drizzle/0001_audit_append_only.sql`](drizzle/0001_audit_append_only.sql) |

## PayPal APIs used (sandbox)

| API | Use | File |
|---|---|---|
| OAuth 2.0 | Client-credentials token, cached, with retries | [`src/paypal/client.ts`](src/paypal/client.ts) |
| Payouts v1 | Batch payouts to freelancers, suppliers and staff, idempotent `sender_batch_id` | [`src/paypal/payouts.ts`](src/paypal/payouts.ts) |
| Invoicing v2 | Create, send, remind and check invoices | [`src/paypal/invoicing.ts`](src/paypal/invoicing.ts) |

A labelled stub stands in for PayPal in tests and local development only; the UI shows a banner when it's active, and it is refused in production.

## AI tools used, and how

- **Google Gemini API (free tier)** through the Vercel AI SDK: `gemini-3.5-flash-lite` extracts message signals (urgency, authority claims, secrecy, off-channel requests, payment-detail changes, claimed sender) as Zod-validated JSON, in any language, and turns plain requests into invoice fields. `gemini-2.5-flash` writes payment reminders.
- **Groq (free tier)**, `openai/gpt-oss-120b`, as automatic fallback when Gemini is rate-limited or down.
- Results are cached, calls are capped per session and per day, and if every model is unavailable Finwarden keeps protecting payments with the rules alone. Only fictional demo data is sent to the AI.
- **Claude Code** (Anthropic) was used to build the project.

## Measured results

158 labelled cases ([`eval/cases.ts`](eval/cases.ts)) built from documented fraud patterns (FBI IC3 2025, the Arup deepfake-CFO case, PayPal's scam list, KnowBe4's report on PayPal invoice phishing), in English, Urdu, Arabic and Spanish, with a 30% test split frozen by seed. `npm run eval` writes [`eval/results.md`](eval/results.md).

| Run | Test-split catch rate | Test-split false-alarm rate |
|---|---|---|
| First run, before any tuning | **92.9%** (13 of 14 scams) | **2.9%** (1 of 34 normal) |
| After fixes driven by training-split misses | 100% | 0% |

The same team wrote the rules and the cases, so the first-run number is the honest one. The set is synthetic.

## Run it locally

```bash
npm install
cp .env.example .env.local   # add your own free keys
npm run dev                  # http://localhost:3000, password finwarden-demo
npm test                     # 48 tests: rules, trust invariants, end-to-end flow on Postgres
npm run eval
```

Without `DATABASE_URL` it uses PGlite (Postgres in-process). Without PayPal keys it uses the labelled stub.

## Stack

Next.js 16, TypeScript, Drizzle ORM, Neon Postgres (PGlite locally), SimpleWebAuthn passkeys, AG Grid Community, Vercel AI SDK, Vitest. Hosted free on Vercel + Neon.

## Limitations and roadmap

- Sandbox only. Venmo payouts are US-only. Bank payouts aren't enabled.
- Not built yet: PayPal Checkout and order-risk scoring, Disputes evidence packs, webhooks, Transaction Search reconciliation, cash-flow forecast, the PayPal Agent Toolkit integration, a cross-business payee trust network, and PayPal World wallets.
- The callback to the contact on file is simulated in the demo.

## Licence

[MIT](LICENSE)
