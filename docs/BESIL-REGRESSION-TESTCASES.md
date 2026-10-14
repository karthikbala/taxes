# Besil POC regression cases

Phase 1, prepared 14 October 2026. Preserve what was demonstrated or promised to Besil for **Miami-Dade, Osceola and Bradford**, and close his reported failures before expanding the scope. This is the repeatable release checklist. Its nine inputs, expected identities, dated observations and offline test mapping are also in [besil-cases.json](regression/besil-cases.json).

The scope comes from Besil's 7 October requirements, 10 October feedback, the **sent 12 October update** promising delinquency/discountable extraction and optional suffixes, and his 13 October feedback requesting the four Bradford examples and tax/payment/millage fields. The 13 October replacement reply remains **unsent**; its verified fixes are retained as regression obligations, not described as an additional sent promise. The original requirements fixture is [client-requirements.html](../tests/fixtures/client/client-requirements.html).

Other counties/states, new property types, complete historical clearance, OCR activation, automatic Bradford discount calculations without an agreed formula, neighbouring-property expansion and the separate 36-property reliability matrix are later phases. Existing features stay in place; this test plan does not expand or remove them.

## Run the offline checks first

```sh
npm run test:besil
npm run test:besil -- --county miami-dade-fl
npm run test:besil -- --county osceola-fl
npm run test:besil -- --county bradford-fl
npm run test:besil -- --county bradford-fl --list
```

Every county command includes shared address/identity, contract, tax/PDF/HTML, UI, job and failure checks plus that county's parser/resolver checks. All use fixtures and the existing network guard; they never start live/paid county requests. Passing offline tests is the engineering gate. It does not prove current public source or deployed UI delivery.

## Positive property cases

Use **address and owner**, with no address-role selector. Do not replace a reported example with an easier property. Run one fresh request per case first; suffix variants are separate explicit checks. Save the input, loaded revision, job/request ID, full result and original source evidence. Historical values below are comparison anchors, **not fixed current balances**. Changes require comparison to the fresh official source before acceptance.

| ID | Input and owner | Exact expected identity | Previously verified fields / next-run expectations |
| --- | --- | --- | --- |
| MIA-01 | `555 NE 15 ST UNIT 401`; `JUDE PATRICK JACOB` | `01-3231-052-0010`; retain unit 401; owners Jude Patrick Jacob and Noah Elijah Jacob | Original client paid-bill control. 2025 bill total **$3,132.45**, paid **$3,007.15** on 11/25/2025; 14 authority rows, 7 legal lines, 8 sales rows; legitimate $0 condo land/building values. Retain all published assessment/benefit/taxable-value years, authority group totals, exemptions, payment schedule and notes. Check published discountable subtotal and explicit summed mills under current code. |
| MIA-02 | `1900 N Bayshore, Unit 512`; `ALLEN HASBUN` | `01-3231-067-0130`; unit 512; Allen and Christie Hasbun | Suffix-free reported delinquency case. 13 October current due/redemption **$4,085.87**, certificate **3299**, face **$3,885.35**, issued 06/01/2026, rate 0.25%; seven charges reconcile to quote. Same-year web discountable **$3,477.20**. Original redemption PDF and source omissions retained. Also test `1900 N Bayshore Dr, Unit 512` gives the same identity. |
| MIA-03 | `20 NE 10 ST`; `LEGACY MWC TRUSTEE LLC` | `01-0102-030-1070` | 13 October known subtotal **$418,684.53**: 2025 **$210,961.44**, certificate **7**, plus 2024 **$207,723.09**, certificate **5**. Original 2025 redemption quote excludes prior year; no face-value double counting. Web discountable **$183,039.14**. Reconcile payable-online scope separately from complete liability. |
| OSC-01 | `3250 VINELAND`; `WAL-MART STORES EAST LP` | Parcel `02-25-28-2850-0001-0010`; collector **`R022528-285000010010`** | Suffix-free paid-bill control. 2025 ad valorem **$189,066.86**, non-ad valorem **$96,322.79**, combined/discountable **$285,389.65**; 11 populated authority rows + one fire assessment; **13.8543 mills**. Paid **$273,974.06** on 11/18/2025, receipt **121702900**; $0 current balance. Keep 2026 certified assessment distinct from 2025 bill and 2027 working values. Also test `3250 VINELAND RD` gives the same identity. |
| BRA-01 | `14500 S HWY 301`; `WALMART STORES EAST, LP` | `04708-0-00200`, not the neighbouring credit-union parcel | Original demonstrated Bradford paid-bill control. 2025 combined/ad valorem **$201,605.05**, non-ad valorem **$0.00**, paid **$193,540.85** on 11/18/2025; five authorities. Preserve native HTML bill, property-card enrichment and explicit preliminary/abbreviated-data labels. Under current code, verify summed mills and payment fields against the fresh original. |
| BRA-02 | `6557 SE CR 21B, Keystone Heights`; `BAKER BOYD D REVOC TRUST` | `05632-0-00000`; detected property site | 2025 ad valorem **$2,481.22**, non-ad valorem **$292.00**, combined **$2,773.22**; paid **$2,662.29** on 11/26/2025; **15.5453 mills**. Preserve 14 published history rows and four inspected original records from the dated search. |
| BRA-03 | `334 SE 28TH ST, MELROSE, FL 32666`; `BAKER DEBORAH K` | **`06203-C-01400`**, including the letter C; site and mailing roles refer to the same parcel | 2025 ad valorem **$1,882.81**, non-ad valorem **$292.00**, combined **$2,174.81**; paid **$2,087.82** on 11/25/2025; **15.6472 mills**. Preserve 14 published history rows and one inspected original from the dated search. |
| BRA-04 | `8280 SE SWEET BAY DR`; `CALLAHAN JAMES R & CHARLOTTE` | `05194-0-00000`; automatically detected mailing address; actual site **SE 11TH AVE, STARKE** | Two published liabilities, known subtotal **$216.55** on 13 October. Retrieve both discovered originals; preserve document year/owner. Certificate notice does not publish annual totals, millage or payment receipt: retain explicit NOT_PUBLISHED explanations. The similar Charlotte G owner/parcel must not replace this match. |
| BRA-05 | `8130 SW 50TH PATH`; `FLETCHER CARRIE` | `00420-0-00200`; automatically detected mailing address; actual site **SW 180TH PL, BROOKER** | Seven published current liabilities, known subtotal **$704.58** on 13 October; 13 All Years originals back to 2013 retained separately. Older zero balances do not invent payment dates or redeemed certificate status. Certificate-notice annual/payment fields remain explicitly unavailable. |

The initial preparation used older 8 October MIA-01/BRA-01 snapshots and seven 13 October results. **All nine were subsequently rerun in production on 14 October**, starting with those two older controls; see the [fresh source/API/UI result sheet](BESIL-NINE-CASE-PRODUCTION-ACCEPTANCE-2026-10-14.md). MIA-01 now retains published discountable $3,132.45 and 20.37780 mills; BRA-01 retains 20.03510000 mills. Historical baselines remain unchanged, with this dated acceptance stored separately. The blank result sheet below is a reusable template for a future pass.

The initial URI encoding can differ between requests; parcel/account identity and source hashes for each actual response are the checks. Values, owners, payment status, document type and years can legitimately change. A baseline difference is never silently accepted or automatically classified as a code defect.

## Field and UI checks for every positive case

| Test | Pass criterion |
| --- | --- |
| C-01 Input and envelope | Required order/address/owner/county/transaction fields accepted; order and REFI/PURCHASE preserved; stable JSON section keys and request ID retained. |
| C-02 Exact match | Correct county, street number/direction/unit, complete candidate pagination and requested legal owner; one confirmed parcel. Appraiser → collector → bill identity agrees. |
| C-03 Appraiser | Property, latest assessment, every published assessment/benefit/taxable-value year, legal lines, sales, land/building/extra-feature records and notes retained where published. Legitimate zero/false survives; unavailable/blank fields remain null and inspected-empty lists remain distinct. |
| C-04 Source and year | Fresh requested county source, original URL, retrieval time and SHA-256. Independently inspect the original account/folio and bill year. Newer assessment never silently substitutes for bill-year values. |
| C-05 Annual bill | Every populated authority/non-ad-valorem row, group total, exemption and payment-schedule entry retained. Authority taxes reconcile to ad valorem; ad + non-ad reconcile to combined total. Printed source rate units and summed mills are explicit. |
| C-06 Payment / discountable | Printed payment date and Amount Collected retained as paid amount. Miami/Osceola labelled discountable subtotal comes from the same account/year. Bradford discount remains manual; absent labelled subtotal stays null. |
| C-07 Delinquency | Inspect all published years; retain only supported open liabilities in delinquentYears. Original/latest-year AccountHistory contract stays intact; additive Bradford historical records preserve their own identities. Redemption charge sum and current quote reconcile. No face-value, duplicate-payable or repeated-liability addition. |
| C-08 Source omissions | Certificate/redemption notices preserve their published document type. Absent annual breakdown/payment receipt is explicitly unavailable. Partial history and empty report scope do not assert historical clearance. |
| C-09 Public UI | Same API result appears in the public POC: owner, site vs mailing address, unit/parcel, bill year, amounts, all rows, source links, validation and gaps. JSON download matches the API. Source HTML renders as text. No county-specific address-mode selector. |
| C-10 Durable result | Restore the saved job after page reload/restart; result and original artifacts remain accessible, and restoration initiates no new source/paid job. Resume/cancel/idempotency protections continue to pass offline checks. |
| C-11 Access/recovery | Bearer protection works. Direct blocked-source attempt remains recorded alongside deterministic browser recovery. No sample/annual-roll fallback, hidden provider dispatch or unconfirmed owned session at wrap-up. |

## Negative and failure cases already covered offline

| County / test | Expected result |
| --- | --- |
| Miami N-01 | Unit 513, omitted condo unit, conflicting explicit unit, wrong street number/direction, or unresolved unit pagination cannot satisfy unit 512. |
| Miami N-02 | Wrong owner, conflicting detail folio or incomplete candidate count cannot become a unique owner match. No unrelated collector account satisfies the request. |
| Miami N-03 | Wrong bill year/account, truncated/corrupt PDF, duplicate redemption charges or face amounts added to current due cannot pass reconciliation. |
| Osceola N-01 | Wrong owner or explicit conflicting street suffix stays non-matching. Bare numeric parcel must not replace the authoritative R-prefixed collector account. |
| Osceola N-02 | Wrong/missing native table, incomplete page, challenged source or truncated browser output stays explicit; recovered native queries independently replay identity checks. |
| Osceola N-03 | Missing report pages, wrong account/status restrictions or inspected-empty collector reports do not establish complete historical clearance. Optional independent Clerk access is not a Phase 1 completion requirement. |
| Bradford N-01 | Wrong unit/owner, lost alphabetic parcel segment, changed final-detail parcel or differing site/mailing parcels stays rejected, ambiguous or requires review. |
| Bradford N-02 | Incomplete native owner/site search cannot auto-select a parcel. Same parcel matching both address roles is deduplicated; actual site stays separate from mailing address. |
| Bradford N-03 | Missing historical originals, wrong original parcel/year, previous owner, repeated pages and archived $0 certificate balances retain explicit availability/identity outcomes. Annual/history document formats stay original HTML. |
| Shared N-01 | Blocked collector preserves source-backed appraiser sections and reports the failed dependency; missing credentials/entitlement do not dispatch a browser request. |
| Shared N-02 | Source blanks, numeric zero, null, inspected-empty, preliminary/working/certified years and partial historical coverage stay distinct in JSON and UI. |

## Next live pass: procedure and result sheet

1. Run the offline command for the county. Confirm the intended loaded release and public production identity. Read current source/provider readiness and in-flight work before a fresh request. Keep the already-authorized recovery method; never silently start paid jobs from these scripts or CI.
2. Run the exact positive input once through authenticated production jobs. Stop and inspect any blocked/review/retry outcome before more attempts. Run its listed suffix variant as a separate case if needed. Capture input, job ID/revision and the fresh API result privately.
3. Compare every required field/row above to the freshly retrieved official appraiser/collector and original PDF/HTML. Record explicit unavailable fields. The checker below validates saved JSON invariants and dated changes; it does **not** replace this source comparison.
4. Restore that exact job in the real public UI. Check C-09/C-10; save screenshot and downloaded JSON. A completed job or HTTP 200 alone cannot earn PASS.
5. Record actual provider receipts and owned-session cleanup. Mark PASS only after source, API and UI gates. Record BLOCKED_SOURCE separately from confirmed REGRESSION and SOURCE_CHANGED_REVIEW. Fix confirmed regressions before adding scope.

Check a saved raw client result or durable job response without any network request:

```sh
npm run check:besil -- MIA-02 /private/path/MIA-02.json
npm run check:besil -- OSC-01 /private/path/OSC-01-job.json
```

`API_CHECKS_PASS` exits 0; `API_CHECKS_FAILED` exits 1; `REVIEW_REQUIRED` exits 2. A changed historical amount/count/type or newly populated field needs fresh source review. All reports explicitly return `live_acceptance_complete: false`; the operator completes the separate source/UI gates. The checker never changes the baseline or any deployment. Raw outputs/credentials must remain private.

Create a new dated result sheet for each pass rather than overwriting this historical baseline:

| Case | Offline | Fresh source + original | API/checker | Public UI + restore | Revision / job / date | Result / reason |
| --- | --- | --- | --- | --- | --- | --- |
| MIA-01 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | NOT_RUN |
| MIA-02 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | NOT_RUN |
| MIA-03 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | NOT_RUN |
| OSC-01 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | NOT_RUN |
| BRA-01 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | NOT_RUN |
| BRA-02 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | NOT_RUN |
| BRA-03 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | NOT_RUN |
| BRA-04 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | NOT_RUN |
| BRA-05 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | — | NOT_RUN |

For the initial prepared-plan validation and historical replay, see [the 14 October checkpoint](BESIL-REGRESSION-CHECKPOINT-2026-10-14.md). Passing evidence must always identify which run and which revision it covers.
