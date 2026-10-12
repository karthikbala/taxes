# Miami staging PDF repair - 12 October 2026

## Verified outcome

The reported collector, identity and PDF failures are fixed for **1900 N Bayshore Dr, Unit 512**, owner **ALLEN HASBUN**, folio **01-3231-067-0130** on [staging](https://taxes-staging.37-27-51-7.nip.io/poc).

The final authenticated portal request was `97c82784-0a2e-4705-bff4-32f7e82cdad3`, collected **12 October 2026, 10:59:05 IST**. Its returned JSON has `errorMessage: NA`, an empty `ExtractionMetadata.errors`, a matched parcel join and an extracted 2025 original PDF. Source account history, PDF payable quote and certificate identity reconcile.

- Collector status: DELINQUENT; amount due **$4,085.87**.
- Printed document type: **Delinquent Tax Certificate Redemption**.
- Certificate **3299**, issued **1 June 2026**, face **$3,885.35**, rate **0.25%**.
- Printed redemption quote: **$4,085.87 if received by 30 October 2026**.
- Seven printed charges sum exactly to the quote; face amount is not added again.
- The source document does not publish annual authority tax rows or a payment receipt. These fields remain unavailable, rather than zero or substituted from another document.

## Cause and changes

Direct server access still returns HTTP 403; fresh deterministic managed-browser recovery now supplies the verified account and source document. The former staging configuration permitted only one capture per process, which had been consumed. The existing bounded operator setting is now **10 captures per service process**; the final running process used one for portal acceptance, leaving **nine**. This remains a diagnostic allowance, not a durable production spending ledger.

The previous PDF transfer required roughly 90 small execute requests. The provider's documented rate limit can interrupt that transfer. The final implementation sends base64 lines below 256 KiB (eight chunks for this approximately 1.5 MB source), reduces chunk size once if the provider truncates output, validates each chunk and verifies complete byte length, PDF signature and SHA-256 against the freshly retrieved source. A single bounded Retry-After retry handles rate limiting during session creation, capture and chunk transfer within the original lookup deadline. Cancellation and independent provider cleanup remain in place.

The account page contains separate payable and history tables. Capture now waits for the history footer explicitly, preventing both a strict-selector error and a capture before history is ready.

The original PDF is a certificate redemption notice, which the former annual-tax parser rejected. A deterministic positioned-text parser now retains its identity, printed charges, certificate details and received-by quote, and checks those against the independently verified annual history. It does not infer annual ad valorem totals or paid amounts from redemption charges.

An attempted direct CDP transfer did not pass live acceptance and was replaced. Its additional browser dependency was removed; the final package dependencies are unchanged.

## Release and checks

- Active release: `/home/interns/apps/taxes/releases/besil-20261012-pdf-recovery-v7`.
- Prior starting release: `besil-20261012-staging-recovery-v3`; rollback releases and private environment/database backups were preserved.
- Local baseline HEAD: `024e558037ca3bd973f2744d0677c9e6cba53a00`, with pre-existing uncommitted Besil changes preserved. No GitHub push or production deployment was performed.
- Final server-side offline suite: **318 passed, zero failed**; self-host build passed. Final source hashes match the local files and are retained in the deployment receipt.
- Tests cover full-size transfer, truncation, byte corruption, canceled transfer, bounded rate-limit retry, duplicate footers, redemption charges, wrong parcel/year and an unaffected original annual PDF.
- Earlier successful API request on v6: `9942d4a6-f3df-4f31-aa00-80ffeba88278`. Final v7 portal request delivers and renders its own fresh authenticated API result; it is not a replay of that earlier response.

## Paid usage and cleanup

Provider balance **982 -> 970**, a reconciled **12 credits** across six owned captures, including failed diagnosis. Five service captures account for ten credits; one standalone diagnosis accounts for two. All owned sessions were closed; the final provider query reports **zero active sessions**. Existing operator-authorized staging ledger bypass remains explicit; no original ledger, allowance or history was created or reset. At the application's bookkeeping rate of $0.02 per credit, this turn's usage corresponds to $0.24; that calculation does not assert the missing historical ledger balance.

## Remaining source limits

The response correctly remains `partial`: source years 2008-2012 are unavailable and independent certificate/deed historical clearance is not implemented. These are source coverage gaps, not the original retrieval errors. This acceptance covers the verified Miami example; it is not county-wide or production acceptance.

## Evidence

- [Final portal/API JSON](evidence/miami-pdf-repair-2026-10-12/portal-verified-v7.json)
- [Portal screenshot](evidence/miami-pdf-repair-2026-10-12/portal-verified-v7.jpg)
- [Earlier v6 API verification](evidence/miami-pdf-repair-2026-10-12/api-verified-v6.json)
- [Deployment hashes, test summary, usage and cleanup](evidence/miami-pdf-repair-2026-10-12/deployment-and-usage.json)
- Failed intermediate acceptance responses remain in the same evidence directory and are not represented as successful results.
