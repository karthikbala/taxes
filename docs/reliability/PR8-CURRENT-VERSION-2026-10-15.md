# PR #8 current-version verification — 15 October 2026

## Baselines and scope

Updated the existing PR #8 under the user's explicit instruction; no fresh PR or merge is required. Upstream main is `1f476b3897ec74cbe0a3091f005cd71be4307156`, and the previous PR head is `6f0b6f5cba6f0fea6c07edc19850af634470d588`. Main is an ancestor of this change. Preserve the newer related branch through `1fa311e8b299d78ac20335605af85fcdbac0214a`, including the repeatable client regression suite and dated nine-case acceptance evidence. The merge required no conflict resolution.

The current version exposes twenty Phase 1/Phase 2 Florida parcel workflows, plus the existing Baker and Allegheny workflows (22 choices). Three address/owner workflows remain. Automatic form routing, exact identity/ambiguity checks, original format preservation, explicit field gaps and existing synchronous APIs are retained. New parcel jobs and readiness tracking share the existing SQLite runner; acceptance storage is additive. No credentials, databases, private deployment backups or spending ledgers enter the PR.

## Verification

- Deployed twenty-county version before combining newer regression work: **524/524 offline checks passed**, zero failures or skips.
- Combined version: **534/534 offline checks passed**, zero failures, cancellations or skips; Node 24.19.0. `scripts/test.mjs` blocks external traffic and paid providers; loopback integration access was permitted.
- Self-host build and whitespace checks passed after the documentation update.
- Checked all twenty adapter inputs/source profiles, v3 auth/idempotency, contract isolation, persistence/resume/cancel, explicit unsupported fields, source omission, payment evidence, millage rendering, original-document identity/year validation and existing unaffected flows through the suite.
- Changed-file credential-pattern scan found no private key or provider/token values. This is a targeted check, not a guarantee against every possible secret format.
- Latest public staging release was independently read over SSH: `twenty-poc-20261014-9fa7aaaeeaf9`, source manifest digest `9fa7aaaeeaf93bee6b089ac5329d15cbc1dfd8a9facd7d6480e1466f34413f8c`. All **144 runtime/source files** in its manifest (`lib`, `server`, `public`, workers, vendor and migrations) match this PR's corresponding files. Newer related-branch changes add regression tooling, fixtures and documentation, not a different extraction backend.
- Prior staging activation evidence (14 October) verified loaded process identity, public POC module hashes, protected tracking and a consistent database backup. The initial packaging omission of migration SQL was corrected before successful activation; release packages must include `drizzle/`, not only a successful `dist/selfhost` build.

## Source acceptance and remaining gates

The earlier local Bradford original-HTML/API/UI check remains one dated independently checked property; its details are in [the local POC checkpoint](POC-TWENTY-LOCAL-2026-10-14.md). The preserved [nine-case client acceptance](../BESIL-NINE-CASE-PRODUCTION-ACCEPTANCE-2026-10-14.md) describes earlier production evidence, not a new PR-run source replay.

Twenty-county availability does **not** mean all twenty counties meet the 12-per-county standard. The 240-property acceptance matrix and seven-day soak remain open. Palm Beach original annual collector bill coverage, Polk payment-date disagreement and restricted-source access remain explicit. Isolated staging retains managed access disabled; production has a separate release/configuration. No new source request, paid evaluation, deployment, production change, records request or spending reset was performed for this PR update.

## Reviewer and rollback guidance

Review `lib/reliability/parcel.mjs`, `server/job-runner.mjs`, `server/app.mjs` and `server/county-tracking.mjs` first, then the POC/live controllers and their tests. Install with `npm ci`, run `npm test` and `npm run build` on Node 22.13+; use `npm run test:besil` for the focused retained client regression plan. A running instance needs the full repository's runtime directories including migration SQL. Preserve the existing database and spending reservations on deployment/rollback. Current staging remains a dated deployed snapshot until another deployment is explicitly requested.
