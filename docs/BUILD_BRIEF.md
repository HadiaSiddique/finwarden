# Finwarden build brief

The spec for building Finwarden for the PayPal AI Hackathon on Devpost. Read it all before changing code.

## 0. Zero-budget rule

**Everything must be free, with no credit card, ever.** If any sign-up asks for a card, stop and pick the free alternative listed here. Don't enter a card "just for verification".

| Need | Free choice (no card) | Not used, and why |
|---|---|---|
| AI model | **Google Gemini API free tier** (Flash models, key from AI Studio), with **Groq free tier** as fallback | Anthropic API: paid credits only |
| Hosting | **Vercel Hobby** (sign in with GitHub) | Render: recent reports say free web services now ask for a card |
| Database | **Neon free Postgres** (1 GB, no expiry, wakes on demand); **PGlite** (in-process Postgres) for local dev and tests | Render Postgres: free tier expires after 30 days |
| Scheduled jobs | **GitHub Actions** scheduled workflow (free on public repos) calling protected job endpoints | Vercel Hobby cron: once a day only |
| Passkeys | WebAuthn with SimpleWebAuthn (open source) | – |
| Dashboard | **AG Grid Community** (free, MIT) + **AG Studio 45-day trial** if it needs no card | – |
| Calendar | **Bryntum 45-day trial**, if it needs no card | – |
| API tests | **Postman free plan** + Newman in CI | – |
| Safe link check | **Kernel** only if sign-up needs no card; otherwise follow redirects server-side with plain `fetch` | – |
| Building | Claude Code (my existing plan) | – |

Dropped sponsors: **Render** (asks for a card), **Elastic** (14-day trial ends before judging), **Zapier** (posting to a webhook needs the paid "Webhooks by Zapier" step), **Astropods** and **Channel3** (don't fit). **APIMatic** only if its sign-up needs no card (build-time helper, optional).

Free AI tiers have low daily request limits, and Google may use free-tier data to improve its products. So: only fictional demo data goes to the AI, AI results are cached, and the app still protects payments when the AI is unavailable (section 4).

## 1. Hard constraints

- **Deadline:** submissions close **Nov 12, 2026, 12:00 PM PT** (1:00 AM Nov 13 in Pakistan). Finish building by the morning of Nov 12 (Pakistan time), so the rest of that day is left for the video and the Devpost form. Don't add features outside the MUST list until every MUST works and is deployed.
- **The project must meaningfully use both PayPal and AI.** Stage 1 of judging is pass/fail on this.
- **PayPal sandbox only.** `src/paypal/config.ts` refuses any base URL other than `https://api-m.sandbox.paypal.com`.
- **Judges must be able to test it for free until judging ends (Dec 15, 2026):** a hosted URL, demo logins, nothing that expires before then, and AI call caps so free quotas aren't exhausted.
- **Submission needs:** a working hosted demo, a public GitHub repo with an MIT licence visible in the About section, a YouTube video under 3 minutes, a text description, and a list of the AI tools used and how. Everything in English.
- **Secrets** stay in `.env`, never committed. `.env.example` stays up to date.

## 2. PayPal access (blocker)

PayPal accounts can't be opened from Pakistan, and the developer sandbox needs a PayPal account. Never sign up with a false country or address. The legitimate routes:

1. **Ask in the PayPal Discord.** The hackathon FAQ says account availability is separate from eligibility, and to ask the PayPal team there if sign-up fails.
2. **A teammate in a supported country** joins the Devpost team, creates the developer account, and shares the sandbox app's client ID and secret privately (into `.env`, never into the repo or chat).

Until credentials exist, build everything behind the typed clients in `src/paypal/`. A clearly named in-memory stub (`src/paypal/stub.ts`) may back **tests and local development only**. The deployed demo must use the real sandbox: a stub-only submission fails Stage 1. The UI shows a banner whenever the stub is active.

## 3. The product

Finwarden is an AI finance team for small businesses and freelancers. It gets them paid, pays their people, and guards every dollar in and out.

Tagline: *"Your AI finance team. Every dollar in, every dollar out, guarded."*

**Core principle: "The AI talks, the code decides."** The AI drafts, explains, extracts and proposes. It can hold a payment but never send money past a red flag. Only deterministic code, behind the trust layer, moves money. Approvals happen only in the app, with a passkey.

**Demo persona:** Sara runs a small online design business. Clients: Ali, Bright Bakery, Nova Apps. Freelancers: Hamza, Lina. Suppliers: Acme Ltd, PrintHub. Employee and second approver: Omar.

## 4. Stack and architecture

- **Next.js 16 (App Router) + TypeScript**, one app for UI and API routes. Node 24.
- **Postgres + Drizzle ORM**: Neon in production, PGlite locally and in tests.
- **AI through the Vercel AI SDK**, so the provider is swappable: `@ai-sdk/google` (Gemini) primary, `@ai-sdk/groq` fallback. Read the provider and models from env (`AI_PROVIDER`, `AI_MODEL`, `AI_FAST_MODEL`, `AI_FALLBACK_PROVIDER`, `AI_FALLBACK_MODEL`). Choose current free-tier models from the AI Studio and Groq rate-limit pages, and record the choice in `NOTES.md`. Don't hard-code model names.
  - Everything the code acts on is **structured JSON validated with Zod**. If validation fails, retry once, then fail closed.
  - **Cache** AI results in the database, keyed by a hash of (task, model, input). Scenario-runner replays hit the cache, which keeps quota use near zero. The audit log marks cached results.
  - **Quota handling:** on a 429, try the fallback provider. If both are unavailable, the app keeps working on rules alone and says "AI is busy; rule checks still protect your payments." Payments stay held, never sent.
  - **Caps:** per-session and per-day call limits from env.
  - Vision (invoice photos, screenshots, receipts) uses a vision-capable model. Gemini Flash supports images. If the fallback doesn't, image tasks wait for the primary.
- **PayPal tools for the agents.** Read the PayPal Agent Toolkit README (`@paypal/agent-toolkit`, github.com/paypal/agent-toolkit). Its Vercel AI SDK integration works with any AI SDK provider, so it works with Gemini. Give the agents only **read and draft** tools (list and get invoices, create draft invoices, list transactions, get orders and disputes). **Money-moving actions (payouts, refunds, dispute acceptance) are never model tools.** The model can only create a `PaymentIntent`, which goes through the trust layer. Every tool call goes to the audit log.
- **What the AI does in each agent** (the README must say this):

  | Agent | What the AI does | What code does |
  |---|---|---|
  | Collections | Turns a chat, voice or photo request into invoice details; writes friendly, firm and final reminders | Creates, sends and reminds through Invoicing; tracks who owes what |
  | Payables | Plans payout batches; explains the chosen payment method, fees and timing | Picks the method per payee, estimates fees and speed, queues intents; the executor sends approved batches through Payouts |
  | Fraud guard | Reads invoices and emails for urgency, impersonation and scam phone numbers; explains each red flag | Rules R1–R9 decide; bank changes, lookalikes and split payments are code only |
  | Order risk | Explains why an order looks risky and what to do | Scores the order with rules |
  | Disputes | Drafts the dispute response from the evidence pack | Builds the evidence pack, estimates the chance of winning, submits after Sara reviews it |
  | Cash flow | Explains the forecast; reads receipt photos; suggests matches for unmatched payments | Computes the 30/60/90-day forecast; reconciles every payment to its invoice; matches receipts to transactions |

- **Passkeys:** `@simplewebauthn/server` and `@simplewebauthn/browser`. The RP ID is the Vercel domain, or localhost in development.
- **Jobs:** a GitHub Actions workflow on a schedule (every 30 minutes) calls `/api/jobs/*` with `CRON_SECRET`, for reminders, scheduled payout runs and forecast refresh. The demo clock can also trigger them on demand.

Layout:

```
src/
  app/        # pages + API routes (chat, webhooks, approvals, jobs, demo)
  agents/     # collections, payables, inbox, cashflow, orders, disputes, router, grid-view
  trust/      # types, hash, lookalike, rules, policy, executor, audit: no AI imports (enforced by test)
  paypal/     # config (sandbox guard), auth, invoicing, payouts, orders, reporting, disputes, webhooks, stub
  ai/         # provider setup, cache, caps, prompts, Zod schemas
  db/         # Drizzle schema, migrations, seed
eval/         # cases, runner, results.md
postman/      # collection + environment
docs/         # this brief
```

## 5. Scope

### MUST (the demo)

1. **Trust layer** (section 6). *Done: rules, policy, hashing, 38 tests.* Still to do: persistence, executor, audit log, payee-change requests.
2. **Fraud guard** (section 7). *Rules done.* Still to do: AI signal extraction for R7, wiring into payment and inbox flows.
3. **Collections agent:** invoices from a chat message or a photo of a handwritten note (vision), sent through the **PayPal Invoicing API**; reminders (friendly, then firm, then final) through the Invoicing remind endpoint; who owes what.
4. **Payables agent:** queue payments to freelancers, suppliers and staff; the executor sends approved ones as a batch through the **PayPal Payouts API**; "pay all approved freelancers on Friday" as a scheduled batch.
   - **Best payment method per person:** code picks PayPal email or phone, Venmo (US recipients only), or bank (only if the Payouts docs confirm sandbox support for that country). Show estimated fee and speed per payee and the batch total before approval. Fees and speeds live in a config file sourced from PayPal's published fee pages, labelled "estimated", with source URLs. The AI only explains. The method is part of the payout fingerprint, so changing it counts as a details change (R1) and voids approvals.
5. **"Was I really paid?"**: paste a payment email or upload a screenshot. The AI extracts the claimed payer, amount, date and transaction or invoice ID. Code checks PayPal (section 8) and answers **Paid**, **Not found** or **Mismatch**, with evidence. Never "Paid" unless PayPal data confirms it.
6. **Scam inbox:** paste or upload an invoice, money request or email and get a verdict with the rules that fired, including real-looking PayPal invoices with a "call to dispute" number.
7. **PayPal webhooks:** signature-verified, idempotent, stored; they update invoices, payouts and payments.
8. **Money dashboard on AG Grid** (section 9).
9. **Cash-flow forecast:** deterministic 30/60/90-day projection; the AI only explains it.
   - **Reconciliation:** match every incoming payment (webhooks, Invoicing, Captures, Transaction Search) to its invoice: invoice ID first, then amount + payer + date window. Label it matched, partial, overpaid or unmatched, in a Reconciliation grid. The AI may suggest a match; a person confirms. Overpayments get an amber flag (overpay-and-refund scam).
10. **Chat:** one chat box routing to the agents. It can create drafts and payment intents, never approvals.
    - **Any language:** replies in the user's language; reads invoices and emails in any language. R7 and R8 must work on non-English messages, so the eval set includes some (Urdu, Arabic, Spanish). Structured fields, the audit log and anything sent to PayPal stay in English. Invoices and reminders go out in the language Sara picks per client.
11. **Demo mode and "Sara's day"** (section 11).
12. **Eval harness** (section 12).
13. **Deployed on Vercel** with Neon, on a public HTTPS URL as early as possible, and kept deployed.

### MUST, thin (Day 3, only once items 1–13 work on the deployed URL)

14. **Checkout:** a public payment-link page using **Orders v2 + JS SDK v6** (v5 fallback), with whatever buttons the SDK offers (PayPal, Venmo, Pay Later, card). It produces real sandbox captures.
15. **Order risk agent:** code scores captured orders (new customer, amount versus history, country mismatch, order bursts); the AI explains why and suggests what to do. Orders grid.
16. **Dispute agent:** on `CUSTOMER.DISPUTE.CREATED`, build the evidence pack; the AI drafts; code estimates the chance of winning; Sara submits through the **Disputes API** after review. Create a real sandbox dispute from a sandbox buyer account. If that's impossible in time, run on a stored webhook payload and **label it simulated** in the UI and README.
17. **Voice:** a mic button using the browser's Web Speech API; text then goes to the AI. Hidden where unsupported.
18. **Receipt photos:** vision extracts merchant, amount and date; code matches them to a transaction or flags them unmatched.
19. **Bryntum payment calendar** (if the trial needs no card): payout runs, due dates, reminder stages, cooling-off end times.
20. **Safe link check:** follow a suspicious link's redirects server-side (manual redirect handling, short timeout, no cookies, block private IP ranges) and report the final domain. Red flag when it doesn't match the claimed sender. With Kernel (only if no card), also screenshot the landing page and let the AI describe it.

### SHOULD

Spend watch, tax-ready monthly summary.

### WON'T (roadmap in the README)

Cross-business payee trust network, PayPal World wallets, Elastic, Zapier, Render, Astropods, Channel3.

## 6. Trust layer

Entities: `Payee`, `PayeeChangeRequest`, `PaymentIntent`, `Approval`, `Flag`, `AuditEvent`.

Invariants, each with a test:

1. **Only `trust/executor.ts` can call the Payouts client** (boundary test exists).
2. **The executor refuses** unless: status `APPROVED`; no unresolved red flags; amber flags acknowledged; cooling-off over; required approvals present and valid; payout details equal the payee's verified details. *Implemented in `policy.ts`.*
3. **Approvals are bound to the intent hash** (id, amount, currency, payee, payout fingerprint). Any change voids them. *Implemented.*
4. **Approval needs a server-verified passkey assertion**, with the challenge derived from the intent hash. No approvals from chat, email or links.
5. **Two different approvers** at or above `TWO_APPROVER_THRESHOLD_USD` (default $1,000). *Implemented.*
6. **Inbound messages never change payee details.** They create a `PayeeChangeRequest`, which takes effect only after verification through the contact already on file (UI shows it and records who confirmed the callback, labelled as a simulated callback in the demo), then the cooling-off period.
7. **Append-only audit log** with actor, rule IDs and a plain-language "why" for every event.
8. **Fail closed** on any error.

## 7. Fraud rules

*Implemented in `src/trust/rules.ts` with tests.* R1 changed payout details · R2 lookalike names and domains (confusables and homoglyphs) · R3 duplicate or altered-copy invoices (sequential numbers are fine) · R4 split payments · R5 payroll diversion · R6 new payee · R7 pressure and impersonation (AI extracts signals, code decides) · R8 contact mismatch, including "PayPal" messages with phone numbers · R9 amount anomaly. Deviations are recorded in `NOTES.md`.

## 8. PayPal integration notes

Check every endpoint, field and event name against developer.paypal.com. Don't invent fields.

- OAuth2 client credentials, token cached until expiry.
- **Invoicing v2:** draft, send, get, list, remind. Reminder copy may mention that PayPal shows Pay Later and card where available; Finwarden doesn't turn Pay Later on.
- **Payouts v1:** `sender_batch_id` from the intent IDs (idempotent). Recipients are sandbox personal accounts. Venmo payouts are US-only.
- **Webhooks:** verify each event with `/v1/notifications/verify-webhook-signature`; store by event ID; handle invoice paid, payout batch and item, capture completed, dispute created. Test against the deployed Vercel URL.
- **"Was I really paid?" lookup order:** stored verified webhooks → Invoicing → Orders and Captures → **Transaction Search** (can lag about 3 hours and may need enabling; say "not found yet" rather than "fake" when only it could confirm).
- Retry with backoff on 429 and 5xx; log PayPal debug IDs.

## 9. AG Grid dashboard (sponsor prize target)

Judged on dashboard polish and use of AG Studio and its Agent Framework. Read AG Grid's sponsor page and the AG Studio docs (ag-grid.com/studio) before building. If the AG Studio trial needs no card, use it with the Agent Framework driven by our AI provider. If it needs a card or isn't usable, build on **AG Grid Community** with our own view agent and note this in `NOTES.md` (weaker for the sponsor prize, still fine for Design).

- Grids: Invoices, Payables, Held payments (flags with "why"; approve and resolve actions), Reconciliation, Orders, Audit log.
- Polish: status pills, currency formatting, overdue highlighting, grouping by client, totals, saved views, light and dark themes.
- **View agent:** a plain request becomes grid state (columns, filters, sort, grouping), validated with Zod. "unpaid invoices over $500 by client", "everything held this week".
- KPI strip: owed to you, overdue, due out this week, held for review.

## 10. Data model (minimum)

`users`, `passkeys`, `businesses`, `clients`, `payees`, `payee_change_requests`, `invoices`, `payment_intents`, `approvals`, `flags`, `payout_batches`, `webhook_events`, `inbox_items`, `orders`, `disputes`, `audit_events`, `ai_cache`, `ai_usage`, `demo_state`.

## 11. Demo mode and "Sara's day"

- **Demo logins:** Sara (owner) and Omar (approver). Each judge registers a passkey on first sign-in. Credentials go in the README and Devpost description.
- **Seed script** creates the business, clients, payees, past invoices and history, using real sandbox calls where data must exist in PayPal.
- **Demo clock** ("fast-forward 24h"), logged in the audit log, only when `DEMO_MODE=true`.
- **Reset** reseeds the database.
- **Scenario runner** (`/demo`):
  1. Ali's invoice is overdue → next reminder goes out.
  2. "Acme Ltd: we changed our bank details" → R1 holds the payout; callback-on-file step.
  3. Urgent "CEO" request to a new account → R7 + R6 block it; approval only in the app with a passkey.
  4. "You've been paid $640" email → Not found or Mismatch from PayPal data; a really paid invoice → Paid.
  5. PayPal-style invoice with a "call to dispute" number → R8.
  6. Invoice from "Acrne Ltd" → R2.
  7. Cash-flow forecast warns about Friday's payouts.
  8. Friday payout run → Payouts; webhooks update the grid live.
  9. Risky Checkout order → Order risk suggests holding shipping.
  10. Dispute after delivery → evidence pack and draft response.

  The video uses the strongest 5 or 6.

## 12. Eval harness

- `eval/cases/*.json`: at least 150 labelled cases (about 60 scams across R1–R8, about 90 normal), with hard negatives and some non-English messages. Synthetic, built from documented patterns (FBI IC3 2025, the Arup deepfake case, PayPal's scam list, KnowBe4's PayPal invoice phishing report); the README says so.
- Freeze a held-out 30% split before tuning. Report held-out numbers.
- `npm run eval` writes `eval/results.md`: catch rate, false-alarm rate, per-rule and per-pattern breakdown, confusion matrix, misses. Two modes: rules with labelled signals (no AI, runs in CI), and full mode with AI signal extraction when a key is set.

## 13. Repo and submission

- Public repo `finwarden`, MIT `LICENSE` (done), licence shown in the GitHub About section (I set that).
- README: what it is, live link, judge logins and a 5-minute test path, architecture diagram, PayPal APIs with file links, trust layer, eval results, AI tools used and how (Gemini API, Groq fallback, PayPal Agent Toolkit, Claude Code to build), sponsor tools used, limitations (sandbox only, Transaction Search lag, US-only Venmo payouts, free-tier AI limits), roadmap.
- `NOTES.md`, `SUBMISSION.md` (Devpost text, only claiming what works; simulated things labelled).
- **Pre-submission checklist**, reported before the final checkpoint:
  - [ ] PayPal sandbox: Invoicing, Payouts, Checkout, Transaction Search, Disputes, Webhooks, Agent Toolkit, each with file link and live or simulated
  - [ ] Six AI agents, named and explained
  - [ ] Hosted on Vercel + Neon free tiers, nothing expiring before Dec 15, no card on any account
  - [ ] Judge logins work from a fresh reset
  - [ ] Public repo, setup instructions, `.env.example` complete, no secrets in history
  - [ ] MIT licence present
  - [ ] All commits after Oct 1, 2026
  - [ ] Each sponsor tool named with what it does; optional extras degrade gracefully
  - [ ] The app works with the AI switched off (rules only), and the scenario runner works from the AI cache
  - [ ] Every README link works
  - [ ] Tests, eval and Newman green in CI

## 14. Build order

Commit after each working step.

**Without keys (now):** DB schema with PGlite; trust-layer persistence, executor (against the PayPal stub), audit log, payee-change requests; passkey sign-up and approval flow on localhost; eval set and runner (rules mode); dashboard shell on AG Grid Community with seeded data; Postman collection for Finwarden's own API; GitHub Actions CI.

**When the Gemini (or Groq) key arrives:** AI provider layer with cache and caps; R7 signal extraction; chat router; Collections drafting; "Was I really paid?" extraction; scam inbox; full-mode eval.

**When PayPal sandbox credentials arrive:** auth, Invoicing, Payouts through the executor, webhooks; deploy to Vercel + Neon and register webhooks; seed real sandbox data; swap the stub out of the deployed path.

**Day 3:** remaining agents, scenario runner, polish, then thin items 14–20 in order.

**Day 4 morning (Pakistan time):** bugs, README, `SUBMISSION.md`, checklist, fresh-reset run-through as a judge. Then video and submission, which I do. Leave hours of buffer before 1:00 AM.

## 15. Working rules

- Check PayPal, AG Grid, Agent Toolkit, Vercel, Neon and AI provider details against current docs.
- Never weaken a trust-layer invariant for the demo.
- Keep the AI out of every decision that moves money.
- Prefer a smaller real feature over a bigger mocked one. Label anything simulated.
- Ask before adding any service, changing scope, or deleting sandbox data. Never add anything that needs a card.
