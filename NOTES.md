# Notes

Decisions, deviations from the build brief, and things a judge might trip over.

## Decisions

- **Next.js 16 + TypeScript**, one app for UI and API. Node 24.
- **Vitest** for tests. Trust-layer invariants live in `src/trust/policy.test.ts`; fraud rules in `src/trust/rules.test.ts`.
- **Amounts are integer cents** everywhere in the trust layer.

## Deviations from the brief

- **R3 duplicates:** an invoice with the *same number but changed letters* (INV-1042 vs INV-1042-A) is a red flag. A different number is never treated as a duplicate on its own, because sequential numbers (H-10, H-11) are how normal retainers look. Same payee + same amount within 7 days is an amber "possible double payment" warning.
- **R2 lookalikes:** name identity keeps homoglyphs, so "Аcme" (Cyrillic А) counts as a different name from "Acme" and is caught by the visual-skeleton check.

## Sponsor trial expiry dates

Fill in when claimed. Judging ends Dec 15, 2026.

| Sponsor | Claimed | Expires |
|---|---|---|
| AG Grid | | |
| Bryntum | | |
| Kernel | | |
| Elastic (optional) | | |
| Zapier (optional) | | |

## Status

- [ ] PayPal sandbox access
- [ ] Anthropic API key
- [ ] Render account and $50 credits
