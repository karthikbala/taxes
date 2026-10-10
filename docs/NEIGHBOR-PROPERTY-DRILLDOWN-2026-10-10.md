# Matching property detail flow — 10 October 2026

## Delivered behavior

Clicking a matching property title or its tile starts a fresh authenticated `POST /api/v2/property/lookup` through the existing deterministic engine. The selected county, address/unit and published owner evidence are used; original client order ID and transaction metadata are retained. Each operation has a new extraction request ID. API schemas and county adapters are unchanged.

The right-hand panel displays selected property identity, appraiser/assessor sections, identity-joined collector account, annual bill/PDF fields, section/source notes and full downloadable JSON. A timer starts immediately. One request owns the panel; the return control and other lookup actions are locked while pending. Source links and map selection do not dispatch property lookups.

The clicked folio must agree with both returned PropertyInformation.ParcelNumber and ExtractionMetadata.match.parcel_id before property sections are displayed. Missing or conflicting identity withholds sections while keeping raw JSON and errors visible. Missing published condo units or owners cannot trigger an ambiguous lookup. Raw owner mismatch outcomes remain explicit, including entity display-continuation limitations.

Back to neighbour results restores the original subject, scope, match/filter DOM, source/request metadata, elapsed time and neighbour JSON/download without another source request. A changed county/scope invalidates the saved neighbour context. The saved view is a return action, not a fallback to old source data after a live failure. No runtime LLM, new hosting dependency, subscription, source bypass or PortTrack credential/import was added.

## Engineering evidence

Standalone implementation `5c6c0790345b2161fe72c25c745ae3d4758507f7`; [authoritative CI](https://github.com/karthikbala/taxes/actions/runs/38024422529) passed 292 offline tests and the standalone build. Forty-nine focused checks passed before CI: selected order/context, co-owner selection, missing unit/owner/membership, matching and conflicting folios, renderer dispatch/bubbling, untouched client renderer and served module graph. Hosted build passed.

Injected local browser QA used explicitly synthetic detail fixtures: valid 12-B assessor/collector/JSON display; whole-tile 20-B click with a deliberately conflicting returned folio and withheld details; 16-C source failure; return after success/error/mismatch. One neighbour request and three deliberate detail cases were dispatched. No local source/provider calls or paid ledger were created.

## Published acceptance

Hosted source `a38df67617efcbd3c1aaaba5881801e133525ed1`, saved version 44, deployment `appgdep_6ac9c08bfdf081918f4773e926d8fcd9` succeeded. Existing public site, environment revision 2 and standalone/Linux deployment direction are preserved. Release preflight inspected 56 terminal paid-run rows and no active reservations/jobs.

One fresh neighbour request `340972aa-3d1e-424c-9c04-e7af118eb1c4` found Gaston's three matching units. Clicking 12-B generated request `7760e487-6c02-424d-9742-66511146dab2`, completed in 36.4 seconds, and verified folio `0132310520940` against both response fields. Collector join was `matched`; source errors were empty.

* Appraiser 2026 assessed/market value: $279,732; 890 sq.ft; published owner GASTON GIRARD.
* Latest annual collector bill: 2025, folio 01-3231-052-0940, 14 ad valorem rows, combined/ad valorem tax $6,196.01.
* Account paid, current amount due $0.00; payment $5,948.17 on 11/17/2025, receipt PTBTE-26-083587.
* Original annual-bill PDF SHA-256: `2a0e81ad8c80d7f47d7b70426d41ab63bf1a40b3acab30987642ec20b02a5415`. Full source URL/provenance is in the accepted JSON. Identity, annual year, combined tax and all authority-tax row checks reconciled.
* Browser confirmed those assessor/collector values were rendered and the selected JSON was shown. Back restored T-15, the original neighbour request ID and three matches without repeating extraction.

Assessment and annual-bill years are distinct. Historical delinquency/certificate/deed coverage remains partial; occupancy and an unsupported discountable total stay null. Complete navigation/data flow does not establish full historical clearance. No newer assessment values are substituted into the older bill.

## Spending and handoff

Existing approved combined cap $5: before acceptance $2.32 spent/$0 reserved; after one selected-property canary $2.36 spent/$0 reserved. Actual managed-browser charge $0.04. No budget reset, new provider instance, PortTrack credentials or runtime model calls. The local preview server was stopped after verification.

Evidence: `docs/evidence/neighbors-2026-10-10/12b-detail-live.json` and `12b-detail-live.png`. Use the GitHub standalone checkout for development. Normal UI clicks run live lookups and can consume the existing approved managed-access ledger; source access/coverage constraints remain visible. No client notification was sent.
