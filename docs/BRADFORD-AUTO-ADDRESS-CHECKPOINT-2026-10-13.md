# Automatic address detection and environment isolation — 13 October 2026

The user requested automatic property/mailing-address detection with owner and parcel verification, separate interns staging from the public setup, classify the nip.io domain as staging and taxes.zeneral.ai as production, and keep the UI county-neutral. The final UI uses one address-and-owner form with no address-meaning selector. County adapters own source-specific detection; newly verified mailing-address detection currently covers Bradford only.

## Cause and change

Callahan's and Fletcher's supplied addresses are owner mailing addresses for Bradford parcels with different actual property sites. Selecting a manual county-specific mode was unnecessary when the county sources can prove one exact owner/parcel. Detection now checks bounded native site and owner searches, verifies detail identity for both roles, deduplicates the same parcel across roles, and rechecks every claimed role against the final detail. Different parcels stay ambiguous. Incomplete/oversized searches, wrong owner/unit/parcel and unverified owner-name-prefix coverage prevent automatic selection before collector work. The source addresses stay separate. API callers retain explicit site/mailing overrides.

The public UI no longer has county-specific address-mode controls or request construction. Address-capable API workflows use the same address/owner request. Ambiguity/review text is generic, and county labels come from the selected/returned county. This does not claim unverified mailing support for every county.

## Revision and checks

- PR: https://github.com/karthikbala/taxes/pull/7 (new implementation; PR #4 was already merged).
- Verified automatic resolver revision: `7e67987821161b54bd9e1c1379d4460887d7d7a0`.
- Final deployed UI/code revision: `c0483631d3475ce25ccb52f2c0bce85c0947b439`; release `generic-address-ui-20261013-c0483631d347`.
- Full offline suite on the server at the resolver revision: **502/502**, Node 22.23.3; prior local full run **502/502** on Node 24.10.0 plus the affected catalog checks also passed. Builds passed. Independent review found and then cleared reordered-owner discovery, missing-search-evidence and final-role-drift issues.
- Final UI changes: **41 focused workflow/render/HTTP checks** passed locally and on the server; build passed. An earlier 57-check run also covered the unchanged resolver. Shared request coverage includes Miami-Dade, Osceola and Bradford address-capable API profiles.
- Resolver, client contract and engine bytes were independently identical between the verified resolver release and final UI release; reuse its four live extraction results. Final-revision GitHub CI test/build runs also passed: https://github.com/karthikbala/taxes/actions/runs/38397269595 and https://github.com/karthikbala/taxes/actions/runs/38397278326. Production assets matched the final release exactly. The final public HTML contains neither the address-mode selector nor its wrapper.
- The branch preserves the newer already-deployed nine-county POC admission update and its full-API audit separation. Blocked counties were not restored to the public selector. Original checkout/unrelated notes were preserved.

## Fresh direct-source acceptance

One direct-only lookup per exact Bradford case omitted addressType entirely. Source originals were hash-checked and compared to authenticated client JSON, including parcel/bill year, history rows, annual breakdown/payment fields, millage sums and source omissions. All four matched the requested owner and expected parcel with zero extraction errors. Each was restored in the actual public UI and retained its result after restart.

| Case | Public job | Detected role | Verified outcome |
| --- | --- | --- | --- |
| Boyd | `86ce7eef-cdff-4bf9-860e-c78dcc9414b2` | Site | `05632-0-00000`; 2025 combined $2,773.22; paid $2,662.29 on 11/26/2025; 15.54530000 mills |
| Deborah | `cdd20608-19c5-4160-89d9-7e9778a0837c` | Site and mailing, same parcel | `06203-C-01400`; 2025 combined $2,174.81; paid $2,087.82 on 11/25/2025; 15.64720000 mills |
| Callahan | `20527366-bad0-4897-b148-f8987c7bbba2` | Mailing | `05194-0-00000`; actual site SE 11TH AVE, STARKE; two published liabilities $216.55 |
| Fletcher | `f72b7d62-e911-4e87-bda2-9be95810aeb1` | Mailing | `00420-0-00200`; actual site SW 180TH PL, BROOKER; seven published liabilities $704.58 |

Four additional local direct-source/API/UI checks passed before production activation. These are separate from public proof. Published certificate notices still lack annual breakdowns, millage and payment receipts; their nulls have explicit NOT_PUBLISHED explanations. Bradford discount remains manual. Assessment labels retain their own 2026 Preliminary year, separate from 2025 bills. All results are completed_with_gaps because source coverage is limited; complete historical clearance is not established.

A further fresh lookup was submitted through the final production UI using only the usual address/owner fields: job `9ea3575e-dae8-4531-801f-41fcec5158ac`, code version `c0483631d3475ce25ccb52f2c0bce85c0947b439`. It automatically matched Callahan parcel `05194-0-00000`, retained the separate site and mailing addresses and returned $216.55, with zero extraction errors. The final UI screenshot shows no address-mode control.

## Production and staging separation

Two independent interns deployments changed the service behind the public domain during preflight. Exact-release guards stopped the first activation before switching it. The user confirmed interns should own a separate setup. Audit found interns had no sudo/Docker privileges but owned the service, releases and database serving the public domain.

Production now uses dedicated `taxes-public.service`, account `taxes-public`, root-owned immutable code and an independently downloaded SHA256-verified Node 22.23.3 runtime under /opt/taxes-public, with its own SQLite state. A consistent snapshot preserved existing jobs/artifacts and the existing POC access key. Interns staging retains its original user service, runtime and database. No interns evaluation was stopped.

- Production: https://taxes.zeneral.ai/poc → loopback 3002, `TAXES_DEPLOYMENT_ENV=production`.
- Interns staging: https://taxes-staging.37-27-51-7.nip.io/poc → loopback 3001, `TAXES_DEPLOYMENT_ENV=staging`.
- Both return the correct X-Taxes-Environment header and enforce protected API authentication. Negative OS checks reject interns modifying production release/parents/system unit/Nginx vhost or reading production env/database/process env. SQLite paths are distinct. DNS/certificates are unchanged.
- Consistent pre-cutover, pre-UI-release and post-acceptance production database snapshots were retained privately. Roll back code only while retaining newer jobs/spending. Scheduled backup coverage for the new production state is a separate operational check; old interns snapshots alone no longer cover production.

See [the environment runbook](PRODUCTION-STAGING-ISOLATION-2026-10-13.md). Private local evidence is under outputs/bradford-auto-address-2026-10-13, including source manifests/archives, deployment receipts, full job/client JSON, independent source comparisons and screenshots. No authentication header, POC key or provider secret was saved in these artifacts.

## Spending and remaining criteria

New paid calls: **0 / $0**. The production database has zero browser_runs and zero scrape_budgets rows. No original ledger was recreated/reset and no allowance was minted. Managed, local-browser, OCR and binary-ingress recovery remain disabled. Miami collector access remains blocked in the earlier fresh evidence; no new Miami retry was made, and it remains excluded from the public POC. Other-county mailing detection, full historical/certificate/deed clearance and broader acceptance remain unverified.

Besil's reply was verified and saved as an unsent Outlook draft, reporting the four actual positive outcomes, automatic detection and the remaining Miami/source gaps. The final draft removes all instructions to select an address mode. Nothing was sent.
