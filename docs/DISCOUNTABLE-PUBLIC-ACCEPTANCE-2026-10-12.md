# Public property discountable checks — 12 October 2026

## Scope and outcome

Retrieved five public 2025 collector bills afresh on 12 October, including three independently indexed Bradford properties. Compared original HTML against the current deterministic parsers and rendered amounts. No client example was required. No missing published discountable subtotal was found in these samples.

| County | Property | Printed discountable subtotal | Verified outcome |
| --- | --- | --- | --- |
| Miami-Dade | 1900 N Bayshore Dr, Unit 512 | $3,477.20 | Fresh browser source, identity/year-checked parser and rendering pass. Account history confirms 2025 is latest listed annual bill. |
| Osceola | 3250 Vineland Rd | $285,389.65 | Fresh browser source, authoritative R-account/year-checked parser and rendering pass. Account history confirms 2025 is latest listed annual bill. |
| Bradford | 5604 NW CR 125, Lawtey; 01250-0-00401 | No labelled subtotal | Fresh public bill parses total tax $515.83. Fresh authenticated staging lookup matches parcel and returns no extraction errors; subtotal remains null. |
| Bradford | 11130 SW 85th Ave, Hampton; 00893-0-00200 | No labelled subtotal | Fresh public installment bill parser retains total tax $1,738.27 and null subtotal. This is a subtotal/parser check, not complete installment-payment acceptance. |
| Bradford | 10066 S Florida Ave, Hampton; 05079-0-01314 | No labelled subtotal | Fresh public bill parses total tax $635.37. Fresh authenticated staging lookup matches parcel and returns no extraction errors; subtotal remains null. |

Bradford pages print combined taxes and receipt discounts, but none of these three explicitly publishes a discountable subtotal or property-specific eligibility rule. Those other fields are not relabelled as total discountable. Sampling does not establish that every Bradford bill omits the field, or that the client's unspecified cases are resolved.

## Discovered defect and fix

Two new Bradford samples initially failed the existing receipt/history date reconciliation. The same dates were displayed as `01/10/2026` versus `1/10/2026`, and `03/12/2026` versus `3/12/2026`. Added a strict calendar-date comparison accepting zero-padding differences while preserving both source strings. Truly different or invalid dates still reject. No amount calculation or liability scope changed.

New source-derived fixtures retain original public HTML, URLs, retrieval times and SHA256 in `tests/fixtures/client/discountable-public-2026-10-12/manifest.json`. Synthetic positive/zero/conflicting subtotal additions are explicitly identified in tests and are not represented as published Bradford evidence. Fixtures are offline checks only, never runtime fallback.

## Release and checks

- Active staging release: `/home/interns/apps/taxes/releases/besil-20261012-discountable-public-v10`.
- Built from the then-current `besil-20261012-historical-search-v9`, preserving its newer independent historical-search work. Only `lib/client/visualgov.mjs` differs under `lib/`.
- Resolver SHA256: `64613215e7bc7935724f3fd2e34d2a9a8bd60baadb98a908bc470d35d0c00cf5`, matching local and deployed code.
- Local baseline HEAD: `024e558037ca3bd973f2744d0677c9e6cba53a00`, existing uncommitted changes preserved. No Git push or production deployment.
- Exact v10 release: 9 new public-source tests + 6 VisualGov regression tests + 13 client feedback integration tests = **28 passed, zero failed**. Self-host build and local `git diff --check` passed.
- New tests cover all five source bills, rendering, account/year rejection, padding-only date agreement, genuine date disagreement, invalid dates, missing subtotal, positive/zero labelled values and conflicts.
- An initial activation guard correctly withheld deployment. Staging was independently advancing from historical-search v8 to v9; prepared patch was rebased onto v9, tests rerun, and activation occurred only after no unfinished current-process requests remained. Prior releases retained for rollback. Environment, credentials and ledger unchanged.

## Fresh staging acceptance

Authenticated running-service API checks:

- 5604 NW CR 125: request `5472ed86-79a6-46b1-9921-a34e82126953`, HTTP 200, MATCHED, errors empty, total tax $515.83, totalDiscountable null with source explanation.
- 10066 S Florida Ave: request `499748f3-7740-4924-8492-5ff6bf9c1f33`, HTTP 200, MATCHED, errors empty, total tax $635.37, totalDiscountable null with source explanation.

The server could not connect back to its public HTTPS address (connection refused before any lookup), so these two authenticated checks used the running staging service on `127.0.0.1:3000`. They establish live source → running client API output, not a fresh external Nginx/portal acceptance. Source-derived rendering tests passed independently. Miami/Osceola checks used fresh original browser HTML plus parser/rendering tests; no new full live app lookup was performed for those two in this turn.

## Cost and limitations

No paid browser/provider call was made for this task. Research used web search, the user's ordinary browser and direct public HTTP. Bradford staging requests used the direct source path. No paid ledger was created, reset or expanded. Service restart was for the code release; no allowance setting changed.

This five-property sample validates published-subtotal extraction and accurate missing-field handling. It does not guarantee all county layouts, establish historical liability clearance, or supply a real Bradford positive subtotal example. Independent historical-search changes in the base release are outside this acceptance.

## Evidence

- [Fresh source manifest](evidence/discountable-public-2026-10-12/manifest.json)
- [Parsed source comparisons](evidence/discountable-public-2026-10-12/parser-results.json)
- [Fresh authenticated staging results](evidence/discountable-public-2026-10-12/staging-api.json)
- Original bill HTML and Miami/Osceola account-history captures are retained in the same evidence directory.
