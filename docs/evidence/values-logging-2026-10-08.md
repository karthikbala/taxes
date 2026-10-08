> Dated reference report. Recheck current runtime and budget; do not replay old tests automatically.

# POC values and debugging update — 8 October 2026

Published at https://taxes.zeneral.ai/poc. User request: inspect their latest test, improve logging, show extracted values, explain every empty section, and remove the top Partial badge.

## Latest user test review

Production logs show the latest browser POST at 12:43:33 pm IST returning HTTP 200 with a 33.227-second Worker invocation. The inner collector event reported succeeded; that was only a sub-lookup, not a full client-contract coverage verdict. Previously, the v2 route lacked its own correlated stage/final summary. Older history coverage caused the top badge to say Partial; it was not a failed property match or PDF extraction.

## Changes

- Every returned section now displays values recursively as fields, lists or tables. Source strings are inserted with textContent; source HTML cannot become executable UI markup.
- Null/undefined/blank values display "Not published / unavailable"; legitimate zeros and false remain visible.
- Every EMPTY section has an explanatory comment, including LandBuildingExtraFeatures. Unavailable or unverified-empty sections retain separate descriptions.
- The top successful/partial delivery badge reads "Results ready". Historical and section coverage remain accurate, and the JSON contract is unchanged.
- One request ID is assigned before authentication, returned in X-Request-ID, reused as ExtractionMetadata.request_id, displayed in the UI and attached to structured server events.
- Logs cover API start/end, property/collector/history/PDF stages, source attempts/retries, source outcomes, error codes and final section/validation summary.
- New logging excludes request bodies, headers, source URLs, owner/address data, extracted values and credentials. Logging failures do not change lookup delivery.
- Structured events are available through the existing private production Worker logs; no new public log endpoint, order database or subscription was added.

## Verification

Final source: c7e522a3afca72a0fa3e2a72cf1a913656e985ca.
Saved version: appgprj_6ac53842fb58819195dbc8435c4116e9~appgver_11de86ed2294819196e625b953423ef4 (v23).
Deployment: appgdep_6ac7441dfa0c8191b74f85c6fb39eb55, succeeded, environment revision 2.
Archive: outputs/client-poc-values-logs-v23.tar.gz.

15 focused offline tests passed: renderer, safe structured logs, source-retry correlation and composed client lookup. Renderer fixture proof covers all 22 sections and 272 returned leaf values. Build passed. A hosted malformed JSON request returned HTTP 400 and its own X-Request-ID without source access.

One fresh live UI lookup, order VALUES-LOGS-20261008, completed in 32.2 seconds. Request ID: 0eac1349-4eda-4f22-9a10-1023ec4610ba.
- All 15 EXTRACTED sections rendered values; all 3 EMPTY sections had comments.
- Full result had 22 sections, exact Miami folio match and all 14 tax lines.
- Total $3,132.45; printed payment $3,007.15.
- Top badge Results ready; partial historical coverage still visible in its own section.
- Production logs contain 22 correlated new events with that ID. Final summary: MATCHED, 7 sources, 0 technical errors, 14 tax lines; bill/parcel/same-year authority checks matched.
- Direct collector HTTP 403 and successful managed browser recovery are recorded independently.
- The final logger's lookup duration is 29.272 seconds; UI/Worker total includes request overhead.

Evidence:
- [Fresh live JSON](values-logs/miami-live-v23.json)
- [Correlated events](values-logs/correlated-live-events-v23.json)
- [Focused tests](values-logs/focused-checks.txt)
- [Top status screenshot](values-logs/live-values-v23.png)
- [Extracted fields screenshot](values-logs/extracted-values-v23.png)

## How to debug future tests

Copy the displayed Request ID. Read recent production Worker logs for this exact Site with errors_only=false and a bounded limit of 100; filter the structured source.request_id to that ID. The initial/final client API events cover rejected requests, and the client lookup summary distinguishes data/coverage outcome from HTTP status. Inspect source_attempt and client_source_result events to separate access failure, retry recovery and source verification. The downloaded JSON carries the same ID and the full source/validation/provenance details without putting extracted property data into logs.

## Cost and scope

Pre-check ledger: $1.20 spent, $0 reserved, shared cap $5. This update's one paid acceptance lookup spent $0.04. Final ledger: $1.24 spent, $0 reserved, $3.76 remaining. No extra paid replay.
Implementation started 12:43:32 pm IST and completed within the 60-minute timebox. Local preview was used and stopped after verification. PortTrack source/deployment and county rollout scope were unchanged.

