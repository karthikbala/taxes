# Cross-county address detection — 15 October 2026

## Requested deliverable and implementation

Extend the same address-and-owner form to automatically identify property-site or owner-mailing input in the three advertised address workflows: Miami-Dade, Osceola and Bradford. Do not enable address lookup for the eight other parcel/collector workflows. This follows the user’s request for county-independent behaviour and explicit authorization to find an Osceola example.

A shared selection rule requires complete bounded county discovery, the supplied county-listed owner and a verified matching site/mailing address, and exactly one parcel across both roles. Same-parcel role matches are deduplicated. Different parcels are ambiguous; incomplete discovery cannot select a parcel. Actual property site, mailing address and meaningful units remain separate. Explicit site/mailing API overrides remain available; the public form has no county-specific selector.

Miami uses the complete native GetOwners index, independently verifies each exact-owner folio detail (maximum 25), then revalidates the selected record. Osceola uses counted native ParcelMarket owner records (maximum 100), retains alphabetic parcel segments during discovery, then independently reads the one selected parcel and its existing rich datasets. Bradford keeps its complete native site/owner search and final identity checks while using the shared selection rule. The existing Miami neighbour workflow retains its property-site default and authoritative county-owner mismatch comparison.

A literal owner query that finds zero records may use a county-published equivalent owner name only after an independently verified site match. No guessed name variants are generated. The GetOwners Count:0 sentinel is handled as already documented by the neighbour owner-index adapter: Completed, Total, unique actual rows, pagination and more-page flags remain mandatory. Other contradictory counts remain incomplete. Source captures retain the original sentinel.

## Independent fresh appraiser-source examples

| Case | Supplied address / owner | Source-derived outcome |
| --- | --- | --- |
| Miami positive | 202 MALLARD WAY / JUDE PATRICK JACOB | Unique mailing match: folio 01-3231-052-0010; actual site 555 NE 15 ST, unit 401. Two native owner-index hits include a different nonmatching name; exact-owner detail verification selects one. |
| Miami ambiguity | 1010 NE 2 AVE / LEGACY MWC TRUSTEE LLC | Ten exact-owner mailing matches; no parcel selected. Existing site 20 NE 10 ST remains independently selectable. |
| Osceola positive | 1941 HIGHWAY A1A UNIT 306 / KORB FAMILY TRUST | Unique mailing match: parcel 07-25-28-5216-0001-2090; actual site 1001 CELEBRATION AVE 209. The mailing unit 306 is not substituted for property unit 209. |
| Osceola ambiguity | PO BOX 8050 MS 0555 / WAL-MART STORES EAST LP | Fifteen native owner records, thirteen exact matching PO-box records; no parcel selected. Two parcels publish different delivery addresses. |
| Osceola discovery control | 359 MAIN ST / INN PARTNERS LLC | Two matching parcels, correctly ambiguous; not used as a unique positive example. |

Osceola sample discovery read ten public Celebration Avenue rows once, without claiming the truncated discovery was exhaustive. The chosen sample was subsequently verified using a separate complete owner query and independent parcel/value/section queries. Other discovery rows were not dispatched to collector retrieval. Native response URLs, source hashes and source-derived resolver subsets are retained in tests/fixtures/client/cross-county-address-20261015.json; full private captures are under outputs/cross-county-address-2026-10-15/. The two unique mailing examples and both ambiguity controls have now also passed fresh production source/API/public-UI acceptance, as recorded below.

## Offline validation

Focused Besil checks: **279/279 passed**. Full offline checks: **530/530 passed**. Self-host build and whitespace review passed. New tests cover unique mailing matches, site/unit controls, partial/contradictory/duplicate pagination, changed parcel/owner/address, canonical owner order, shared-address ambiguity, unlabeled native trailing units without dropping the unit, preserved mail stops, and same-parcel role deduplication. Managed recovery accepts only the reviewed auto/site/mailing enum, retains the same source allowlist and existing billing/cleanup policy, and independently replays the selected queries. Invalid address types are rejected before a paid dispatch.

Initial focused failures identified missing owner-index routes in older integration fixtures; those mocks were extended with existing source-derived evidence. The full-suite neighbour regression was corrected by preserving the neighbour API’s previous site default, not by relaxing its tests. A fixture assertion initially assumed all fifteen Walmart owner records shared the PO box; fresh inspection established thirteen exact matches and two different mailing addresses. The final suites above pass after these corrections.

## Revision, release and current acceptance

Started at clean local/remote **a98653f11bd560834465b282bab92694d72b9d8f** on codex/bradford-address-detection. Before repair, loaded production was independently checked as PID 235505, source d0b555f30ba11a74bea7d48396e454108b6c89f1, release production-accepted-20261013-d0b555f30ba1. Preflight showed zero active jobs/provider sessions and unresolved sessions; the shared provider balance was 664 credits with 75 historical receipt credits. These observed shared totals are not spending by this implementation.

Production acceptance completed on **15 October 2026**. Runtime source revision **2d6a01485c7b8c1c6fe6295cbcf95cb10b645835**, PID **513112**, working directory `/opt/taxes-public/releases/cross-county-address-20261015-2d6a01485c7b`, activated **07:38:25 UTC / 13:08:25 IST**. All 705 candidate tracked-file hashes were verified. The final Linux candidate passed **530/530 offline tests** and the self-host build before activation. An intermediate 5a4a4b3 candidate was activated briefly; no source evaluation jobs ran on it. Every job below ran on final 2d6a014. Later changes to this checkpoint/catalogue are documentation only.

Release preserved the existing database (70 jobs, 38 sessions, 496 artifacts before evaluation), credentials, TLS settings, provider/ledger and recovery configuration. A consistent SQLite backup and unit/environment backups were retained privately. Interns staging PID **2228572** remained unchanged. No DNS, Nginx, ledger, credential or interns configuration was changed.

## Fresh production acceptance

Each positive was independently compared with the native appraiser source, its original collector bill/notice and same-account/year evidence; source hashes, row completeness, totals, authority rates, payments and original formats were checked. Authenticated API JSON matched the rendered public UI and actual downloaded JSON for **all thirteen cases**. Eleven positives completed with explicit source gaps and no extraction errors; both shared-address controls returned `AMBIGUOUS` / `needs_review`, retained every matching parcel, and dispatched no collector lookup. The two older demos ran first.

| Case | Production job | Meaning / result | Source / API / UI / download |
| --- | --- | --- | --- |
| MIA-01 | `0b426e81-f8e6-424c-acb1-19f4e23e0610` | site: 01-3231-052-0010 | PASS |
| BRA-01 | `16fb8627-c8c9-4371-9f30-7d7d43b476a4` | site: 04708-0-00200 | PASS |
| MIA-MAIL | `9e0697e2-7286-4c4e-a8ac-641399c381a9` | mailing: 01-3231-052-0010 | PASS |
| OSC-MAIL | `67cf1933-66cf-4411-b3c2-d78798289e93` | mailing: 07-25-28-5216-0001-2090 | PASS |
| MIA-AMBIG | `1772bf4b-2294-4664-b9e7-a32aeb76b95a` | ambiguous: 10 parcels; no collector | PASS |
| OSC-AMBIG | `c8584736-326b-4ffa-b3d2-2d794c1bea0b` | ambiguous: 13 parcels; no collector | PASS |
| MIA-02 | `e9124695-90bd-4d14-9061-314fcdc783a9` | site: 01-3231-067-0130 | PASS |
| MIA-03 | `e0bf1659-a541-48e1-8db0-2bfb635d3a9b` | site: 01-0102-030-1070 | PASS |
| OSC-01 | `699cbee7-831f-4a75-94a4-2e8bde056c31` | site: 02-25-28-2850-0001-0010 | PASS |
| BRA-02 | `d014f24e-9256-43e1-ac27-610d8dd750fd` | site: 05632-0-00000 | PASS |
| BRA-03 | `8b4295e0-b87f-4ccd-9d75-28186c529612` | site: 06203-C-01400 | PASS |
| BRA-04 | `ca795dd3-e93e-4f36-9402-a784af90f44e` | mailing: 05194-0-00000 | PASS |
| BRA-05 | `6134ce42-a696-4733-af91-ec51b7f98ce2` | mailing: 00420-0-00200 | PASS |

MIA-01's offline comparison still reports `REVIEW_REQUIRED` against its older 8 October snapshot because that snapshot lacked the published discountable subtotal. Independent inspection of the fresh same-account 2025 bill HTML, label, amount and SHA-256 resolves the dated difference; no baseline was silently rewritten. All other nine-case checks return `API_CHECKS_PASS`. The additional source-only default Miami Unit T-15 / GASTON GIRARD control also resolved the correct folio and retained T-15, without a paid collector job.

The Osceola sample was chosen from official public records. The current authoritative property record preserves property unit **209** separately from mailing unit **306**; all eleven 2025 authority rows, two non-ad-valorem rows, account/year, payment and leading-zero receipt identity were compared with the original PDF. Its duplicate `BillDetails.propertyAddress` and `BillDetails.mailingAddress` remain null under the pre-existing annual-PDF parser even though the PDF prints them; both verified addresses are present in `PropertyInformation`. This parser limitation remains separate from the accepted address-resolution feature.

## Repeatable checks and remaining limits

Run `npm run test:besil` (279 checks) or the per-county commands in [the regression checklist](BESIL-REGRESSION-TESTCASES.md). The full suite is `npm test` (530 checks on this runtime revision). These commands are offline and make no paid source calls. The nine original case identities and dated baselines are preserved in [the case catalogue](regression/besil-cases.json), with separate dated live acceptance entries; four automatic-address controls are listed separately. A future release still needs fresh source/API/UI gates rather than fixture-only success.

Bradford annual tax/paid/millage requirements continue to pass where printed. Unpublished discountable amounts remain unavailable and manual calculations remain manual. Callahan/Fletcher published certificate/history records still omit some annual tax breakdowns, rates and payments; retrieval of their available original HTML history does not manufacture missing annual bills. Miami redemption notices and complete prior-year/certificate/deed history retain their existing explicit limits. No historical clearance or address support for the other eight parcel workflows is claimed.

## Paid use and final operational checks

This evaluation owned **13 managed sessions / 27 provider credits**, all cleanup confirmed: MIA-01 4, MIA-MAIL 4, MIA-02 4, MIA-03 4, OSC-MAIL 5, OSC-AMBIG 2, OSC-01 4; Bradford and MIA-AMBIG 0. One fresh job per case; no paid retry was dispatched. Direct source discovery/independent comparison and offline checks incurred no managed-browser charges. Existing explicit user authorization to finish and the already configured scoped production operator override were used; no ledger reset, allowance increase or provider change occurred.

Final read-only preflight at **08:04:41 UTC** confirmed the loaded final runtime revision, zero active jobs, zero active provider sessions, zero unresolved sessions, SQLite `ok`, unchanged ledger row count 0, shared provider balance **629 credits**, and historical receipt total **110 credits**. The shared totals changed by 35 credits since preflight; **27** are attributable to this task's per-session receipts and **8 additional shared credits are not attributed to these jobs** by this task’s receipts. No dollar conversion is asserted without provider pricing evidence.

Private evidence: `outputs/cross-county-address-2026-10-15/` contains thirteen API/UI/download captures, original documents, independent native-source hash comparisons, nine-case and extra-case verification reports, session receipts, Linux release logs/backups and deployment receipt. Secrets and authenticated headers are excluded from committed fixtures. Besil’s reply was updated after all thirteen gates passed, preserving the existing Bradford requirements and adding the two mailing examples and ambiguity controls. It was independently fetched and confirmed as the sole matching unsent Drafts-folder item, addressed only to Besil with no CC/BCC. The superseded draft was moved to recoverable Deleted Items only after its unchanged body and the replacement were verified. No email was sent.
