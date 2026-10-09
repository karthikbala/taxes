# Miami-Dade neighbour check — 9 October 2026

## Delivered behavior

The authenticated `POST /api/v2/property/neighbors` endpoint and `/poc` neighbour button independently resolve the subject address/unit, retrieve official Miami-Dade parcel geometry and appraiser ownership, and return JSON with field/source provenance. Existing tax lookup remains separate. This feature is Miami-Dade only; no collector calls, model calls or paid providers are involved.

Abutting land parcels and same-building condominium units are separate scopes. Official published parent-folio links provide the condo-site geometry; individual units are never drawn as separate land footprints. Shared edges, corner touches, gaps and unsupported geometry are distinct outcomes. The app compares complete registered owner-name sets, shared co-owner names and the requested owner name, without treating name similarity as legal identity.

Default detail cap is 50 (maximum 100), concurrency two, deadline 120 seconds. Candidate enumeration is paginated and bounded. Large building indexes use bounded official owner searches to prioritize candidates. Unexamined candidates, unavailable owners, unsupported geometry and incomplete indexes remain explicit; absence of observed matches cannot become a clearance claim. Entity continuation lines are grouped for comparison while preserving original source names.

## API

Use the existing Bearer access key. The normal lookup fields are accepted, plus optional `neighborOptions` with `sameBuilding`, `adjacency`, `includeCornerTouch` and `maxCandidates`. Options default to both scopes, no corner-touch inclusion and 50 detailed candidates. This endpoint does not accept arbitrary source URLs. Other counties return an explicit unsupported result.

## Source-backed acceptance

* Client default: 555 NE 15 ST UNIT 401 / JUDE PATRICK JACOB, folio 0132310520010. Published parent 0132310520001 supplies condo-site geometry. A fresh bounded run enumerated 382 candidates, inspected 50 and found no confirmed owner-name matches among those inspections. Coverage remains incomplete and aggregate absence remains unknown.
* One verified abutting land parcel: 0132310060210, 464 NE 16 ST, source owner display lines TRINITY EPISCOPAL CATHEDRAL; INC. A 4.42 m gap parcel is excluded from abutting results. Another large geometry is explicitly unsupported under the local projection bound.
* Positive independent example: 555 NE 15 ST UNIT T-15 / GASTON GIRARD, folio 0132310520640. Fresh detailed records confirmed same-building and owner-name matches at folios 0132310520940 (12-B), 0132310521010 (20-B) and 0132310521220 (16-C). Positive findings remain true despite the bounded overall scope. No claim of unique legal-person identity is made.
* Fixed shared Miami resolution: when the native explicit alphanumeric-unit filter reports incomplete/no result, a bounded complete street index resolves only the exact corroborated unit. Missing/conflicting units and reference-only parent rows cannot silently select a property.

Sanitized source/result evidence is in `docs/evidence/neighbors-2026-10-09/`. Live values are dated; fixtures are offline regression evidence, never runtime fallback.

## Validation and release

Selected offline checks: 86 passed, covering geometry, owner/entity matching, pagination and limits, API authentication, UI rendering, shared Miami resolution and existing lookup/server controls. Standalone and hosted builds passed. A local browser run verified authenticated source fetching, SVG map, separate unit list and coverage comments. GitHub CI and final published acceptance are recorded below after release.

No paid source/provider or runtime model requests were made. No PortTrack files, credentials or deployment were changed. GitHub remains the canonical standalone Node/Linux project; publication updates the existing demonstration host only.

### Release evidence

* Canonical standalone implementation: `b9910dd61a9b6cc95d3eeb3d060d3eece3403b95`; [CI run](https://github.com/karthikbala/taxes/actions/runs/37893788875) passed all 280 offline tests and the standalone build. An earlier CI run found the stale checked-in HTML copy; it was synchronized, checked and rebuilt before final publication.
* Final hosted source: `281e3e099984e8fb0c808e3871322faf375a594c`, version 37; deployment `appgdep_6ac88ad6ac64819196a048a3556dc417` succeeded at 06:34:29 UTC. This includes rebuilt static POC HTML; preceding version 36 had the new API but retained an older static page and is not the accepted final demo.
* Release preflight read all 50 browser-run rows: no running/pending requests. Existing ledger stayed $2.08 spent, $0 reserved, $5 combined cap. No budget reset or paid neighbour calls.
* Source/page packaging checks confirmed the neighbor controls in the final archive. Final production source-to-JSON-to-UI verification follows below.

### Published acceptance

At taxes.zeneral.ai/poc, request `14a4d75d-9833-424c-96fc-b7dc9b0a2241` fetched the client-default parcel live, returned 50 independently checked records (one abutting parcel and 49 condo units) from 382 discovered candidates, and rendered two authoritative parcel polygons. Owner names, published-parent map anchor and the incomplete-coverage warning were visible. No unobserved-negative conclusion was made.

Authenticated production JSON request `124c0bbd-7617-414f-abfe-92c2d99d1141` resolved T-15 / GASTON GIRARD and confirmed three exact registered-name matches at 12-B, 20-B and 16-C; errors were empty. Response is saved in `production-positive.json`. This proves the deployed positive branch; partial scope remains explicit. The final compact map-control styling preserves these extraction modules.

Final layout release: standalone `8066339ac3200108c0761490368fd14abced5330` passed [CI](https://github.com/karthikbala/taxes/actions/runs/37894481714). Hosted source `e976d26238cc371b2f62846ad983f7128e8e1d1c`, version 38, deployment `appgdep_6ac88c07d6f08191a459c3d6bf239fb2` succeeded at 06:39:32 UTC. Only map-control width/margins changed after the version-37 source/API acceptance; extraction proof is reused for the unchanged modules. Local preview server was stopped.

Final version-38 browser acceptance: request `b2bd42b6-44d6-4dc7-bfaf-b57328677370` independently fetched T-15, enumerated 382 candidates, examined 50, and displayed all three confirmed GASTON GIRARD unit matches. The match-only filter and card selection were exercised. Compact map buttons measured 83–102 pixels wide. Screenshot: `docs/evidence/neighbors-2026-10-09/owner-matches.png`. The original Jude example remains the saved default; the open demonstration tab uses the separately verified positive example.

## UI follow-up — 9 October 2026

User requested the same elapsed timer as live client JSON and results beside the form. Both actions now own one right-hand result panel. Neighbour progress starts immediately at 0.0 seconds, stops on success/failure, keeps final elapsed time and explains the bounded wait. Both action buttons and the county selector are locked during a request. Switching actions clears stale rendered sections, JSON and download state; neighbour JSON is shown/downloaded through the shared controls. No source adapters changed.

Standalone code `261dbd1f1cd69ae37eab3687ef5fbcb72a6d5dc0`; [CI](https://github.com/karthikbala/taxes/actions/runs/37900338519) passed. Thirty focused offline checks passed, including timer success/failure and overlapping-request protection; standalone and hosted builds passed. Injected offline browser QA verified immediate progress, shared-panel placement, JSON correspondence and switching back to the client action.

Hosted source `9c8fa13f19ba04dd9cf295f5d1922f50751bc05a`, version 39, deployment `appgdep_6ac89aba10d881918619e33e3ba65c19` succeeded. Release preflight found no active paid browser jobs across all 50 rows. One direct, unpaid production neighbour call verified timer/panel behavior: request `9c9d180a-6b4f-4cbc-b1ad-ef11414b87a9`, subject `0132310520010`, 50 returned records, errors empty, final elapsed 29.5 seconds. DOM geometry confirmed results inside the panel to the right of the form. Paid provider and model calls: zero. No PortTrack changes.

Screenshots: `docs/evidence/neighbors-2026-10-09/panel-progress.png` and `panel-result.png`.

## Boundary-only scope and owner-first layout — 9 October 2026

User clarified that neighbours must share a parcel boundary. The previous 382 count combined 379 other condominium units and three nearby GIS folios, of which one was confirmed abutting. Default API options now use `sameBuilding:false`, `adjacency:true`, `includeCornerTouch:false`. Explicit same-building API requests remain supported. No building index or owner-index searches run for this default example.

Top-level `coverage.candidate_count` now counts eligible parcels after relationship filtering; `discovered_candidate_count` preserves pre-filter discovery counts, and `unclassified_geometry_count` explicitly records unresolved nearby shapes. Raw GIS query coverage includes the anchor object separately. Unsupported geometry stays partial and nullable negative findings stay unknown; it cannot be promoted to complete merely because it was excluded from displayed results.

UI leads with confirmed parcel count, owner-match count, subject identity and neighbour owner records. Consolidated search notes/limitations and source details follow the property cards. The map lives in a separate host immediately before full JSON. Existing timer, download and shared-panel behavior are preserved.

Standalone code `8d79251cd39bac83de4d262aa274fc1d6a513b40`; [CI](https://github.com/karthikbala/taxes/actions/runs/37902278416) passed. Fifty-nine selected checks passed, including authoritative GIS-fixture default-scope regression, incomplete geometry, optional condo scopes, bottom notes, separate map host and an unaffected client renderer. Standalone and hosted builds passed; local fixture UI verified ordering.

Hosted source `231d5e88967b38f434695d94829d28a34169cbe4`, version 40, deployment `appgdep_6ac89f81159c8191a019a9c1c377aeb1` succeeded. One direct, unpaid live lookup: request `9e450ccc-4845-420d-a7d6-836213a37b10`, 7.8 seconds, subject `0132310520010`, one ABUTTING result `0132310060210` / 464 NE 16 ST / source owners TRINITY EPISCOPAL CATHEDRAL; INC, no owner-name match. Eligible/examined/returned counts all one; discovered non-anchor folios three; one unresolved geometry; no detail cap, no condo-unit search, errors empty. Browser confirmed map immediately before JSON with two genuine parcel paths. All 50 paid-run rows were terminal at release preflight. No paid provider/model calls or PortTrack changes.

Evidence: `boundary-only-live.json` and `boundary-only-live.png` in the dated neighbour evidence directory.

## Optional same-building mode — 9 October 2026

Gaston T-15's three verified matches are other units in the same condominium building, not boundary-sharing land parcels. The boundary-only default correctly excluded them, but the demo offered no way to request the existing optional API scope. Added an unchecked **Include units in the same building** checkbox. UI sends an explicit scope snapshot; it locks during lookup, and changing scope clears prior neighbour data, map, JSON and download state. Parcel and unit counts/matches are labelled separately. Boundary-only remains the API and UI default; no adapter/parser changed.

Standalone code `f713d164430a07b387fd70ab9a4877b2a71e3300`; [CI](https://github.com/karthikbala/taxes/actions/runs/37907878807) passed. Thirty-three focused tests passed, including optional-scope dispatch, pending lock, stale-result invalidation and separate match counts; standalone and hosted builds passed. Local injected-fixture browser QA confirmed the checkbox and scope reset. All 50 paid-run rows were terminal at release preflight; no paid provider/model requests were added.

Hosted source `9c1527830b67fe0524e09f25601877c797df5cae`, version 41, deployment `appgdep_6ac8ac3dad208191bc330ae1b77f8e6c` succeeded. Fresh production acceptance is recorded below.

Fresh optional-unit production acceptance: request `f1f6445f-3f7c-4f59-bd17-a8e80cdf4bd3`, 37.9 seconds. T-15 / GASTON GIRARD returned one boundary-sharing parcel (zero parcel owner matches) and 49 checked same-building units (three unit owner matches): `0132310520940` / 12-B, `0132310521010` / 20-B and `0132310521220` / 16-C. All three detailed owner records publish GASTON GIRARD; errors empty. Match-only filter and unit selection verified in the right panel. Overall scope remains bounded and partial; matching findings remain positive. Full JSON and screenshot saved as `optional-units-live.json` / `optional-units-live.png`. CI passed 286 tests. Local fixture server stopped.
