# Besil feedback — change plan, 10 October 2026

## Request and baseline

Latest email from Besil Poulose (`besilp@invisiabpo.com`): **RE: POC/ Demo details FYR**, received 10 October 2026 at 02:43 IST (9 October 21:13 UTC). A sender-specific mailbox search confirmed it is the latest returned message from Besil. He reports generally satisfactory search results and requests three improvements below. No amounts or parcel IDs were supplied in this email.

Planning baseline: local `main` at `b9651bb`, tracking `origin/main`, clean before this document. Remote tracking state was inspected locally; no fetch or production-version verification was performed. The loaded public application may differ from this checkout. The handoff's v27 and README's v28 deployment references are dated evidence only.

Deliverable: an implementation and acceptance plan for Miami-Dade, Bradford and Osceola. This checkpoint changes documentation only. No application changes, external county requests, paid evaluations, mail replies or deployments were performed. Paid usage this session: none; current ledger balance was not queried. Live request/deployment IDs: none.

## 1. Recover missing delinquent amounts — first priority

**Client reproduction:** 1900 N Bayshore Dr, Unit 512, Miami, FL 33132-0000.

- Resolve the exact unit to its official folio and collector account; retain unit 512 throughout. The email does not give an owner name, which the current v2 API requires. Independently establish the source owner or obtain it before an end-to-end API reproduction; do not guess it.
- Trace collector account/history retrieval → `parseClientTaxHistory` in `lib/client/bill.mjs` → `classifyDelinquency` in `lib/client/delinquency.mjs` → integration in `lib/client/engine.mjs` → serialization and UI. Determine whether the relevant balance is absent from retrieval, dropped by parsing, misclassified, or hidden in presentation.
- Capture source-backed annual balances and any published active certificate/deed redemption amounts, with year, status, account, retrieval time and provenance. Integrate the source section actually needed for this case; independent full historical certificate/deed searches are a separate expansion if required.
- Preserve known positive delinquent amounts even when overall history is partial. Keep unknown aggregate liabilities null, show the known amounts and scope clearly, and avoid counting annual tax and its certificate/deed representation twice. Do not substitute certificate face values for current amounts due.

**Acceptance:** source → JSON → UI agrees for the exact unit/account and each reported year, including the available delinquent amount. Cover paid, partial-payment, current due versus delinquent, open/redeemed certificate, duplicate liability, missing amount and incomplete-history cases. A partial account view must not become a historical-clearance claim.

**Focused checks:** `tests/client-delinquency.test.mjs`, `tests/client-miami-status.test.mjs`, `tests/client-bill.test.mjs`, `tests/client-contract-gaps.test.mjs`, and a rendered output check in `tests/poc-render.test.mjs`.

## 2. Make street suffix optional while preserving identity

**Finding:** `normalizeMiamiAddress` normalizes common suffix spellings, but Miami, Osceola and Bradford resolvers compare normalized street strings for equality. There is no separate required suffix input in the v2 contract; the main change belongs in native search and candidate matching.

- Introduce shared structured comparison of house number, direction, street name, optional suffix and unit. Reuse it in `lib/client/miami.mjs`, `osceola.mjs` and `bradford.mjs`, with each county's native query behavior retained.
- If a suffix is supplied, require agreement after abbreviation normalization. If omitted, search the native index broadly enough and consider every matching suffix candidate. Preserve unit, directional and number identity; do not globally remove suffix-like words from street names.
- Use complete bounded results and the existing owner evidence to resolve candidates. Return `AMBIGUOUS` when multiple properties remain and `SEARCH_INCOMPLETE` when pagination/count cannot be verified. Review detail-page identity checks and shared neighbour callers as well as search filtering.
- Include the client spelling with a comma before `Unit 512`: current normalization takes text before the first comma, so unit extraction must be verified and corrected if needed. Separate `unit: "512"` and embedded-unit forms must agree; conflicting forms must fail explicitly.

**Acceptance:** suffix-present and suffix-omitted requests resolve to the same independently verified parcel in all three counties. Test abbreviations, different actual suffixes, direction collisions, numbered streets, missing/wrong/conflicting units, comma notation, multiple owner matches and incomplete pagination. No first-result selection.

**Focused checks:** `tests/client-miami.test.mjs`, `tests/client-osceola.test.mjs`, `tests/client-bradford.test.mjs`, `tests/client-counties-engine.test.mjs`, plus affected neighbour matching checks if the shared normalizer changes.

## 3. Capture published total discountable amounts

**Findings:** Bradford's `lib/client/visualgov.mjs` initializes `TaxAmounts.totalDiscountable` to null without extracting a printed subtotal. The PDF parser in `lib/client/bill.mjs` already recognizes a narrow set of discountable labels and a same-row amount. Existing Miami notes explain null for previously inspected PDFs, but those samples do not disprove values on the client's other tax pages.

- Inspect the collector page as well as the annual document for each affected county. Determine the source meaning of “total discountable” and distinguish it from total tax, payment amount, discount savings and a date-specific discounted payment.
- Add Bradford HTML label/value parsing. Extend Miami-Dade/Osceola PDF layouts or collector-page extraction according to actual captured evidence, including split labels/positioned text when observed.
- Join values only to the same parcel/account and bill year. Record field-level source URL/ID, timestamp, label/path or text coordinates and document hash. Resolve conflicting page/document values explicitly rather than silently overwriting.
- Retain source zero values. Keep null with a precise reason when the relevant source lacks the field or cannot be inspected; never infer eligibility from total tax or a payment difference. Verify serialization and renderer preserve the value and remove stale unavailable messaging when supported.

**Acceptance:** at least one independently verified published value per county appears identically in JSON and UI, with provenance. Also cover absent field, genuine zero, unrelated totals, conflicting values, wrong account/year and unavailable source. Besil gave no affected parcel examples for this issue; request exact property/year/page examples if existing source inspection does not reproduce it.

**Focused checks:** `tests/client-bill.test.mjs`, `tests/client-visualgov.test.mjs`, relevant county/engine checks, `tests/client-contract.test.mjs`, and `tests/poc-render.test.mjs`.

## Delivery sequence and checkpoints

1. **First milestone, timebox 60 minutes with a 30-minute checkpoint:** verify current source/deployment baseline before implementation, map the Bayshore identity, inventory available source-derived fixtures, and reproduce each report where evidence permits. Record confirmed versus unconfirmed causes and missing examples. No completion estimate for all repairs until source access and examples are established.
2. Implement narrowly: delinquency capture/integration, optional-suffix matching, then discountable extraction for the three counties. Add source-derived fixtures and the focused checks above; use the repository's network-blocked test harness. Preserve existing accepted property samples as unaffected controls. A shared normalizer change warrants checks of its neighbour callers.
3. Validate each repaired behavior from original source to authenticated client JSON to rendered UI. Direct source access first; any paid evaluation needs an exact hypothesis, property, attempt limit and cost ceiling, plus verification of the existing ledger and current authorization. This plan starts no live or paid lane.
4. Prepare a single reviewable change and dated findings with revision, checks, source/request IDs, actual acceptance and remaining gaps. Release only through the authorized hosting route after confirming the loaded baseline and target. No hosting/DNS migration is part of this feedback plan.
5. Prepare findings and proposed next steps for a reply to Besil after diagnosis. Sending a reply requires a user request. Other two-state requirements are expected **Monday, 12 October 2026**; state names and scope remain unspecified, so record them as a later intake dependency.

## Verification of this planning checkpoint

Read `AGENTS.md`, `README.md`, `docs/DEVELOPMENT-HANDOFF.md`, `docs/ARCHITECTURE.md`, the Miami contract-gap notes, and the relevant resolver/parser/classifier/integration code. Reviewed paths and test references against the local repository. No tests were run for this documentation-only plan; no claim of fresh county acceptance is made. All three client observations remain open pending reproduction and implementation.
