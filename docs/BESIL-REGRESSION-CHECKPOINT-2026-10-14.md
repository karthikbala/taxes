# Besil regression preparation — 14 October 2026

## Deliverable and scope

The user requested repeatable tests to preserve working behaviour, then explicitly narrowed this phase to what was advertised to Besil. The [case checklist](BESIL-REGRESSION-TESTCASES.md) and [machine-readable case catalogue](regression/besil-cases.json) cover **nine exact cases across Miami-Dade, Osceola and Bradford**. Sent/client correspondence was checked read-only: 7 October requirements, 10 October delinquency/suffix/discountable feedback, the sent 12 October update, and the latest Bradford tax/payment/millage and Miami LEGACY examples. The existing 13 October reply is a draft; this turn neither edits nor sends mail.

All original client-envelope/appraiser/collector sections, identity/unit/year checks, printed tax/payment/millage fields, original formats, explicit omissions and partial history remain acceptance obligations. Other counties/states, complete historical clearance, neighbouring-feature expansion, new property types and broader reliability/OCR work remain later phases. No advertised capability is removed or hidden.

## Changes

- `npm run test:besil` selects the existing shared contract/API/UI/recovery checks plus the three county-specific suites. `-- --county COUNTY-ID` provides a repeatable county pass; `--list` inventories its test files. The same external-network guard used by npm test is preloaded, provider credentials are blanked and source recovery is disabled in the test process. No live tests run automatically.
- `npm run check:besil -- CASE-ID saved-result.json` checks a locally saved raw API result or durable job response. It rejects wrong county/owner/parcel/unit/account, unavailable published totals/status, missing or contradictory original-document provenance, identity/year joins, tax/millage/charge mismatches, duplicated liabilities and false complete-history conclusions. It flags differences from dated values/counts/known nulls for source review. It preserves zero and letter-bearing parcel IDs.
- The checker never performs network requests, updates a baseline or marks full live acceptance. API_CHECKS_PASS (exit 0), API_CHECKS_FAILED (exit 1) and REVIEW_REQUIRED (exit 2) are distinct. Every report explicitly leaves fresh source/original/UI acceptance incomplete.
- Ten new automated checks cover the nine-case inventory, source-derived accepted subsets and adversarial identity, amount/rate, original-hash, source failure, lost-zero-row, lifecycle/coverage and changed-observation outcomes. Four explicitly labelled historical source-derived response subsets support portable tests; their original full-response hashes and dates are retained. They are test evidence, never runtime fallbacks.
- An existing dangling README link for the automatic-address acceptance was corrected to the actual dated acceptance document.
- The manual checklist provides exact inputs, expected parcels/accounts, dated values, field/negative/UI/restore gates, and a per-case next-run result sheet. A changed source is reviewed separately from a confirmed code regression. The older MIA-01 and BRA-01 controls are prioritised for fresh verification.

## Revision and deployment checks

Work continues in the already-attached clean worktree on `codex/bradford-address-detection`, based on `7f608b040bc20e7f040aa2cda2d51927a58894cb`. The original checkout/untracked notes are preserved. Remote branch was fetched before work. Production was inspected read-only through the loaded process: PID **235505**, source **`d0b555f30ba11a74bea7d48396e454108b6c89f1`**, release **`production-accepted-20261013-d0b555f30ba1`**, environment **production**. No application code, UI, service, database, source credential, provider policy, DNS or deployment is changed by this test-only work.

## Validation and reused evidence

- Focused Besil offline suite: **267/267 passed**, including the ten new checks. The full offline suite also passed **518/518**, with zero failures/skips. Self-host build and whitespace checks passed. County selections for all three IDs resolve valid test files; unsupported counties are rejected.
- Checker command exit codes were exercised with a real saved Osceola result (0), a changed historical payment needing review (2), and a wrong parcel (1).
- Historical replay of the **seven 13 October production results** passed local JSON checks: MIA-02, MIA-03, OSC-01, BRA-02, BRA-03, BRA-04 and BRA-05. Their full source/API/UI acceptance remains dated evidence in [production recovery](PRODUCTION-MIAMI-OSCEOLA-RECOVERY-2026-10-13.md) and [Bradford acceptance](BRADFORD-AUTO-ADDRESS-CHECKPOINT-2026-10-13.md); replay is not new source verification.
- MIA-01 and BRA-01 are **8 October snapshots** predating later discountable/millage fields. The current checker correctly rejects their old missing fields. This does not establish a current production regression. Current-code fixture tests for the original paid-bill flows pass; both exact properties still need fresh current-source/API/UI acceptance next time.
- Initial fixture-subset checks correctly reported missing assessment/benefit observations after the catalogue was expanded. The test subsets were repaired to retain those authentic fields; the final focused suite passes. No production parser was changed to make tests pass.

Private logs and historical replay reports are under `outputs/besil-regression-2026-10-14/`. Provider/source calls **0**, paid use **0**, new live job IDs **none**. No work was dispatched that needs session cleanup. Current public health/process identity is not claimed as county acceptance. All nine next-live-run entries remain NOT_RUN. Meeting Besil's expectations requires running and closing the source/API/UI gates in this limited plan before expanding scope.

## Subsequent live pass

The preparation snapshot above is preserved. The later authorized [nine-case production acceptance](BESIL-NINE-CASE-PRODUCTION-ACCEPTANCE-2026-10-14.md) closed the fresh source/API/UI gates for all nine cases on 14 October, starting with MIA-01 and BRA-01.
