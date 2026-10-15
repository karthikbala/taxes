# Twenty-county local implementation — 14 October 2026

## Scope and baseline

Local branch `codex/twenty-county-local`, isolated checkout `taxes-twenty-local`, based on reviewed PR #8 commit `6f0b6f5cba6f0fea6c07edc19850af634470d588`. The user narrowed implementation to local updates. No push, PR creation, staging/production change, paid capture or outgoing records request occurred. Original checkout, credentials and ledgers remain intact. The development preview uses a separate local review database; it is not a replacement spending ledger and paid access stays disabled.

## Implemented

- Authenticated v3 parcel jobs for the exact twenty Phase 1/2 adapters, using the existing durable queue, leases, checkpoints, cancellation, recovery and private artifacts. Public input is county/parcel plus optional Palm Beach account. Existing v1/v2 contracts remain separate.
- Explicit county source-host profiles, identity-specific account rules, shared bounded transport/circuits, and guarded source recovery. Managed provider access still requires existing approval/entitlement and accounting.
- Full-field result sections with values mapped from verified native assessor/collector records and original HTML/PDF parsers. Rich PDF and TaxSys history parsing is opt-in for v3. Unimplemented fields retain specific gaps rather than being called not published. Assessment notices cannot supply annual bill totals. Polk conflicts remain review items.
- Twenty-row authenticated readiness tracker, separate from historical capability labels. Required acceptance is twelve independently verified properties per county. All counters initially remain zero; no dated or synthetic samples are promoted.
- `/live` shows both ten-county phase groups first, then remaining Florida and Pennsylvania groups. Phase county mode submits durable v3 jobs, shows progress/results/gaps, restores an opaque job ID and offers cancel/resume. Key stays in memory. Explicit annual-roll and non-phase routes retain the legacy API.
- Additive `county_acceptance` table, 240-slot unverified matrix generator and local operator acceptance CLI requiring completed verified jobs, stored original-source evidence and a captured UI PNG.

## Local operation

Use Node >=22.13.0 with existing dependencies. In this checkout run `npm run build`, then start with private environment variables `HOST=127.0.0.1`, an unused `PORT`, `TAXES_DB_PATH` pointing to the intended local database, `INVISIA_POC_API_KEY`, and paid access disabled. Open `/live`, enter the key and refresh tracking. Do not substitute an empty ledger for an existing paid allowance.

New endpoints:

- `POST /api/v3/property/jobs` → 202; idempotent reuse → 200; mismatched input → 409.
- `GET /api/v3/property/jobs/:id`, `POST .../cancel`, `POST .../resume`.
- `GET .../artifacts/:artifactId`: private original/derived evidence.
- `GET /api/v3/operations/counties`: protected readiness and section coverage.

Generate planning slots with `node scripts/county-acceptance-matrix.mjs`; this performs no source requests. Select twelve independent properties per county and fill identities using official records; generated seed suggestions are not accepted properties. After independently checking source, original, API and UI for a fully verified job, run `node scripts/county-acceptance.mjs --db=PATH --job=ID --category=CATEGORY --ui-proof=PNG --attest=source-api-ui-verified`. The CLI rejects incomplete jobs. Use an immutable source revision when collecting acceptance; never certify an ambiguous working tree.

## Remaining work — not represented as complete

**This is not full twenty-county extraction acceptance.** Native adapters still omit some full client fields: building/legal/mailing data, family-specific payment details, complete certificate/deed connectors and historical coverage. Those omissions need source-specific implementation and original-source verification. Palm Beach's current document adapter remains an assessment notice; a collector annual bill path is still required. Polk official payment-date disagreement is unresolved. New full-field acceptance is **0/240**, and no seven-day soak has occurred. Prior representative source successes remain dated regression evidence only.

Local regression checks and browser tracking verification do not establish a live county acceptance pass. The source matrix records implementation/pending status, not fabricated source-current evidence. All changes remain local until separately authorized release work.

## Verification checkpoint

- Full offline suite: **521/521 passed**, no failures or skips (`/tmp/twenty-local-final-tests.log`).
- Final focused parcel, durable-job and HTTP compatibility checks: **45/45 passed** (`/tmp/twenty-focused-final.log`).
- Self-host build and whitespace checks passed.
- Chrome confirmed the actual local `/live` phase groups and protected twenty-row tracker. Invalid `@invalid` parcel input returned the contract error before a job/source request was dispatched. These are local UI/API checks, not county acceptance.
- A first regression run caught widened v2 eligibility after expanding source profiles; the explicit three-county v2 guard was restored and the full suite rerun successfully.
