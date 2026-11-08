# Notes

Decisions, deviations from the build brief, and things a judge might trip over.

## Decisions

- **Zero budget, no card anywhere.** Gemini free tier (Groq fallback) instead of the Anthropic API; Vercel Hobby + Neon free instead of Render; GitHub Actions for scheduled jobs. See `docs/BUILD_BRIEF.md` section 0.
- **Only fictional demo data goes to the AI**, because free-tier AI data may be used by the provider to improve its products.
- **PayPal access is blocked from Pakistan.** Routes: PayPal Discord, or a teammate in a supported country who owns the developer account. Until then, a labelled stub backs tests and local dev only.
- **Next.js 16 + TypeScript**, one app for UI and API. Node 24.
- **Vitest** for tests. Trust-layer invariants live in `src/trust/policy.test.ts`; fraud rules in `src/trust/rules.test.ts`.
- **Amounts are integer cents** everywhere in the trust layer.

## Deviations from the brief

- **R3 duplicates:** an invoice with the *same number but changed letters* (INV-1042 vs INV-1042-A) is a red flag. A different number is never treated as a duplicate on its own, because sequential numbers (H-10, H-11) are how normal retainers look. Same payee + same amount within 7 days is an amber "possible double payment" warning.
- **R2 lookalikes:** name identity keeps homoglyphs, so "Аcme" (Cyrillic А) counts as a different name from "Acme" and is caught by the visual-skeleton check.

## Eval history (rules mode, 158 synthetic cases, test split frozen by seed)

| Run | Change | Test catch rate | Test false-alarm rate |
|---|---|---|---|
| 1 (Nov 9) | First run, rules written before the cases existed | 92.9% (13/14) | 2.9% (1/34) |
| 2 (Nov 9) | Fixes driven by train-split misses: invoice numbers like "INV-2183/1" count as copies; swapped letters ("Kahn"/"Khan") count as one edit; domain imitation needs a separator ("acme-pay.com", not "acmelabs.com") | 100% (14/14) | 0% (0/34) |

**Caveat for the README:** the same author wrote the rules and the cases, so run 2 overstates real-world performance. Quote run 1 as the honest first measurement, and add cases written by someone else (or AI-extracted signals in full mode) before claiming more.

## Sponsor trial expiry dates

Fill in when claimed. Judging ends Dec 15, 2026.

Use a trial only if its sign-up asks for no card.

| Sponsor | Claimed | Card asked? | Expires |
|---|---|---|---|
| AG Studio | | | |
| Bryntum | | | |
| Kernel | | | |

## Status

- [ ] PayPal sandbox access (Discord or teammate)
- [ ] Gemini API key (aistudio.google.com)
- [ ] Groq API key (console.groq.com), fallback
- [ ] Vercel account (sign in with GitHub)
- [ ] Neon account
- [ ] GitHub account for the public repo
