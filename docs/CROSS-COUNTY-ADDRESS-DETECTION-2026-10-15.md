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

Osceola sample discovery read ten public Celebration Avenue rows once, without claiming the truncated discovery was exhaustive. The chosen sample was subsequently verified using a separate complete owner query and independent parcel/value/section queries. Other discovery rows were not dispatched to collector retrieval. Native response URLs, source hashes and source-derived resolver subsets are retained in tests/fixtures/client/cross-county-address-20261015.json; full private captures are under outputs/cross-county-address-2026-10-15/. These are fresh source-only proofs, not yet production API/UI acceptance.

## Offline validation

Focused Besil checks: **279/279 passed**. Full offline checks: **530/530 passed**. Self-host build and whitespace review passed. New tests cover unique mailing matches, site/unit controls, partial/contradictory/duplicate pagination, changed parcel/owner/address, canonical owner order, shared-address ambiguity, unlabeled native trailing units without dropping the unit, preserved mail stops, and same-parcel role deduplication. Managed recovery accepts only the reviewed auto/site/mailing enum, retains the same source allowlist and existing billing/cleanup policy, and independently replays the selected queries. Invalid address types are rejected before a paid dispatch.

Initial focused failures identified missing owner-index routes in older integration fixtures; those mocks were extended with existing source-derived evidence. The full-suite neighbour regression was corrected by preserving the neighbour API’s previous site default, not by relaxing its tests. A fixture assertion initially assumed all fifteen Walmart owner records shared the PO box; fresh inspection established thirteen exact matches and two different mailing addresses. The final suites above pass after these corrections.

## Revision, release and current acceptance

Started at clean local/remote **a98653f11bd560834465b282bab92694d72b9d8f** on codex/bradford-address-detection. Before repair, loaded production was independently checked as PID 235505, source d0b555f30ba11a74bea7d48396e454108b6c89f1, release production-accepted-20261013-d0b555f30ba1. Preflight showed zero active jobs/provider sessions and unresolved sessions; the shared provider balance was 664 credits with 75 historical receipt credits. These observed shared totals are not spending by this implementation.

Production release and fresh source/API/public-UI acceptance: **pending**. No paid provider use occurred during source discovery or offline validation. Existing authorization and provider/ledger state must remain unchanged; no new ledger, secret, DNS, interns staging or county-specific UI changes are part of the release. The two unique positives and shared-address controls require fresh production delivery before the feature is described as production-accepted. Historical-coverage limitations remain unchanged. Besil’s reply is not sent.
