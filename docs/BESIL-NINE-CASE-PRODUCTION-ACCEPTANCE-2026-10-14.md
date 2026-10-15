# Nine-case production acceptance — 14 October 2026

## Outcome and scope

All nine exact advertised cases passed fresh source → authenticated production API → rendered public POC → downloaded JSON acceptance. The two older demo controls, MIA-01 and BRA-01, ran first. All jobs returned `completed_with_gaps`, with matched owners/parcels and no extraction errors. Acceptance covers the advertised fields for these samples, with documented source gaps; it does not certify complete historical clearance or every property in a county. No application regression, code fix or deployment was needed.

## Revision and execution

Production process PID **235505** loaded **`d0b555f30ba11a74bea7d48396e454108b6c89f1`** from `/opt/taxes-public/releases/production-accepted-20261013-d0b555f30ba1`, service `taxes-public.service`, environment `production`, public endpoint https://taxes.zeneral.ai/poc. Verified before dispatch and after all UI restores. The review checkout started at **`b1b05f1b1b14810364e87df009c28ae0d356c2b2`** on `codex/bradford-address-detection`; its application/runtime files match the loaded release. This pass adds acceptance documentation/catalogue records only. The interns staging setup was not modified.

One fresh production job per case, nine total; no retries. Bradford used direct-only source access. Miami-Dade/Osceola used the existing deterministic recovery and already-authorized production override. No ledger recreation, cap/provider change, runtime LLM extraction or fixture fallback occurred. Preflight was **10:04:05 UTC / 15:34:05 IST**; all jobs were complete by **10:12:56 UTC / 15:42:56 IST**; independent source/UI verification completed **10:18:02 UTC / 15:48:02 IST**. Final accounting after restores at **10:20:30 UTC / 15:50:30 IST** was unchanged.

## Fresh result sheet

Every row has independently checked official source identity, original document hash/year, API field/row comparisons, actual public UI restoration and an actual JSON download identical to the API. All nine independent appraiser re-requests returned HTTP 200 and the exact same SHA-256 as the production capture. This is separate from offline fixture replay.

| Run order / case | Exact parcel | Job / public result | Source | API | UI / download |
| --- | --- | --- | --- | --- | --- |
| 1. MIA-01 | `01-3231-052-0010` | [71bd8b98-d241-4f2f-95b5-c1588f447beb](https://taxes.zeneral.ai/poc?job=71bd8b98-d241-4f2f-95b5-c1588f447beb) | PASS | PASS after reviewed change | PASS / identical |
| 2. BRA-01 | `04708-0-00200` | [80527818-46ae-4ab1-8901-e8d5433df086](https://taxes.zeneral.ai/poc?job=80527818-46ae-4ab1-8901-e8d5433df086) | PASS | PASS | PASS / identical |
| 3. MIA-02 | `01-3231-067-0130` | [f27c67b4-19f4-4b68-99de-4ac37ce8ee6b](https://taxes.zeneral.ai/poc?job=f27c67b4-19f4-4b68-99de-4ac37ce8ee6b) | PASS | PASS | PASS / identical |
| 4. MIA-03 | `01-0102-030-1070` | [89f77d16-60c2-4411-a403-f091319899ba](https://taxes.zeneral.ai/poc?job=89f77d16-60c2-4411-a403-f091319899ba) | PASS | PASS | PASS / identical |
| 5. OSC-01 | `02-25-28-2850-0001-0010` | [bc76d068-1508-441b-9dd4-4c0b1cf044a3](https://taxes.zeneral.ai/poc?job=bc76d068-1508-441b-9dd4-4c0b1cf044a3) | PASS | PASS | PASS / identical |
| 6. BRA-02 | `05632-0-00000` | [26903bea-a294-4fe5-8bb7-484358eae2e8](https://taxes.zeneral.ai/poc?job=26903bea-a294-4fe5-8bb7-484358eae2e8) | PASS | PASS | PASS / identical |
| 7. BRA-03 | `06203-C-01400` | [5b4a5251-47aa-4e45-888e-0843119984a5](https://taxes.zeneral.ai/poc?job=5b4a5251-47aa-4e45-888e-0843119984a5) | PASS | PASS | PASS / identical |
| 8. BRA-04 | `05194-0-00000` | [475055c2-0f97-48c7-857c-43ec174b933a](https://taxes.zeneral.ai/poc?job=475055c2-0f97-48c7-857c-43ec174b933a) | PASS | PASS | PASS / identical |
| 9. BRA-05 | `00420-0-00200` | [601cbc19-a953-4edf-8b92-c4b34b8bf568](https://taxes.zeneral.ai/poc?job=601cbc19-a953-4edf-8b92-c4b34b8bf568) | PASS | PASS | PASS / identical |

### Source comparisons and preserved behaviour

- **MIA-01**, `555 NE 15 ST UNIT 401`: 2025 total/discountable $3,132.45; paid $3,007.15 on 11/25/2025; 14 authorities, 20.37780 mills; 7 legal lines, 8 sales. The newly populated discountable field was independently matched to the same-account/year collector HTML.
- **BRA-01**, `14500 S HWY 301`: 2025 total $201,605.05; paid $193,540.85 on 11/18/2025; 5 authorities, 20.03510000 mills. Original collector HTML retained.
- **MIA-02**, `1900 N Bayshore, Unit 512`: Exact unit 512; due/redemption $4,085.87; certificate 3299, face $3,885.35; labelled discountable $3,477.20. Seven redemption charges reconcile; missing annual breakdown/payment receipt remains unavailable.
- **MIA-03**, `20 NE 10 ST`: 2025 $210,961.44 plus 2024 $207,723.09 = known payable subtotal $418,684.53; certificates 7 and 5. The original 2025 quote excludes the prior year. Discountable $183,039.14; no face-value double counting.
- **OSC-01**, `3250 VINELAND`: Authoritative R022528-285000010010; 2025 ad $189,066.86 + non-ad $96,322.79 = $285,389.65; paid $273,974.06 on 11/18/2025, receipt 121702900; 11 authorities plus fire, 13.85430 mills; current balance $0.00.
- **BRA-02**, `6557 SE CR 21B, Keystone Heights`: Detected site; 2025 ad $2,481.22 + non-ad $292.00 = $2,773.22; paid $2,662.29 on 11/26/2025; 15.54530000 mills; 14 published history rows, 4 original records.
- **BRA-03**, `334 SE 28TH ST, MELROSE, FL 32666`: Letter C preserved; same site/mailing parcel; 2025 ad $1,882.81 + non-ad $292.00 = $2,174.81; paid $2,087.82 on 11/25/2025; 15.64720000 mills; 14 published history rows, 1 original.
- **BRA-04**, `8280 SE SWEET BAY DR`: Automatically detected mailing address; actual site SE 11TH AVE, STARKE; 2 published liabilities, known subtotal $216.55, 2 originals. Certificate notice omissions remain explicit.
- **BRA-05**, `8130 SW 50TH PATH`: Automatically detected mailing address; actual site SW 180TH PL, BROOKER; 7 current liabilities, known subtotal $704.58; 13 original All Years records back to 2013. Archived zeros do not invent payment/lifecycle closure.

The original four PDFs were rendered and visually inspected; every printed annual authority rate/amount, redemption charge/quote, certificate and payment identity was checked. Miami/Osceola discountable amounts were independently checked against the labelled same-account/year collector web bill and its provenance hash. Bradford originals remain native HTML; each retrieved historical original retains its own parcel/year/source hash. Miami appraiser owners, legal lines, sales, assessment/benefit/taxable-value groups and years were compared with the native response; Bradford owner/site/legal/value/sales details and Osceola certified assessment years were compared with their native responses. Newer assessments remain separate from 2025 bills.

The checker reported `API_CHECKS_PASS` for eight cases. **MIA-01 reported `REVIEW_REQUIRED`, with no failures**, because its 8 October baseline had `totalDiscountable: null` and the fresh response has **$3,132.45**. Independent review of the fresh collector HTML label, account, year and source hash resolved this review positively. This is a source-backed newly populated field, not a regression. The immutable historical baseline is retained; future comparisons must account for this dated review.

## Validation and reusable evidence

- Reused the immediately preceding exact-checkout engineering evidence: **267/267 Besil offline checks, 518/518 full offline checks, and self-host build passed** at `b1b05f1`. No application files changed during this live pass. The ten focused offline regression checks passed again after the catalogue update. Documentation/catalogue links, JSON structure, recorded response hashes, and whitespace were reviewed after adding this report. An initial direct test command used a nonexistent guard-module path and did not execute the suite; the corrected command loaded the existing `scripts/test.mjs` guard and all ten checks passed.
- Fresh independent verification recorded 55/54/50/37/15/25/29/14/20 field checks for MIA-01/MIA-02/MIA-03/OSC-01/BRA-01/BRA-02/BRA-03/BRA-04/BRA-05 respectively. All nine full UI JSON envelopes and actual downloaded files equal the saved authenticated API response.
- Nine real public-page restorations were checked; restoring MIA-01 again left provider receipts/credits unchanged and created no source job. No address-mode selector is required.
- Private evidence is retained under `outputs/besil-production-2026-10-14/` locally and `/root/taxes-public-admin/besil-production-2026-10-14/` on the host: full responses, source hashes/URLs, independent appraiser captures, original PDF/HTML, source comparison script/report, UI text/screenshots, actual downloads and provider receipts. Operational output and authenticated headers/credentials are excluded from Git.
- The [case catalogue](regression/besil-cases.json) now records this dated pass separately from each older baseline. The `next_live_run: NOT_RUN` fields remain the blank template for a future pass; they do not negate the explicit dated `live_acceptance_runs`. The checker still cannot independently claim live UI/source acceptance.

## Paid usage and cleanup

Provider credit balance **792 → 775**; **17 new credits** across eight owned sessions (Miami 4 + 4 + 4; Osceola 5). Provider-receipt totals **13 → 30 credits** reconcile with the balance delta. Bradford used zero managed-browser credits. Every new receipt records completed cleanup. Final preflight: **0 active provider sessions, 0 active/retry jobs, 0 unresolved application sessions**, SQLite quick check `ok`. Existing production override/ledger state remained unchanged. Provider credits are reported as measured; no unverified dollar conversion is asserted.

## Remaining source limits and reply

Miami missing older annual years, incomplete/independent certificate and Clerk deed coverage, Osceola independent Clerk/complete historical retention, Bradford abbreviated legal data, and certificate/redemption fields not printed by the source remain explicit. MIA-01’s Clerk query is `SEARCH_INCOMPLETE`; an empty or incomplete query is not a historical-clearance result. Bradford discount stays manual and unpublished discountable amounts remain null. Unknown occupancy and incomplete-liability delinquency remain nullable. Known totals are only supported published liabilities.

Besil’s replacement reply was saved in Outlook after all nine acceptance gates closed and independently read back. It addresses Besil only, with no CC/BCC. Draft-folder readback confirms exactly one reply draft remains; the previous unchanged draft was moved recoverably to Deleted Items. The new reply records all nine fresh 14 October results and their source limits. **No email was sent.**
