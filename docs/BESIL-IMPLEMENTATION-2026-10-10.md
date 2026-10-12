# Besil feedback implementation — 10 October 2026

## Outcome

Implemented locally and verified offline. **The full client request is not yet resolved in production.** Miami's reported missing delinquent amount is reproduced and repaired; Miami-Dade and Osceola published discountable subtotals are now extracted from verified annual HTML bills. Optional suffix matching is implemented for all three county resolvers. Bradford has a guarded printed-subtotal parser, but the inspected live control does not print that field; Besil's affected Bradford property/year remains needed for positive acceptance.

Baseline: `main` / `origin/main` at `024e558037ca3bd973f2744d0677c9e6cba53a00`, after fetching and fast-forwarding two upstream neighbour-drilldown commits. Changes in this checkpoint are working-tree changes on that baseline. No commit, push, release or production cutover was performed. The upstream version-44 acceptance is historical evidence and does not validate these changes or establish the current loaded production revision.

## Cause and changes

- **Delinquency:** the collector's full Miami account page repeats payable rows above history, includes year headings, and prints its footer total inside a labelled cell. History parsing now uses the actual history section, ignores duplicate summaries/headings, and reads the explicit footer value. Certificate status `Issued` and its date are retained. An issued certificate contributes a known delinquent liability only with a positive current collectible quote; face amount is never substituted. Incomplete history still leaves overall prior-year liability unknown.
- **Address:** comma-before-unit notation previously dropped unit identity; county matching required suffix equality. Unit notation is retained. A requested omitted suffix may match a source suffix while number, direction, street and unit remain exact; a conflicting supplied suffix fails. Candidate ambiguity and incomplete pagination remain explicit. Miami's bounded native all-unit query resolves the exact example without its suffix; an official owner-index fallback handles a zero-result native address query, subject to complete pagination and detail confirmation.
- **Discountable total:** Miami and Osceola's HTML annual bills print a subtotal missing from their print PDF. The engine now supplements the PDF with the exact resolved bill's sibling HTML, verifies account, annual bill year and year-labelled amount block, and retains field provenance. The existing managed session captures that HTML deterministically. Bradford reads explicit HTML subtotal labels. Conflicts fail explicitly; missing values remain null with a precise partial-coverage explanation. Zero remains zero.

## New source evidence and acceptance

The [evidence manifest](../tests/fixtures/client/besil-evidence-2026-10-10.json) records source URLs, timestamps where retained, source hashes, fixture hashes and limitations. Original Miami API JSON is retained unaltered. Collector fixtures are clearly labelled source-derived DOM excerpts, transcribed from the official browser pages; excerpt hashes do not represent complete original responses.

| Request | New evidence | Acceptance status |
| --- | --- | --- |
| 1900 N Bayshore Dr, Unit 512 | Official appraiser resolves folio `01-3231-067-0130`, owners Allen Hasbun / Christie Hasbun. Official collector shows 2025 current due **$4,085.87**, certificate **3299**, `Issued` 06/01/2026, face **$3,885.35**. | Source-derived offline engine → authenticated API → rendered UI preserves **$4,085.87** once, with partial history explicit. Production execution remains unverified. |
| Same Miami address without DR | Fresh direct resolver returns `MATCHED`, folio `0132310670130`, after four bounded all-unit result pages and exact detail confirmation. | Fresh Miami resolver acceptance; guarded matching/ambiguity/pagination tests for all three counties. No fresh suffix-omitted Bradford/Osceola production acceptance. |
| Miami 2025 discountable subtotal | Official same-account annual HTML prints **$3,477.20**, distinct from current due. | Offline authenticated API and rendered UI preserve value/provenance; guarded direct sibling and managed-capture paths pass. |
| Osceola, 3250 Vineland Rd, 2025 | Official bill account `R022528-285000010010` prints **$285,389.65** discountable subtotal. | Source-derived HTML plus previously captured original PDF passes engine integration with verified R-account join. Production execution remains unverified. |
| Bradford, 14500 S Hwy 301, 2025 | Fresh direct control, parcel `04708-0-00200`, request `85d952d3-121e-4c13-834d-6b528b41a08e`: bill verified; no explicitly labelled discountable subtotal. | Null retained. Positive-value, zero and conflict parsing tested with explicit mutations only. Client's affected example still required. |

Direct Miami collector access returned a source challenge; official native-browser read-only inspection established the values above. Native browser inspection and replayed excerpts are separate from a fresh production/provider end-to-end run. No claim of full historical certificate/deed clearance is made.

## Verification

- Bundled Node v24.19; `node scripts/test.mjs`: **305 tests passed, zero failures/skips** across 32 files, including 13 new Besil regression checks and existing county, neighbour, auth, transport, managed-browser, SQLite and shutdown controls.
- Initial sandbox run passed 31 files; two localhost-binding checks in the server file failed with `listen EPERM`. Rerunning the offline suite with localhost binding permitted passed all 305 checks. The harness continued blocking external network and disabled paid provider access.
- `node scripts/build-selfhost.mjs`: passed. `git diff --check`: passed.
- Regression guards include wrong account/year/type, supplied suffix conflicts, wrong/conflicting units, candidate collisions, incomplete pagination, duplicate payable rows, unavailable history, source zero, absent/conflicting subtotals, and issued certificates without positive quotes.
- Managed capture's generated script is exercised with a deterministic DOM/transport harness; no real provider call is implied.

Paid provider requests: **0**. Provider spending this work: **$0**. Existing ledger was not queried, recreated or changed. New deployment identifiers: none. No client reply was sent or saved in the mailbox.

## Remaining completion criteria

1. Obtain Besil's Bradford address/parcel, bill year and source page showing the reported total. Confirm the published label/value and prove source → authenticated JSON → UI for that case; extend the deterministic parser if its observed layout requires it.
2. Obtain explicit authorization for the intended release target, verify its loaded revision and current in-flight work, then deploy through the authorized route and repeat the exact client checks there. Paid managed evaluation, if needed, requires the existing ledger and a bounded authorized evaluation; these offline results do not authorize spending.
3. Mark the request fully resolved only after those acceptance checks pass. The user's requested resolution email is conditional on resolution, so no all-resolved follow-up is drafted at this checkpoint. The two additional state requirements expected Monday 12 October remain separate intake work.

The [original change plan](BESIL-CHANGE-PLAN-2026-10-10.md) is retained as the earlier planning snapshot; this document records the implementation outcome.

## Follow-through after the user's release request

The user explicitly authorized updating the existing `taxes.zeneral.ai` hosted POC. This supersedes the earlier absence of release authorization for that target; the future Linux direction remains unchanged.

- The recorded Sites project `appgprj_6ac53842fb58819195dbc8435c4116e9` returned `SitesConnectorError`, `NOT_FOUND`, HTTP 404 from `get_site`; source write-credential creation also failed. Listing all available owned/editable sites returned no Taxes project. This is a current connection/access blocker, not a deployment failure. No replacement Site, source push, saved version, runtime-variable update, ledger change or deployment was made. The owner must connect the correct account/workspace or grant editor access before release preflight can inspect the live revision and current ledger/in-flight work.
- Additional direct Bradford inspection was bounded to three distinct official 2025 bills returned on the first owner-search page. Parcel `06013-0-00100` returned HTTP 500; `00986-0-00700` was paid and printed no discountable subtotal; `01684-0-00800` failed the existing receipt/history payment-date consistency guard. No missing amount was inferred. Sampling stopped after two non-advancing diagnosis cycles. The search was not a complete owner-index acceptance. See [sanitized investigation evidence](evidence/besil-bradford-investigation-2026-10-10.json).
- The latest sender-specific mailbox search still contains no Bradford example or newer feedback. The user was asked for the source address/parcel, year and link, and for the required Sites connection/access. These dependencies remain open.
- [Follow-up email draft](BESIL-FOLLOW-UP-EMAIL.txt) is ready for the user to send. It accurately states local implementation and the outstanding hosted/Bradford validation. It has not been sent or saved as a mailbox draft. No guarantee of issue-free future client testing is made.

Implementation/test evidence above remains valid: subsequent edits are documentation/evidence only. Provider requests remain zero; deployment identifiers remain absent.

### Linux target selected after access failure

The user subsequently selected a remote Linux deployment and requested instructions to grant access. No Linux hostname, SSH username/port or deployment directory has yet been supplied. A dedicated SSH key was generated in this computer's private `.ssh` directory; only its public key is shared for server installation. No server connection, provisioning, traffic/DNS cutover or ledger migration has occurred. The earlier hosted-POC release lane is superseded by this target selection.

At the user's request, public internet search also checked official Bradford examples. The [official 2025 bill for parcel 05079-0-01314](https://www.bradfordtaxcollector.com/Property/TATaxBill?pq=N&rolltype=R&st=BL&taxbillno=1308000&taxyear=2025) lists combined taxes, a discount and a paid balance, but no labelled discountable subtotal. The [official discount schedule](https://www.bradfordtaxcollector.com/About/Deadlines) describes payment discounts; it does not establish the requested property-specific subtotal. These findings do not disprove Besil's report. The email draft therefore requests his example, as the user authorized if public research did not establish one.

### Private Linux staging release — 10 October 2026, 14:35 IST

The user supplied `interns@37.27.51.7`, selected private staging, withheld hostname/public configuration, and then explicitly requested testing and pushing the current version. The following supersedes the earlier no-server/no-deployment status; it does not establish public production or full county acceptance.

- **Release:** `besil-20261010-ed6c2fc73627`, loaded from `/home/interns/apps/taxes/releases/besil-20261010-ed6c2fc73627` via `/home/interns/apps/taxes/current`. Source tree SHA-256 `ed6c2fc736277ca95a600b399dba2646e48a779f0c011bdf0fad19ec2ebe4062`; source archive SHA-256 `9ad72c29905e0f9b03754de86a1c3c393b83901b71cd9d2677afde99e9fdea21`. All 468 source-file hashes verified on the server. Baseline Git commit remains `024e558037ca3bd973f2744d0677c9e6cba53a00` plus captured working-tree changes; this is not a GitHub push.
- **Startup repair:** the original CLI entry-point guard compared the symlink spelling of `process.argv[1]` with the canonical module URL and exited successfully without listening. `server/index.mjs` now resolves the entry path before comparison. A subprocess regression test launches the server through a release-directory symlink and verifies health. This accounts for the increase from 305 to **306 passing offline tests**, repeated locally and on server Node **22.23.3**. Both builds and whitespace checks passed.
- **Runtime:** `taxes-staging.service` is active/running as the `interns` user; lingering is enabled. Follow-up SSH verification confirms it remains running after the rollout session closes, with port 3000 bound only to `127.0.0.1`. Existing Nginx/services, hostname, DNS, public POC, Cloudflare and production secrets remain unchanged. The private staging environment retains its separate key and user-owned SQLite state.
- **Rollout safety:** prior release directory retained at `/home/interns/apps/taxes/releases/besil-20261010-53bc4d83`. New release was tested before the pointer switch. Rollout script restores the prior pointer and prior active/inactive state if startup health fails. No schema changes were made. Preflight found zero active paid runs, zero reservations and zero budget rows in the separate staging database. The existing hosted spending ledger has not been imported or replaced; paid access stays disabled.
- **API/UI smoke:** health, `/poc`, JavaScript, renderer module and source catalogue returned 200 with expected content types. Unauthorized lookup returned **401**. Authorized health returned API ready with managed source access `not_configured`. Returned live-source amounts passed a check through the deployed UI renderer; this was a renderer-module check, not visual browser QA.

Fresh authenticated direct-source acceptance was bounded to one request per affected county, with zero provider cost:

| County | Staging request ID | Result |
| --- | --- | --- |
| Miami-Dade | `25fbecda-55a2-4744-bb71-46bbf8f36b45` | Suffix-free `1900 N Bayshore, Unit 512` matched folio `01-3231-067-0130`. Collector returned `source_blocked`; tax/delinquent amounts stayed unavailable. Live delinquency/discountable extraction is not accepted on this server yet. |
| Bradford | `e3bcecb8-e8ae-45eb-b9b4-8e13203df572` | Matched `04708-0-00200`; verified total **$201,605.05**, zero current balance, no source errors, partial historical scope. Discountable subtotal remains null because the inspected original bill does not publish it. Returned total survives the deployed renderer. Besil's affected example remains needed. |
| Osceola | `a1c43b3f-2205-498d-9e3b-b92a54f9ffa0` | Appraiser returned `source_blocked`, yielding `SEARCH_INCOMPLETE` without parcel selection or substituted data. Live acceptance remains blocked. |

Release receipt and summarized acceptance evidence are saved locally under `../linux-setup-2026-10-10/` and remotely under `/home/interns/apps/taxes/admin/last-release.json` and `/home/interns/.cache/taxes/staging-acceptance-20261010.json`. No credentials appear in those summaries. Paid usage remains **0 requests / $0**. Source access/secure credential-and-ledger migration, the Bradford example and any eventual public cutover remain separate completion criteria. The tested private staging push is complete; the overall Besil request remains partially resolved.

## Final staging hardening

Uninspected tax history now returns a null known-prior-year amount rather than a misleading $0.00. The missing-history contract regression checks both the null amount and unavailable coverage. Fresh bounded Osceola API checks on the staging host returned Cloudflare challenges with existing headers, browser headers, and isolated headless Chrome; retries stopped without paid requests. Managed-source credentials and the original budget/browser-run ledger remain absent, so live Miami/Osceola acceptance remains blocked. The user confirmed no Bradford example is available; the follow-up must request the affected parcel/year/source link. No complete-resolution claim is justified.

## Manager manual testing pack

Four fresh authenticated staging UI cases were captured for the exact Miami delinquency input, suffix-free Miami, Osceola control and Bradford control. Complete JSON, every-field CSV, manual input CSV, actual application screenshots and clearly labelled side-by-side screenshot collages are in docs/evidence/manager-uat-2026-10-10. Miami both addresses matched exact folio 01-3231-067-0130; collector blocked both. Osceola search was incomplete due to appraiser source_blocked. Bradford matched and returned 2025 total $201,605.05, no discountable subtotal. Production inputs were prepared but NOT submitted because current managed budget/entitlement is unavailable; a direct public capability GET returned HTTP 403 and was not retried. No full resolution or actual production result comparison is claimed. No paid calls, releases, secret changes or production writes.
