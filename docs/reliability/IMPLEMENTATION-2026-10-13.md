# Reliable retrieval implementation — 13 October 2026

## Implemented

- Authenticated durable SQLite jobs, idempotency, progressive checkpoints, input review/resume, cancellation and expired-lease recovery.
- Per-job immutable source artifacts with hashes and original retrieval times, incomplete-stage refresh, private authenticated downloads and 90-day retention.
- Reviewed three-county source profiles, direct-only evaluation mode, per-host serialization, bounded retries/Retry-After and persistent circuit breakers.
- Serialized managed/paid Clerk dispatch, durable session intent/reservation ownership and conservative orphan cleanup. No budget is created/reset.
- Original-PDF binary ingress with expiring one-use tickets and hash/size/signature validation; existing chunk recovery retained.
- PDF worker isolation, 25 MiB/50-page bounds, optional licensed PyMuPDF/Tesseract container recipe, derived-artifact preservation and explicit OCR review.
- POC job progress, cancel/resume, protected reload restoration, input restoration and field-specific availability explanations. Existing parcel/neighbour/synchronous routes remain compatible.
- Operations, cost/access and failure runbooks; acceptance validator and read-only soak tooling.

## Baseline

Started from local `05a1767`, upstream `379943a`, previously pushed fork branch `2ec9cd8`, plus newer local county/POC changes. The implementation preserves those newer repairs, including Bradford mailing/site-address review, Miami multi-year delinquency and Osceola certificate/deed scopes. See `baseline.json` for the source-manifest digest.

Staging was initially inspected through the wrong service manager. The correct `systemctl --user` service is active and independently advanced to `bradford-client-final-20261013-f6a5bcedf983`. No reliability activation, restart or production deployment is claimed by this checkpoint.

## Verification performed

- Full offline suite: **455 passed, zero failed** under bundled Node 24.19.0. Focused POC suite after the latest display change: **10 passed**. Build, Python syntax and source diff whitespace checks passed. An immutable corrected source candidate then passed **458/458 tests** and build under staging Node **22.23.3**, without activation.
- Actual county engine through durable jobs: Miami source-derived address/detail/search fixtures and original annual PDF preserve exact folio, $3,132.45 tax and $3,007.15 paid. Offline history/HTML scaffolding is explicitly labelled in the test; not fresh live proof.
- Fresh direct-only Bradford paid job `a751d5e0-e78f-44bc-9a43-696bed263f15`: exact parcel `04708-0-00200`, errors empty, $201,605.05 annual total and null separately unpublished discountable subtotal.
- Fresh direct-only Bradford delinquent job `804f9c25-d2bf-4297-9df7-6cadc02487ab`: exact parcel `05194-0-00000`, errors empty, $130.33 current-year and $86.22 prior known amount; published known total $216.55. Full historical coverage remains partial.
- Both jobs retained their results across a real private QA server restart. Chrome restored and visibly rendered the delinquent job without another source lookup. Private JSON, original runtime artifacts and screenshot are retained outside the public source tree.
- Credential-pattern scan: 310 relevant text source files, no private-key/provider/GitHub-token pattern matches. This is a targeted scan, not an assurance about arbitrary external data.

No paid provider capture, new allowance, license purchase or outbound records request was made for this implementation. The private QA server had managed recovery disabled and accepted direct-only jobs.

## Open release gates

1. Complete the independently reviewed 36-property matrix and rendered UI proof. Its current entries are pending coverage slots, not completed samples.
2. Approve PyMuPDF licensing, build the isolated image and validate actual difficult/scanned documents. OCR candidates are currently review-only; no automatic OCR financial acceptance is claimed.
3. Provision/test local Chromium and externally verify binary ingress behind the reviewed Nginx route before enabling those paths.
4. Reconcile the original paid ledger and approve a concrete bounded managed trial before paid acceptance. Cost scenarios in the cost sheet are application bookkeeping, not vendor quotes.
5. Validate and activate staging only after required acceptance; then run seven actual elapsed days of monitoring and approved source probes. No 99% measured success rate is claimed yet.
6. Restricted historical records still require authoritative county access/confirmation. Complete public queries do not establish title clearance.

The software implementation is reviewable; the complete release programme remains in progress behind these explicit gates.

## Isolated staging candidate

Candidate `/home/interns/apps/taxes/candidates/reliability-20261013-73d39b3` was built from commit `73d39b35b074ba18e0acb346fbbbfaa1e7e5980d`; archive SHA256 `8d0c0f481ab58c0f7229b525129f2c006b696bf938521b795db8cafdfb2f58bc` was verified before extraction. Locked installation, 458 offline tests and self-host build passed. Active staging, Nginx, secrets, database and allowances were unchanged. Earlier candidate failures exposed omitted worker packaging and a rendering test depending on an untracked report; worker build checks and a portable source-derived fixture corrected both. Candidate logs remain under the server's private candidates directory.

A subsequent small freshness correction preserves original browser-artifact retrieval dates during same-job replay. It does not fetch new source data or alter tax values. Its focused source/job regression results are recorded with the follow-up commit.
