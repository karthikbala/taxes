# Bradford annual-bill investigation — 15 October 2026

## Result and requested deliverable

Investigated separate annual bills for Besil’s exact Callahan and Fletcher parcels so that annual ad-valorem/non-ad-valorem/combined taxes, authority millage, payment date and Amount Collected could be captured. **No separate annual bill was found through the reviewed public collector routes.** This is a verified retrieval limitation for these two samples, not a claim that the county has no annual bills in its internal records.

| Client case | Exact parcel | Fresh All Years results | Verified original types | Annual/receipt fields |
| --- | --- | --- | --- | --- |
| Callahan James R & Charlotte / 8280 SE SWEET BAY DR | `05194-0-00000` | 2 records: 2025, 2024 | 2 certificate notices | Not printed |
| Fletcher Carrie / 8130 SW 50TH PATH | `00420-0-00200` | 13 records: 2025 through 2013 | 13 certificate notices | Not printed |

Both public search queries had complete single-page results. Every returned original was freshly retrieved and verified against its own parcel, year, bill number and year-specific owner. No unrelated parcel or neighbouring owner was used. All fifteen originals omit annual authority rates/tax totals and owner payment receipts; archived zero balances remain distinct from confirmed payment or certificate redemption.

## Reviewed source paths

The [official Bradford search](https://www.bradfordtaxcollector.com/Property/SearchSelect?Accept=true&ClearData=True) was inspected in the real browser and through direct native requests. The actual search uses `POST /Property/Search`; selected records post the county-provided bill/year/status to `/Property/TaxBill`, which redirects these certificate records to `/Property/PriorBill`.

The latest 2025 Callahan bill is **1336500**, certificate **1116**, and the latest Fletcher bill is **108600**, certificate **50**. Each latest notice was independently inspected in the public UI. The county’s `Print Bill` handler opens `/Property/Print`; the print shell explicitly copies `window.opener.document.getElementById("custombody")`. It prints the same displayed notice, not a separately retrieved annual original. A browser popup was not exposed by the in-app browser, so print behavior was confirmed from the county’s actual handler and print-shell source rather than claiming a completed print-dialog test.

One bounded diagnostic per latest bill omitted the optional status hint from the native `/Property/TaxBill` POST while retaining the exact bill/year. Both returned a generic “service was not able to retrieve information” page, not an annual bill. These are recorded as unsuccessful diagnostics, not valid records. No guessed status-code grid or continued retries was performed.

Source trace: [dated source manifest](evidence/bradford-annual-bills-2026-10-15.json). It records timestamps, source URLs, response hashes, redirects, exact record identities and the missing-field outcomes. Forty direct diagnostic HTTP responses were retained across the two cases, including session forms, search, redirects, originals, print shells and the two unsuccessful optional-status probes. Browser navigation and one public JavaScript download are additional read-only source interactions; no managed provider was dispatched.

## Existing delivery and regression checks

All fifteen newly parsed originals match the previously accepted 14 October production API records for parcel/year/bill/owner, balances, certificate amounts and missing annual/payment fields. The parser’s `certificate.number` was compared with the client serializer’s documented `certificateNumber` key. An initial raw-object comparison flagged that serialization rename; normalized field comparison passed for all fifteen. The existing full source/API/public-UI/download acceptance remains the [14 October nine-case pass](BESIL-NINE-CASE-PRODUCTION-ACCEPTANCE-2026-10-14.md), with jobs `475055c2-0f97-48c7-857c-43ec174b933a` and `601cbc19-a953-4edf-8b92-c4b34b8bf568`. This investigation created no new production jobs and does not mislabel a replay as new production acceptance.

Added regression coverage verifies that a genuinely discovered year-specific annual bill retains its own combined tax, payment date/amount and receipt; an unrelated parcel or wrong year is rejected. The original Bradford Walmart annual HTML is the unaffected positive control. Added coverage for both client certificate examples checks that face amounts, interest and fees cannot stand in for annual tax totals, mills or receipt fields. Existing annual tests verify every authority/non-ad-valorem row, tax reconciliation, source fractional rates and conversion to summed mills.

Selected offline checks: `bradford-tax-history.test.mjs`, `bradford-delinquent.test.mjs`, `client-visualgov.test.mjs`: **19/19 passed** with the external-network guard. No application/runtime/parser behavior was changed; a broad new release or full-suite rerun was unnecessary for these test/documentation additions. The earlier engineering and nine-case acceptance evidence remains separately dated.

## Revision, usage and unresolved criterion

Review started on clean `codex/bradford-address-detection` at **`1fa311e8b299d78ac20335605af85fcdbac0214a`**, matching the remote branch. Loaded production was independently checked: PID **235505**, source **`d0b555f30ba11a74bea7d48396e454108b6c89f1`**, release `/opt/taxes-public/releases/production-accepted-20261013-d0b555f30ba1`. No production, interns staging, DNS, provider, credential or ledger changes were made.

Managed-browser usage for this investigation: **0 credits**, with no paid sessions or production jobs dispatched. Preflight read the current shared state: 668 remaining provider credits, 71 recorded historical receipt credits, zero active source jobs/provider sessions or unresolved application sessions, SQLite quick check `ok`. These are observed shared totals, not attributed to this investigation; other activity since 14 October is not erased or reclassified. Private operational captures stay in `outputs/bradford-annual-bills-2026-10-15/`; credentials and raw authenticated headers/cookies are excluded from the committed manifest.

**Unresolved criterion:** obtain an authentic annual original for the same parcel and bill year from a separately supplied county copy or another verified county endpoint. Only then can its annual authority table, tax totals, millage and printed payment receipt be added with independent identity/year provenance. Certificate face amounts and interest rates must not fill those fields. No discount, payment date or paid amount is inferred. The current unsent Besil reply already describes these omissions accurately and was not sent or changed during this investigation.
