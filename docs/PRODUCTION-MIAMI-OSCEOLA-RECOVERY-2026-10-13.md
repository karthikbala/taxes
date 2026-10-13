# Production Miami-Dade and Osceola recovery — 13 October 2026

Miami-Dade and Osceola now retrieve fresh county records and original bills on `https://taxes.zeneral.ai/poc`. All three exact requested address/owner cases passed source → parsed record → authenticated job JSON → actual public UI acceptance, with no extraction errors. Source omissions and historical-coverage gaps remain explicit. This supersedes the earlier source-access-limited snapshot in [county status](POC-COUNTY-STATUS-2026-10-13.md).

## Cause, authorization and change

Direct production access receives source challenges; the reviewed deterministic recovery implementation existed but production had no browser credential and no original spending-ledger rows. A read-only attempt to retrieve the archived legacy site returned NOT_FOUND. The user then explicitly instructed “ignore the budgets and finish the work.”

Backend revision `dde90569d688da64f8e1fdc41f9de11bb130a1de` adds a default-off production operator override, configured only for `miami-dade-fl,osceola-fl`, using the existing Firecrawl credential and provider. It retains entitlement checks, official source allowlists, deterministic extraction, owner/unit/parcel/account/year joins, bounded requests, session cleanup and durable actual-credit receipts. No ledger, allowance or historical spending was created/reset. Unknown billing is recorded as unknown, and later cleanup receipts preserve earlier evidence. Other counties cannot dispatch through this override. No runtime model extraction, fixtures or annual-roll substitutions are introduced.

Production activation at **19:36 IST** loaded release `production-recovery-20261013-dde90569d688`, PID `214025`. The running process directory/revision and public assets were checked independently of local HEAD or health. All tracked source hashes were verified; the small delta release copied unchanged tracked files from the prior immutable release and checked the complete manifest before activation. The prior release, unit/environment and consistent SQLite snapshot are retained for rollback. Current provider access is enabled in the root-only production configuration; the reviewed TLS chain remains loaded.

## Fresh production acceptance

| Exact input and owner | Job / collected result | Identity and source result |
| --- | --- | --- |
| `3250 VINELAND` / `WAL-MART STORES EAST LP` | `6e93c625-434c-4b1c-b902-f5b131174d98`; 19:38 IST | Parcel `02-25-28-2850-0001-0010`, collector `R022528-285000010010`; owner matched; suffix-free request preserved. Fresh native appraiser queries and 2025 annual PDF, 11 populated tax authority rows and one non-ad-valorem row. Ad valorem **$189,066.86**, non-ad valorem **$96,322.79**, combined/discountable **$285,389.65**, printed mills **13.8543**. Paid **$273,974.06** on **11/18/2025**, receipt **121702900**, current balance **$0.00**. |
| `20 NE 10 ST` / `LEGACY MWC TRUSTEE LLC` | `940f9d8a-7a1c-43cc-8d72-860c8928b5f2`; 19:40 IST | Folio `01-0102-030-1070`, owner matched. Two open annual liabilities: **2025 $210,961.44**, certificate **7**; **2024 $207,723.09**, certificate **5**. Known payable subtotal **$418,684.53**. Original 2025 redemption PDF prints **$210,961.44** received by **Oct 30, 2026**, and warns that prior years are excluded. Certificate face values are not added again. Same-year collector HTML discountable **$183,039.14**. |
| `1900 N Bayshore, Unit 512` / `ALLEN HASBUN` | `c222ce4e-3557-4aa2-b16d-f80e94331344`; 19:41 IST | Folio `01-3231-067-0130`, exact unit **512**, source owners Allen and Christie Hasbun. Unit-filtered native search did not complete; complete fresh all-unit street pagination plus exact-unit confirmation recovered the unique requested parcel. Current due and original 2025 redemption quote **$4,085.87**, certificate **3299**, face **$3,885.35**, issued **06/01/2026**, rate **0.25%**. Seven charges reconcile to the quote. Same-year collector HTML discountable **$3,477.20**. |

All three source PDFs retain original bytes, source URL, retrieval time, SHA-256 and parsed field provenance. Independent Poppler text extraction and rendered-page review confirmed identity, tax year, printed amounts, certificate identities, all seven redemption charges and Osceola's populated authority rows/millage sum. Source PDF byte hashes match both capture metadata and delivered JSON:

- Osceola: `472dea39f0d24ef16030c2b56cce97645c6f9c585981e680d6d9af1c5e605523` (826,024 bytes).
- Miami 20 NE 10 ST: `cafdb179c4f2246cc1d6190103301eaaa754d2198882f8da319d846fe65142aa` (1,521,607 bytes).
- Miami unit 512: `74b6ce6a21c3ccc27bf026d0634b74d4fccd17369b3fb9d8ea7370927be8ae2e` (1,521,372 bytes).

Each fresh authenticated result was restored by its job ID in the public POC; actual page JSON, displayed owner/parcel/year, amounts and explicit coverage gaps were checked and screenshots saved. Restoring did not start new source work. The 2026 appraiser assessment remains distinct from the 2025 bill; bill-year assessment evidence is separately available. Miami redemption notices do not publish annual authority breakdowns, combined annual total or payment receipts; these stay unavailable. Miami's online-payable subtotal is not represented as complete total liability.

## Validation and reused evidence

Backend release passed **508/508** offline checks locally and on Linux, plus build. Focused production-override/cleanup, staging policy, managed browser, jobs, Osceola and Besil checks passed **55/55**. Coverage includes default production rejection, county scope before dispatch, retained entitlement, no fabricated ledger/runs, unknown billing, actual startup and durable cleanup reconciliation.

The UI-only release `production-accepted-20261013-d0b555f30ba1`, source `d0b555f30ba11a74bea7d48396e454108b6c89f1`, activated at **19:47 IST**, PID `235505`, marks these two accepted address workflows sample-verified. Focused actual-controller/render checks passed **26/26**, plus build and whitespace check. Server/adapter bytes are verified identical to the accepted backend before activation, so live source proof is reused without more paid captures. No additional parcel or annual-roll mode is enabled; no county-specific address-meaning control is introduced.

The same-day nine direct county samples and all four Bradford address/owner checks remain dated evidence in [county status](POC-COUNTY-STATUS-2026-10-13.md) and [automatic-address acceptance](BRADFORD-AUTO-ADDRESS-CHECKPOINT-2026-10-13.md). Their source parsers are unchanged by this recovery policy and UI metadata change. They are reused rather than represented as new requests. Eleven listed counties include Allegheny, Pennsylvania; verification covers tested samples, not every property.

## Paid use, cleanup and isolation

One attempt per exact case succeeded: **six sessions, 13 actual credits** (Osceola 5, Miami latest 4, Miami unit 512 4). Provider balance **805 → 792** reconciles exactly to durable per-job receipts. At the application's accounting conversion of $0.02 per credit this is $0.26; provider receipts report credits, not a separate dollar charge. Final provider inspection at **19:43 IST** confirmed all six owned sessions `destroyed` and zero active provider sessions. Production has zero queued/running/retry jobs, zero unresolved sessions, zero fabricated ledger/run rows, and SQLite quick_check is `ok`.

Interns' isolated nip.io staging service remains PID `6871`, with its own port/database. Production remains root-owned immutable code under `/opt/taxes-public`, non-login `taxes-public` service account, private environment/database and port 3002. Interns cannot modify the release. No unrelated service, Nginx, DNS, Cloudflare deployment or source credential was changed.

## Remaining criteria and reply

All three lookups correctly remain `completed_with_gaps`. Miami lacks published older annual years and independent complete certificate history; exact-folio public Clerk deed searches were inspected-empty, which does not establish historical clearance. Osceola collector certificate/deed public reports were inspected-empty for the exact account; independent Clerk access is not configured, annual history/retention is incomplete and historical clearance stays false. Other source-blank sections remain explicit. None of these are represented as retrieval errors or a zero-liability conclusion.

Private evidence, originals, source checks, deployment manifests/receipts and screenshots are under `outputs/production-recovery-2026-10-13/` and root-only server admin storage. No credentials or raw authenticated headers are included. Besil's replacement reply draft was created and independently fetched after public acceptance, addressed only to Besil with no CC/BCC. It retains all four Bradford results, adds these three production results and states the historical-coverage limits. No email was sent. GitHub offline CI for source `d0b555f` passed: [run 38411862990](https://github.com/karthikbala/taxes/actions/runs/38411862990). Actual final browser inspection confirms 11 county choices, both recovered counties sample-verified, no address-mode selector and accepted saved results accessible without new paid calls. Page DOM JSON for all three cases equals the respective authenticated API JSON.
