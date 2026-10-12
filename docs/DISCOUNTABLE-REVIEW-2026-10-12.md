# Total discountable review — 12 October 2026

## Results

Tested the exact active staging release `besil-20261012-pdf-recovery-v7` using its Node 22 runtime with the offline network guard enabled. All 13 tests in `tests/client-besil-feedback.test.mjs` passed. No paid capture or new county lookup was performed during this review.

| County | Evidence and result | Remaining acceptance |
| --- | --- | --- |
| Miami-Dade | Same-account/year HTML subtotal $3,477.20 passes parser, authenticated API and rendering tests. Today's existing live portal response `97c82784-0a2e-4705-bff4-32f7e82cdad3`, collected 10:59:05 IST, independently returns this value in `TaxAmounts.totalDiscountable` with the HTML label, bill URL, year and hash. | New client examples may use different source layouts. |
| Osceola | Source-derived 2025 HTML for 3250 Vineland Rd, account R022528-285000010010, returns $285,389.65. Exact deployed engine integration test passes, including original PDF plus supplemental HTML. | A fresh live end-to-end lookup was not performed in this review; fixture success is not new live acceptance. |
| Bradford | Printed-subtotal parser tests pass, including zero and conflicting labels. The recorded 2025 bill for 14500 S Hwy 301, parcel 04708-0-00200, has no labelled discountable subtotal, so null remains appropriate for that sample. Positive Bradford tests use explicit layout mutations and do not establish real-source positive acceptance. | Client's affected property/parcel, year and source link/screenshot are required to reproduce the reported missing subtotal. Requested asynchronously from user. |

## Cause and implementation status

Miami and Osceola's collector web bills can print a discountable subtotal absent from their original PDF. The existing implementation reads the verified sibling HTML bill and independently checks account, annual bill year and year-labelled amount section. The subtotal is distinct from combined taxes, the amount paid and the current delinquent balance.

No implementation changes or deployments were needed for these passing cases. Production was not inspected or changed. Reviewed deployed parser and renderer hashes against local files; collector-amounts, visualgov, bill and poc-render match. Local engine differs from staging due to existing work; tests were therefore also executed on the actual deployed release rather than assuming local engine equivalence. Existing local edits preserved.

## Checks

- Exact staging release: 13/13 client feedback checks passed.
- Local same feedback checks: 13/13 passed.
- Local contract, original bill/redemption and VisualGov test files also passed under the offline guard.
- Tests cover wrong account/year/type, absent labels, zero, conflicting values, verified field provenance and composed output.
- No provider cost, service restart, production change or new live-source acceptance claim.

Baseline local HEAD: `024e558037ca3bd973f2744d0677c9e6cba53a00` with existing uncommitted work. Prior Miami proof: `docs/evidence/miami-pdf-repair-2026-10-12/portal-verified-v7.json`.
