# PDF transfer and Miami historical search — 12 October 2026

The original PDF transfer works, and an independent Clerk tax-deed search now runs during the matched Miami client lookup. The reported property passed fresh authenticated staging acceptance. **Full historical clearance is not established.**

## Fresh acceptance

- Staging: https://taxes-staging.37-27-51-7.nip.io/poc
- Address: **1900 N Bayshore Dr, Unit 512**, Miami, FL 33132-0000.
- Owner input: **ALLEN HASBUN**; parcel and collector account: **01-3231-067-0130**.
- Order: `MIAMI-HISTORICAL-FIX-V9-20261012`.
- Request: `4e7ea89d-9171-477f-bbeb-906cc46553f5`, collected `2026-10-12T06:01:28.023Z` (11:31:28 IST), duration 33.471 seconds.
- `errorMessage: NA`; `ExtractionMetadata.errors: []`; parcel join matched.
- Original **2025 Delinquent Tax Certificate Redemption** PDF extracted: **$4,085.87**, certificate **3299**, payable if received by **30 October 2026**. Printed charges, quote and history reconciliation all matched. The PDF is a redemption notice; unpublished annual tax-authority rows are not invented.
- Clerk search: `INSPECTED_EMPTY`, `query_verified: true`, `case_count: 0`, `coverage: COMPLETE_PUBLIC_QUERY`. The submitted and server-returned folio match. Status, party, certificate and sale-date filters are unrestricted.
- `hasActiveDelinquency: true` remains unchanged. No Clerk cases does not cancel the active certificate or its amount due.

## Cause and changes

The PDF transfer was already repaired in release v7 before this task. Its bounded chunks, byte-length/signature/SHA-256 verification and redemption parser were preserved, then verified again in the new live lookup. See the [PDF repair checkpoint](BESIL-MIAMI-PDF-REPAIR-2026-10-12.md).

The Clerk adapter previously submitted a search only as a diagnostic and returned `DISCOVERY_ONLY`; the client lookup never used its result. It also waited for network idle without first awaiting form navigation. The first v8 acceptance hit `page.content: Unable to retrieve content because the page is navigating and changing the content`. Its PDF evidence survived and both provider sessions closed.

Release v9 waits for the search navigation and the exact folio in the server's returned `data-original` attribute. It verifies a successful outgoing POST, the parcel echo, unrestricted filters and the explicit no-results container. Unexpected rows, case links or pagination prevent a negative conclusion. Blocked, failed, restricted and mismatched searches remain unavailable/incomplete; null counts are not converted to zero. The public search result is delivered with its source URL, retrieval time, SHA-256 and provenance.

The client no longer treats complete annual rows as proof of full certificate/deed clearance. Diagnostic requests now share the application's existing staging capture counter instead of constructing a fresh counter per request.

## Release and verification

- Baseline checkout: `024e558037ca3bd973f2744d0677c9e6cba53a00`, branch `main`, tracking `origin/main`; pre-existing edits preserved. No GitHub push or production deployment was performed for this task.
- This task deployed `besil-20261012-historical-search-v9`, retaining v7/v8 for rollback.
- The final receipt found a subsequent release, `besil-20261012-discountable-public-v10`, already active. All seven PDF/historical-search module hashes checked still match this task's local files. No later release was overwritten. Acceptance above belongs to the v9 request; the final receipt separately records the loaded v10 process.
- Full target Node 22 offline suite: **326 passed, zero failed**; self-host build passed on v9. The initial local full suite passed 325 tests before the additional shared-counter test; final focused tests passed. `git diff --check` passed.
- Tests cover successful empty search, wrong parcel, missing submission proof, restricted filters, failed POST, blocked/login/navigation failures, unexpected rows/pagination, no false historical clearance, client delivery alongside an original annual PDF, and the shared diagnostic capture cap. Existing PDF transfer/redemption tests passed in the full suite.
- No source values or fixtures are used as runtime fallbacks. The sanitized Clerk fixture is a source-derived excerpt; submission metadata in offline tests is explicitly scaffolding. Live submission proof comes from the fresh managed-browser request.

## Spending and cleanup

The existing staging-only ledger bypass was retained as previously authorized. No spending ledger was created or reset, and the configured capture limit was not increased.

Provider credits changed **970 → 956** during the observation window: **12 credits** for this task's two diagnostic captures and two acceptance lookups, plus **2 credits** for the separate portal lookup `a744f936-479a-447d-8b2c-a46338ff5e45` observed during investigation. The standalone diagnostic session `01a12ea7-f2a6-70b0-b5d4-730b8f262d11` billed two credits outside the service journal. Both acceptance lookups used two sessions each; the failed v8 Clerk session was also billed and closed. Final provider inventory: **zero active sessions**.

## Remaining historical limits

- Collector annual years **2008–2012** are unavailable in the retrieved account view.
- Independent full certificate-history search remains **NOT_IMPLEMENTED**; current certificate evidence comes from the verified collector history and original redemption PDF.
- The Clerk public index is not a certified full-history/title-clearance source. Positive cases and pagination are conservatively returned as `SEARCH_INCOMPLETE` until their source layouts and complete traversal are verified; this acceptance verifies the reported property's empty result only.
- Therefore full historical clearance remains **false/unconfirmed**, and overall historical coverage remains **PARTIAL**. Finishing that claim requires authoritative records covering the missing years and full certificate history. An official collector record/export or Besil's source link/example would identify that remaining evidence; it cannot be supplied by hiding warnings or replacing nulls with zero.

## Evidence and manual check

Open staging, use the existing access key, select Miami-Dade and REFI, and enter the address and owner above. Run **Fetch live client JSON**. Check `BillDetails.redemption`, `DelinquencyInformation.taxDeedSearch`, `coverageDetails` and the source list. A new lookup retrieves fresh source values, so use its own request ID/time when comparing later results.

- [Successful delivered client JSON](evidence/historical-search-2026-10-12/portal-verified-v9.json)
- [Original PDF values screenshot — click for full size](evidence/historical-search-2026-10-12/staging-pdf-v9.png)
- [Independent Clerk search screenshot — click for full size](evidence/historical-search-2026-10-12/staging-deed-search-v9.png)
- [Final server release, hashes, tests, usage and cleanup receipt](evidence/historical-search-2026-10-12/remote-receipt.json)
- [Local release metadata](evidence/historical-search-2026-10-12/release.json)
- [Retained failed v8 result](evidence/historical-search-2026-10-12/failed-v8-portal.json)
