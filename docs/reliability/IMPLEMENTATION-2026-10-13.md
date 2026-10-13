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

The existing staging deployment advanced independently during implementation and was rechecked through its correct service manager. No reliability activation or production deployment is claimed by this checkpoint.

## Verification performed

- Full offline suite: **455 passed, zero failed** under bundled Node 24.19.0. Focused POC suite after the latest display change: **10 passed**. Build, Python syntax and source diff whitespace checks passed. An immutable corrected source candidate then passed **458/458 tests** and build under staging Node **22.23.3**, without activation.
- Actual county engine through durable jobs: Miami source-derived address/detail/search fixtures and original annual PDF preserve exact folio, $3,132.45 tax and $3,007.15 paid. Offline history/HTML scaffolding is explicitly labelled in the test; not fresh live proof.
- Two fresh direct-only Bradford checks independently matched the exact paid and delinquent parcels, with extraction errors empty. Full source/API evidence and amounts are retained privately; historical coverage remains partial.
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

The isolated committed candidate passed locked installation, 458 offline tests and build on Node 22.23.3. The final published source then passed 459/459 tests and build on the same runtime, including isolated Bradford property-card parsing. Source archive hashes and detailed validation receipts are retained privately. Existing staging and production were not activated by this work. Earlier candidate failures exposed omitted worker packaging and a rendering test depending on an untracked report; worker build checks and a portable source-derived fixture corrected both.

A subsequent small freshness correction preserves original browser-artifact retrieval dates during same-job replay. It does not fetch new source data or alter tax values. Its focused source/job regression results are recorded with the follow-up commit.
