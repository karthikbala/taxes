# Development handoff — 8 October 2026

Start with [AGENTS.md](../AGENTS.md), then [README setup/deployment](../README.md) and [architecture](ARCHITECTURE.md). This document records the accepted POC milestone; it is not a current deployment or budget assertion. Reverify the remote revision and loaded application before changes. This repository must remain usable after the original Mac checkout is deleted.

## Accepted snapshot

| Item | Dated evidence |
| --- | --- |
| Public POC | https://taxes.zeneral.ai/poc |
| Accepted source revision | `b184c17c610ebbb055c23beb6b7f025d5f82af3b` |
| Saved application version | v27, `appgver_105267febd30819180ec4b590e93f1a2` |
| Deployment | `appgdep_6ac758a79b988191894c7814daf30bd6`, succeeded, environment revision 2 |
| Rich client contract | Three enabled counties, all `verified_partial` |
| Legacy parcel workflows | 20 configured; 17 still pending the richer v2 address/owner contract |
| Budget snapshot | $1.48 spent, $0 reserved, $5 combined cap; verify the existing D1 ledger before future use |

The 67-county source catalogue is research/coverage metadata, not 67 completed crawlers. A legacy configured adapter does not establish v2 acceptance.

| County | Demonstration identity | Accepted bill evidence | Important limits |
| --- | --- | --- | --- |
| Miami-Dade | `555 NE 15 ST UNIT 401`; `JUDE PATRICK JACOB`; folio `01-3231-052-0010` | Client-supplied example; prior v23 live proof retained 14 tax rows, total $3,132.45, payment $3,007.15 | Occupancy and full prior-year clearance remain unproven; earlier proof is dated evidence |
| Osceola | `3250 VINELAND RD`; `WAL-MART STORES EAST LP`; parcel `02-25-28-2850-0001-0010` | 2025 original PDF; 11 ad valorem rows + one fire assessment; $285,389.65 total / $273,974.06 paid; receipt `121702900` | Direct collector blocked; approved deterministic browser recovery; certified/working years distinct, component years unpublished |
| Bradford | `14500 S HWY 301`; `WALMART STORES EAST, LP`; parcel `04708-0-00200` | 2025 original HTML; five ad valorem rows; $201,605.05 total / $193,540.85 paid; receipt `45176` | Two address candidates resolved by owner; current 2026 assessment preliminary, legal text abbreviated |

Osceola accepted API request: `dc1735e6-d4e6-447c-881b-c1a98ddeabe2` (v26). Bradford final UI/API request: `150986d6-0a39-4555-ae9d-f54c22357188` (v27). Both show 11/18/2025 payment and $0.00 current account balance. None proves complete historical clearance. Final UI/profile labels reused the accepted Osceola parser proof without another paid replay.

## How to continue

1. Clone the private repository, follow README setup and secret provisioning, and run the selected offline tests before any source access. Keep fixtures under `tests/fixtures/`; production must never read them as fallback data.
2. Confirm who owns shared integration/release and verify the deployment through the hosting account. Public `/api/v2/sources` describes capabilities; it does not expose a deployment SHA. Authorized `/api/v2/health` verifies readiness/preflight, not source correctness. Do not trigger an example lookup just to check the deployment.
3. Pick one county and one source family. Agree its sample, bounded milestone, source fields and acceptance gaps. Complete offline diagnosis/fix first; perform live acceptance only within explicit current scope/budget.

The remaining 17 are suggested family batches, not authorization for a fleet trial:

| Sequence | Pending counties | Starting point |
| --- | --- | --- |
| 1: TaxSys | Hillsborough, Lee, Sarasota, Pasco, Volusia, Santa Rosa, Charlotte, Martin, Hernando | Reuse verified deterministic collector/PDF path; add county-native address/owner and rich appraiser sections |
| 2: VisualGov | DeSoto, Union | Reuse Bradford HTML bill contract; independently validate native matching and history scope |
| 3: Phenix | Highlands, Polk, Pinellas, Columbia, Suwannee | Add native address/owner contract and verify collector/document identity per county |
| 4: Palm Beach | Palm Beach | Separate native appraiser/collector family; assessment notice is distinct from annual collector bill |

The authoritative collector-family mapping is `lib/live/phase-one.mjs` + `phase-two.mjs`, composed by `county-adapters.mjs`. **Pinellas, Columbia and Suwannee use Phenix**, not TaxSys. Preserve Pinellas displayed/internal parcel permutation, Martin collector-specific identifiers, and Osceola's authoritative R-prefixed collector account. These are identity rules, not generic string-normalization exceptions to ignore.

## Reuse engineering evidence

- Integration `87f010cd495529cc6d9a76422527a6f311b565aa`: 74 focused checks; native Osceola 14/14, Bradford 12/12, HTML parser 6/6.
- Shared parser/history fix `b0caefe75d82151624670b2295d7e3af0ede698d`: 52 focused checks, including positioned PDF items, wrong identity/year, missing cells and unaffected controls.
- Final revision `b184c17c610ebbb055c23beb6b7f025d5f82af3b`: 16 UI/contract checks and build passed. These totals are engineering evidence, not crawler coverage counts.
- Portable source-derived fixtures include the Osceola `MILL RATE` positioned-text layout, Bradford native search/detail/property card, HTML bill and negative cases, Miami source samples and explicit evidence manifests.

Preserve the dated reports `ZENERAL-THREE-COUNTY-POC-2026-10-08.md` and `ZENERAL-POC-VALUES-LOGGING-2026-10-08.md` with their sanitized JSON, screenshots, check logs and provenance in the private handoff evidence package. See README for the packaged location. Report-relative `outputs/` links require the associated evidence tree; copying report text alone does not preserve proof.

## Known gaps and debugging

The collector browser recovery uses predefined JavaScript; there are no model calls. Osceola's `MILL RATE` layout needed a parser correction; all numeric rows and the nonnumeric heading are now preserved. Bradford's original collector format stays HTML, with fractional rate units explicitly labelled.

Source blanks do not prove no exemption/benefit. Occupancy remains nullable. `publishedHistoryCoverage: COMPLETE` can coexist with delinquency coverage `PARTIAL`; certificate/deed scope, missing years and prior-year liabilities remain explicit. Retain successful appraiser sections when collector access fails.

Copy the displayed Request ID and correlate private structured Worker events (`client_api_*`, source attempts/results and final lookup summary). The same ID appears in `X-Request-ID` and `ExtractionMetadata.request_id`. Logs exclude secrets and extracted owner/address/property values; inspect the private returned JSON for field-level proof. A collector sub-stage success is not a complete client-contract verdict.

Out of this milestone: remaining 17 rich contracts, full certificate/deed research, unsupported scanned-PDF OCR, persisted production order workflows, new providers/subscriptions and PortTrack changes. No acceptance claim covers every property type. Save new limitations and a dated narrow checkpoint before expanding scope.
