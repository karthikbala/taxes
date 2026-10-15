# Local POC: twenty phase counties — 14 October 2026

The user accepted the observed field scope and requested all twenty counties in the local `/poc`. Updated the existing local branch `codex/twenty-county-local`; nothing was pushed, published, deployed or merged.

## Visible workflows

The dropdown starts with Phase 1 (ten counties), then Phase 2 (ten counties). Baker's collector-only workflow and Allegheny remain in an additional group, giving 22 total choices. The broader annual-roll catalogue does not enter the POC. Added county choices have explicit source/field limitations and are not labelled as fully accepted.

All twenty phase counties accept exact parcel identifiers and submit authenticated v3 durable parcel jobs. Bradford, Miami-Dade and Osceola retain their v2 address/owner jobs, including Bradford automatic mailing/site detection and Miami neighbour controls. An entered parcel takes priority and disables unrelated address/owner fields. Palm Beach's optional account remains same-parcel scoped. Original documents are always requested by full-field parcel jobs. County switches clear parcel/account identifiers and preserve typed address/owner; explicit examples never start a request.

## Results

Render all available full-field client sections, including assessment, bills, tax totals, payments, millage, published history, delinquency and original-document metadata. Field gaps retain their reasons and evidence. A separate collapsible section retains native county property/assessment data, collector identity, full payments/history and parsed documents, including fields not represented by the normalized contract. This avoids dropping source-specific values from the earlier inventory.

Saved jobs retain their v2/v3 namespace. Reload restoration fills the exact parcel/account or address inputs without dispatching a new lookup. Cancel/resume uses the matching authenticated API. Query links may use `?job=ID&api=v3` for parcel jobs; existing address links remain compatible. Credentials stay in page memory.

## Verification and limits

Controller checks exercise all twenty phase parcel routes, the two additional workflows, exact input/auth, relevant fields, historical versus current labels, no automatic annual-roll fallback, restored v3 parcel jobs, millage/payment/native-field rendering and existing identity-review handling. Build and whitespace checks passed. Final full-suite result is recorded in `/tmp/poc-twenty-full-tests.log`.

These changes expose existing extraction, rather than claim every field is available on every property. Restricted collectors still need authorized recovery; the local preview keeps paid access disabled. Palm Beach's annual collector bill path and Polk's conflicting date retain their earlier limitations. The twelve-per-county acceptance requirement is separate from the user's accepted sampled field scope. No old capture was installed as a runtime fallback, no ledger was reset and no paid requests were made.

## Browser/source checkpoint

Actual Chrome inspection confirmed Phase 1/Phase 2 groups (10 each), two additional existing workflows, and the native parcel route. A new unpaid Bradford lookup for parcel `04708-0-00200` completed locally as `completed_with_gaps`, job `377708ea-4dd2-464c-9d49-3412f2a86879`, on 14 October 2026. It returned the exact Walmart owner/site, 2026 assessment, 2025 original HTML bill, $201,605.05 ad-valorem/combined taxes, $0.00 non-ad-valorem/current balance, $193,540.85 paid on 11/18/2025 and receipt 45176. The POC rendered the full sections and retained source gaps. This is one fresh property check, not twenty-county or 240-property acceptance.

Payment aliases use the same original bill's evidence. County/non-school taxable values retain an explicit basis. Improvement/taxable/exemption values render as currency while millage stays a rate. Missing discountable proof from the original HTML is retained rather than discarded. Resumed HTTP artifacts retain their original retrieval timestamps.

Final verification: full suite **523/523 passed** (`/tmp/poc-twenty-final-full.log`), then **65/65** final focused checks passed after evidence/timestamp and original-HTML omission safeguards (`/tmp/poc-twenty-verified-focused.log`). Build and whitespace checks passed. Reprocessed the same Bradford job from its captured artifacts for the final display; this is not counted as another independently verified property. Confirmed summed millage **20.03510000 mills**, the original paid amount/date in both bill and payment sections, and explicit source-absence handling for discountable subtotal. Local preview remains at `http://127.0.0.1:18322/poc`.
