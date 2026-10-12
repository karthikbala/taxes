# Osceola appraiser recovery — 12 October 2026

## Cause and change

Staging received Cloudflare HTTP 403 challenges from both the official Osceola appraiser search page and native OData API. The same native API returned HTTP 200 from the maintainer's Mac. A normal staging page request with cookies and Referer did not remove the challenge. This failure existed in the prior release as well.

Code revision `8272b40b1db3b05fa49b6708a88051b701e62bc6` adds an Osceola-only recovery after a direct `source_blocked` result. One existing managed-browser session retrieves fresh native search, certified values, sales, land, buildings and extra-feature queries, plus the two exact queries used by the collector's independent assessment join. The ordinary county resolver drives bounded pagination and independently replays the captured JSON. County, address, owner, unit, parcel and collector-account checks remain enforced. Only approved native tables/query parameters are accepted; redirects, oversized/truncated output and incomplete results fail explicitly. No fixtures, saved property data or runtime model calls are used.

The existing collector capture still retrieves the source HTML and original annual PDF separately. Browser queries retain source URL, retrieval time and SHA-256; the initial direct 403 remains separately visible.

## Engineering and release proof

- Local offline suite: **343/343 passed**, including eight new recovery checks and existing county, transport, budget, PDF/HTML and UI checks. Local build and diff checks passed.
- GitHub offline CI for the exact code revision: [run 38227554920](https://github.com/karthikbala/taxes/actions/runs/38227554920), passed.
- Staging repeated **343/343** offline tests and build before activation.
- Release: `osceola-20261012-8272b40b1db3`, activated at `2026-10-12T09:05:39.965Z`; process PID `1541304`, process working directory verified against the release.
- Archive SHA-256: `ba1dfb0d9a340a6b74430c55e228244b3e6e2b059cd06c961221fb379f4e01a4`. All 566 tracked source-file hashes verified before installation.
- Prior release `merged-20261012-3a179daf4d7f` retained for rollback. SQLite backed up consistently before the atomic symlink switch. Environment and spending settings unchanged; no production deployment.

## Fresh source → JSON → UI acceptance

Submitted the Osceola sample through the authenticated [staging POC](https://taxes-staging.37-27-51-7.nip.io/poc), using order `OSCEOLA-RECOVERY-STAGING-20261012`, address `3250 VINELAND RD`, owner `WAL-MART STORES EAST LP`, transaction `REFI`.

Request ID: `1a77f6cf-7735-4eb7-b00b-8561ea70d23c`. Started `2026-10-12T09:06:03.843Z`, completed `09:06:57.037Z` in 53.2 seconds; API HTTP 200. This is new live evidence, independent of the source-derived offline fixtures and earlier Miami/Bradford acceptance.

| Check | Fresh result |
| --- | --- |
| Address/owner match | `MATCHED`, parcel `02-25-28-2850-0001-0010` |
| Recovered appraiser sources | All eight native responses HTTP 200, verified, hashed |
| Collector identity | `R022528-285000010010`, independently links to the appraiser parcel; join `matched` |
| Certified assessment | 2026, certified 6 October 2026; assessed/market value **$13,641,900** |
| Original annual bill | 2025 PDF; parcel and tax year `MATCHED` |
| Tax authority rows | 11 ad valorem, each calculated tax matches the printed tax |
| Non-ad-valorem rows | One; **$96,322.79** |
| Ad valorem total | **$189,066.86** |
| Annual total and discountable subtotal | **$285,389.65** each; combined and printed totals reconcile |
| Current collector balance | **$0.00**, paid in full |
| Payment | **$273,974.06**, 18 November 2025, receipt `121702900` |
| Sales | Three native rows |
| Extraction errors | Empty array |
| UI | Results ready; exact parcel, bill year, amounts and payment rendered; JSON downloaded from the page DOM and independently asserted |

Original annual PDF SHA-256: `472dea39f0d24ef16030c2b56cce97645c6f9c585981e680d6d9af1c5e605523`.

The latest certified assessment remains 2026, separately from the 2025 bill; captured appraiser history includes the bill year. Overall status correctly remains `partial`: benefits/exemptions and grouped authority totals are unavailable in the captured sources, and the public account view does not establish complete historical annual/certificate/deed clearance. These are explicit coverage gaps, not extraction errors or a claim of no historical liability.

## Paid use and cleanup

Defined live scope: this Osceola sample only, maximum two full requests/four browser sessions, planned ceiling 16 credits ($0.32 at the application's $0.02/credit accounting). Used **one full request, two browser sessions, six credits ($0.12)**. Provider balance fell from 952 to 946 credits. No ledger was created, reset or topped up; the pre-existing explicit staging-only bypass and capture limit 10 were preserved.

Appraiser session `01a12f5c-abbb-714b-8b5d-d36dcef21443` completed its queries, but the first runtime DELETE did not confirm cleanup. Operator cleanup of that exact session returned HTTP 200/success at `09:08:03Z`, billed four credits. Collector session `01a12f5c-cf62-7784-8225-ad26a9231bf1` closed normally and billed two credits. Both provider sessions were independently confirmed `destroyed`. The initial cleanup error cause was not exposed by the existing runtime; no assumption of free usage was made.

Final preflight at `2026-10-12T09:09:25.768Z`: zero active provider sessions, zero open client lookups, zero reserved runs; no paid work left running.

## Evidence retained

Private local evidence: `outputs/osceola-recovery-2026-10-12/` contains the fresh client JSON, UI summary/tax screenshots, source manifest, release archive, deployment script and final provider/preflight snapshot. The runtime release receipt and consistent database backup are retained in staging's Taxes admin directory. Credentials and raw authenticated headers are excluded.
