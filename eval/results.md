# Fraud guard evaluation

Rules mode (labelled message signals, no AI). 158 synthetic cases built from documented fraud patterns; see `eval/cases.ts` for sources.
A case counts as **blocked** when at least one red flag fires. Amber warnings don't block.
The **test** split (30%) was frozen with a fixed seed before any tuning; report that one.

## Headline (held-out test split)

- **Catch rate:** 100.0% (14 of 14 scams blocked)
- **False-alarm rate:** 0.0% (0 of 34 normal cases blocked)
- Normal cases that got an amber warning only: 9

## By split

| Split | Cases | Scams | Normal | Caught | Missed | False alarms | Catch rate | False-alarm rate |
|---|---|---|---|---|---|---|---|---|
| test | 48 | 14 | 34 | 14 | 0 | 0 | 100.0% | 0.0% |
| train | 110 | 48 | 62 | 48 | 0 | 0 | 100.0% | 0.0% |
| all | 158 | 62 | 96 | 62 | 0 | 0 | 100.0% | 0.0% |

## Confusion matrix (all cases)

| | Blocked | Not blocked |
|---|---|---|
| Scam | 62 | 0 |
| Normal | 0 | 96 |

## By pattern (all cases)

| Label | Pattern | Cases | Blocked | Warned only |
|---|---|---|---|---|
| normal | genuine_paypal_notice | 6 | 0 | 0 |
| normal | hurried_known_payee | 10 | 0 | 10 |
| normal | monthly_retainer | 12 | 0 | 0 |
| normal | normal_payroll | 7 | 0 | 0 |
| normal | routine_payment | 25 | 0 | 0 |
| normal | similar_but_different | 10 | 0 | 10 |
| normal | small_repeat_payments | 8 | 0 | 0 |
| normal | supplier_own_contacts | 10 | 0 | 0 |
| normal | verified_detail_change | 8 | 0 | 0 |
| scam | bank_detail_change | 10 | 10 | 0 |
| scam | ceo_impersonation | 8 | 8 | 0 |
| scam | duplicate_invoice | 8 | 8 | 0 |
| scam | lookalike_domain | 6 | 6 | 0 |
| scam | lookalike_payee | 8 | 8 | 0 |
| scam | paypal_invoice_phone | 6 | 6 | 0 |
| scam | payroll_diversion | 5 | 5 | 0 |
| scam | split_payments | 6 | 6 | 0 |
| scam | supplier_contact_mismatch | 5 | 5 | 0 |

## Rule hits

| Rule | Hits |
|---|---|
| R1 red | 21 |
| R2 red | 18 |
| R3 red | 8 |
| R4 red | 6 |
| R5 red | 5 |
| R6 amber | 26 |
| R7 amber | 16 |
| R7 red | 8 |
| R8 red | 11 |

Languages in the set: en, ur, es, ar.

## Misses and false alarms

None.

