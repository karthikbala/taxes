> Dated reference report. Recheck current runtime and budget; do not replay old tests automatically.

# Three-county client POC — 8 October 2026

Osceola and Bradford are now enabled alongside Miami-Dade at https://taxes.zeneral.ai/poc. All three use POST /api/v2/property/lookup with the existing POC Bearer key. This completes the requested extension to the two counties selected in the agreed plan. The client explicitly named Miami-Dade; Osceola and Bradford were our selected additional counties.

## Demonstration inputs and live proof

Selecting a county fills the correct address and owner. Miami is labelled as the client-supplied example; the two additional examples are labelled Zeneral-selected public properties. Order ID remains pass-through business metadata; every invocation gets a separate request ID.

| County | Address input | Owner input | Verified parcel | Annual bill | Extracted bill rows | Total / payment | Original bill |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Osceola | 3250 VINELAND RD | WAL-MART STORES EAST LP | 02-25-28-2850-0001-0010 | 2025 | 11 ad valorem + 1 fire assessment | $285,389.65 / $273,974.06 | PDF |
| Bradford | 14500 S HWY 301 | WALMART STORES EAST, LP | 04708-0-00200 | 2025 | 5 ad valorem | $201,605.05 / $193,540.85 | HTML |

Both fresh hosted results matched the parcel/account join with zero technical errors. Osceola receipt 121702900 and Bradford receipt 45176 were verified. Both payments are dated 11/18/2025. Current account balances are $0.00; historical clearance remains unproven.

- [Osceola corrected live JSON, v26](three-counties/osceola-hosted-v26.json), request dc1735e6-d4e6-447c-881b-c1a98ddeabe2; HTTP 200, 32.125 seconds.
- [Bradford final UI JSON, v27](three-counties/bradford-ui-v27.json), request 150986d6-0a39-4555-ae9d-f54c22357188; 6.6 seconds.
- [Final browser screenshot](three-counties/bradford-live-v27.png).
- [Final county coverage](three-counties/coverage-v27.json) shows exactly three enabled client workflows. The other 17 remain pending for the richer contract.
- [Private correlated logs](three-counties/final-correlated-events.json) include the final Bradford request. The bounded latest-100 log query did not return the older Osceola request; its authenticated API response remains the primary live proof.

## Implementation

Osceola: the native address API resolves a counted, complete result before collector search. Continuations are constrained to the same source/table/filter, with five-page/500-row caps. Source-compatible headers accompanied recovered access; the exact cause of the earlier 403 was not proven. Captured native coverage includes five certified years, working 2027 values, three sales, one land row, one building and 17 extra features. Certified assessed values use the county's soh_val field, with uncapped asd_val separately preserved. Native land acreage differs between source sections and remains independently labelled.

Osceola collector: the verified parcel leads to the authoritative R-prefixed account. Direct collector detail access returns 403, so the existing approved managed browser captures the county HTML and original PDF. It runs predefined JavaScript and uses no LLM extraction. All source status, identity, hashes and provenance are retained.

The PDF variant initially failed to expose authority rows because its header is MILL RATE rather than MILLAGE/MILLAGE RATE. A diagnostic capture retained native positioned text items; the parser was corrected and tested offline before a final fresh live run. It now retains all 11 numeric authority rows, the nonnumeric SCH LOCAL BD heading as context, and one Fire Rescue Commercial assessment. Ad valorem $189,066.86 plus non-ad valorem $96,322.79 equals $285,389.65. Calculated millage 13.85430 agrees with printed 13.8543. Fire-assessment rate 0.4289 and printed Sq Ft label are preserved; an unprinted quantity stays null. Receipt and paid-by fields come from printed PDF text. The old mailing-address extraction that accidentally captured tax-table rows was corrected to null when the address boundary could not be established.

Bradford: full native record search publishes total record/page counts. The example address returns two parcels; owner comparison selects Walmart and avoids the neighbouring Florida Credit Union parcel. The adapter captures current 2026 Preliminary values, four sales including native zero prices, ten component rows and an identity-verified one-page property record card. The HTML and property card both abbreviate the legal description, so its completeness remains partial.

Bradford collector: native parcel search resolves the annual bill and original HTML, with five authority rows, receipt/payment, amounts and 14 historical annual years. The parser validates identity/year, duplicate/conflicting rows, printed totals and rate arithmetic. Rates are preserved as source-displayed fractional rates, with explicit unit fields; they are not silently relabelled as mills. The UI displays the units in plain language. No collector source PDF is manufactured.

The shared engine selects the county resolver/enricher and retains successful source sections on failures. Matching, source bounds, API authentication, request-ID logs and no-reference-fallback behavior remain intact.

## Coverage limits

All three county profiles are verified_partial. This means fresh matching and extraction passed for the published demonstration properties, with explicit source gaps; it does not claim every property type or every requested field is published.

- Benefits, authority-specific taxable/exemption values and occupancy remain unavailable where the inspected sources do not publish them.
- Osceola certified and working years stay separate. Component valuation years are unpublished.
- Bradford current assessment is preliminary; a newer assessment is not substituted into the 2025 bill. Only the displayed assessment year is captured in its canonical assessment history. Legal text is abbreviated.
- A blank exemption area is described as a blank source area, not proof that the property has no exemptions.
- Public annual-history parsing is now distinguished from full historical coverage. publishedHistoryCoverage can be COMPLETE while delinquency coverage stays PARTIAL. hasActiveDelinquency and totalPriorYearsDue remain null when certificate/deed/prior-year scope is unproven; current PAID status and the explicit balance remain separately reported.
- Full certificate/deed portal coverage, unsupported scanned-PDF OCR, production persisted order workflows and the remaining 17 county contracts are still outside this completed milestone.

## Validation and release evidence

- Initial integration 87f010cd495529cc6d9a76422527a6f311b565aa: 74 focused checks passed before hosted county evaluation; final narrow composed check repeated after the section-status fix. Direct Bradford lookup also passed with eight source requests; direct Osceola preserved appraiser sections and exposed its collector block.
- Native adapter checks: Osceola 14/14, Bradford 12/12; HTML bill parser 6/6.
- Shared PDF/history fix b0caefe75d82151624670b2295d7e3af0ede698d: 52 affected parser/engine/contract/classifier/logging/UI checks passed. These include native positioned-item fixture proof, wrong identity/year, missing cells and existing Miami/Pasco/Santa Rosa controls.
- Final profile/UI-only change b184c17c610ebbb055c23beb6b7f025d5f82af3b: 16 UI/contract checks passed, build passed. Previously accepted source/parser evidence was reused; no duplicate paid Osceola replay was performed merely for the final profile labels.
- Final saved version: appgprj_6ac53842fb58819195dbc8435c4116e9~appgver_105267febd30819180ec4b590e93f1a2 (v27).
- Final deployment: appgdep_6ac758a79b988191894c7814daf30bd6; succeeded, environment revision 2.
- Archive: outputs/client-poc-three-counties-final-v27.tar.gz.
- Final hosted coverage endpoint HTTP 200, three enabled workflows. Browser county switching fills both new examples correctly; Bradford renders 22 section cards, five tax rows and HTML provenance.
- [Initial integration checks](three-counties/release-checks-74.txt), [final shared checks](three-counties/final-parser-engine-checks-52.txt), [final UI/contract checks](three-counties/final-profile-ui-checks-16.txt).

Native appraiser and bill-layout fixtures are under tests/fixtures/client in the standalone application. The Osceola layout fixture contains source-extracted text positions and original source metadata; it is not a fabricated PDF. Older Bradford bill fixtures are labelled October 6 historical references; the hosted acceptance files above contain current results. No runtime reads a saved fixture.

## Budget, time and isolation

Shared ledger before this milestone: $1.32 spent, $0 reserved, cap $5. Latest final preflight: $1.48 spent, $0 reserved, $3.52 remaining. Three Osceola managed source captures were used: initial joined run, new diagnostic capture and corrected-parser acceptance. The shared ledger includes other website activity, so its full change is not attributed solely to this chat. No new service, subscription, limit reset or limit increase occurred. Provider spending is distinct from coding-chat allowance.

Work started at 13:31:59 IST, with a checkpoint around 14:02 IST and a 60-minute milestone cap. The extension was completed within that cap. One owner integrated/released; bounded agents owned separate appraiser/parser lanes and stopped after their acceptance.

Source changes remain isolated in the original standalone checkout. No PortTrack source, recipes, deployment or paid generation work was changed. No client email or message was sent.

