# Devpost submission text

Copy each section into the matching Devpost field. Fill in the two links and the team line.

## Tagline

Your AI finance team. Every dollar in, every dollar out, guarded.

## Inspiration

Small businesses lose money at two moments: waiting to get paid, and paying out. 56% of US small businesses are owed money on unpaid invoices (QuickBooks 2025), and business email compromise cost $3.05B in 2025, 86% of it sent by wire or ACH (FBI IC3 2025). Scammers now send real PayPal invoices with their own phone number in the note, and in 2024 an employee at Arup sent US$25.6M after a deepfake video call with a fake CFO. The fixes are known (call back on a saved number, two approvers, cooling-off for new payees), but nobody applies them automatically for a five-person business.

## What it does

Finwarden is a team of AI agents behind one trust layer, built on PayPal:

- **Collections:** type "Bill Ali $320 for the logo, due Friday" and the AI drafts the invoice; the client pays through a PayPal Checkout link (PayPal, Pay Later or card), and late payers get friendly, firm and final reminders written in their language.
- **Payables:** batch payouts to freelancers, suppliers and staff through PayPal Payouts.
- **Cash flow:** a 30-day forecast that warns when money gets tight and says which late invoices to chase first.
- **Fraud guard:** nine rules hold risky payments: changed bank details, lookalike suppliers ("Acrne Ltd", Cyrillic letters), lookalike domains, duplicate or altered invoices, payments split under the approval limit, payroll diversion before payday, brand-new payees, pressure and impersonation, and contact details that don't match the ones on file.
- **Scam inbox:** paste any invoice, money request or "you've been paid" email in any language and get a verdict with plain-language reasons.
- **Trust layer:** the AI can hold a payment but never send money past a red flag. Approvals happen only in the app with a passkey, bound to the exact amount and recipient. $500+ needs two people. New or changed payees wait 24 hours. "We changed our bank details" never applies from a message; it waits for a callback on the number already on file. Every decision is in an append-only audit log with a reason.

## How we built it

Next.js 16 and TypeScript, Postgres via Drizzle (Neon in production, PGlite locally), SimpleWebAuthn for passkeys, AG Grid for the dashboard, and the Vercel AI SDK.

**PayPal:** OAuth client credentials; **Payouts v1** for batch payments (only one module can call it, and it re-checks every payment right before sending); and **Orders v2 with the JS SDK (Checkout)** so clients pay invoices with PayPal, Pay Later or card, and an invoice is marked paid only when PayPal confirms the capture for the exact amount. Both are verified live in the sandbox. Invoicing v2 code is written too, but our sandbox app was still refused permission at submission time.

**AI:** Google **Gemini** (free tier) extracts structured signals from messages in any language and turns plain requests into invoices; **Groq** (`gpt-oss-120b`) is the automatic fallback. Output is Zod-validated, cached and capped. The AI never makes the money decision: rules in code do. **Claude Code** was used to build it.

## Challenges

PayPal accounts can't be opened from Pakistan, where most of the build happened, so the code was written against typed PayPal clients with a labelled stub until a teammate's sandbox access arrived. Everything also had to run on free tiers with no credit card, so we designed for rate limits: cached AI results, provider fallback, and rules that keep working when the AI is down.

## Accomplishments

- A trust layer with 48 automated tests, including end-to-end flows on a real Postgres database and tests that fail if AI code is ever imported into the decision layer.
- On 158 labelled cases (English, Urdu, Arabic, Spanish), the first run, before any tuning, caught 92.9% of held-out scams with a 2.9% false-alarm rate.

## What we learned

Ask the AI for facts, not verdicts. Extraction ("does this message claim authority? ask for secrecy?") is reliable and auditable; the decision belongs in code you can test.

## What's next

PayPal Checkout with order-risk scoring, Disputes evidence packs, webhooks and Transaction Search reconciliation, a cash-flow forecast, the PayPal Agent Toolkit, a payee trust network shared across businesses, and PayPal World wallets.

## Built with

nextjs, typescript, paypal-payouts, paypal-invoicing, gemini, groq, vercel-ai-sdk, postgresql, neon, drizzle, ag-grid, webauthn, vercel, claude-code

## Testing instructions for judges

Live demo: https://finwarden.vercel.app. Password: `finwarden-demo`. Sign in as Sara (owner) or Omar (second approver). Add a passkey when asked, then follow "Test it in 5 minutes" in the README. "Reset everything" in the Demo tab restores the starting data. PayPal sandbox only.

## Links

- Repo: https://github.com/HadiaSiddique/finwarden
- Video: _YouTube URL_
- Team: Hadia Siddiqui, _teammate name_
