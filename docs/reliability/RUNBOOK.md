# Reliable retrieval operations

## Runtime and interfaces

Node 22.13+ / SQLite WAL, one application instance, two concurrent durable jobs. Existing synchronous lookup and neighbouring-property APIs remain compatible. Python and Chromium are optional and disabled until provisioned. No startup, test or setup command seeds a spending ledger.

- `POST /api/v2/property/jobs`: existing v2 input; optional `Idempotency-Key` and `X-Retrieval-Access: direct_only`. Returns 202 and Location, or 200 for the same key/input/access policy; mismatched reuse returns 409.
- `GET /api/v2/property/jobs/:id`: progress, partial verified result, gaps, field evidence, artifacts and attempt history.
- `POST .../:id/cancel`: durable cancellation; sessions still clean up before resume is allowed.
- `POST .../:id/resume`: `{}` or `{input: <corrected v2 input>}`. Corrected identity creates a new artifact generation. Existing evidence remains in the audit trail.
- `GET .../:id/artifacts/:artifactId`: authenticated attachment; untrusted originals never execute as inline HTML.
- `GET .../:id/records-request`: generates an unsent request draft; no email is dispatched.
- `POST .../:id/review`: `{artifact_id,source_url,note}` adds a protected operator evidence note to a terminal job. Notes never overwrite source values or waive identity, amount, budget or clearance checks. Resume after an actual adapter/input/access correction.
- `GET /api/v2/operations/retrieval`: authenticated queue counts, oldest queued timestamp and unresolved cleanup count.
- `POST .../:id/artifact-ingest/:ticket`: one-use five-minute job-specific token; not the POC key. Only running jobs accept hash/size/signature-matched PDFs, up to 25 MiB.

The current API key represents one operator. It must not be shared across independent tenants; introduce principal-to-job ownership before multi-tenant use. POC storage contains an opaque job reference only, never the access key or property input. Enter the key again after reload and choose **Restore saved lookup**.

## Persistence and recovery

The additive `retrieval_*` tables live in the existing durable database. Jobs checkpoint stage results; successful source responses belonging to completed stages can be reused only within that job's 24-hour recovery window. Partial pagination stages are fetched again after restart. New jobs always fetch fresh sources. Cookie-setting responses are not replayed; session cookies remain in memory only.

Workers renew two-minute leases. Expired running jobs requeue unless an uncertain paid dispatch exists, in which case they require review. Restart recovery replays deterministic parsing from the job's original artifacts and resumes missing source work. It does not substitute fixtures or another order's evidence. Three scheduled recovery cycles use 1 minute / 5 minutes / 30 minutes delays, within 24 hours, respecting longer Retry-After delays without tight polling.

A host opens its circuit after five consecutive transient failures for 15 minutes. One navigation per host runs at once. Provider calls and external paid Clerk calls share a single application semaphore. Direct-only jobs cannot dispatch either paid path.

Managed dispatch intent is recorded before dispatch and linked to the existing reservation/session. Known orphan sessions are closed through the provider API and outstanding reservations conservatively reconciled; unknown creation outcomes require operator review. Never delete reservation rows, restore an old spending database or clear unknown outcomes to regain allowance. Review `retrieval_sessions` and the existing `browser_runs` together. A previously dispatched paid capture is not automatically purchased again because its response was lost.

## Optional browser and PDF setup

Playwright is pinned as an optional dependency. Install Chromium with the pinned package's installer during reviewed provisioning; keep `TAXES_LOCAL_BROWSER_ENABLED=0` until the sandbox launches successfully. Run the service as an unprivileged user. Browser navigation uses fixed county scripts and reviewed host profiles, not caller-provided URLs or scripts.

An operator may set `TAXES_LOCAL_BROWSER_EXECUTABLE_PATH` to an absolute installed Chromium path. Sandbox and TLS validation remain enabled. Miami-Dade/Osceola browser asset requests may load the exact `challenges.cloudflare.com` Turnstile/security-check paths; those dependencies are not accepted as source evidence or top-level county records. No interactive challenge is solved automatically. A successful Chromium launch does not establish collector access; validate the requested record before enabling this optional lane.

`unpdf` and existing tax rules run in a single worker-thread queue. PDF processing defaults to 25 MiB / 50 pages. Node heap limits and Python OS/container limits bound memory; they do not constitute a hard 1 GiB limit on the entire Node server's RSS.

Before activating PyMuPDF, obtain a license decision, build `deploy/Dockerfile.pdf-worker`, record its image digest and test it. Set `TAXES_PYMUPDF_ENABLED=1`, `TAXES_PYMUPDF_LICENSE_APPROVED=1`, and `TAXES_PDF_CONTAINER_IMAGE=taxes-pdf-worker@sha256:<approved digest>`. Production refuses an uncontained Python fallback. The container has no network, is read-only, drops capabilities and is limited to 1 GiB, one CPU and 64 processes. Python receives source bytes on stdin and no application secrets. Text extraction is bounded to 120 seconds; OCR to five minutes. Node cancellation terminates its worker; container cleanup must also be verified during activation.

PyMuPDF text and tables are normalized to bottom-origin coordinates. OCR runs only when needed. Derived OCR artifacts are preserved separately; OCR output currently requires human review and is not automatically promoted to a verified payable amount. Licensing and real scanned-document acceptance remain activation gates.

### Poppler/Tesseract OCR without PyMuPDF

An independent optional backend now handles pages with no embedded text. Install Python 3, Poppler (`pdfinfo`, `pdftoppm`) and English Tesseract, then set `TAXES_OCR_ENABLED=1` for a local evaluation. This does not enable PyMuPDF or waive its license gate. Production additionally requires the reviewed `deploy/Dockerfile.ocr-worker` image and `TAXES_OCR_CONTAINER_IMAGE=taxes-ocr-worker@sha256:<verified digest>`. The same network, capability, memory, process and timeout isolation applies. No startup script enables OCR automatically.

`unpdf` remains first. Missing-text page numbers select OCR pages; embedded items from other pages remain unchanged. Each selected page is rasterized at 300 DPI, bounded to 20 million pixels, then passed to Tesseract's English TSV output. Words retain exact recognized characters, page coordinates and confidence; adjacent words form positioned spans without merging leading bill-year tokens into headings. Low-confidence words remain visible and are never silently repaired or dropped. Confidence is a diagnostic, not proof that an amount or identity is correct.

The original PDF stays unchanged. Durable jobs await storage of a separate `derived_pdf_text` artifact before reparsing it. Parcel, year, layout and reconciliation checks still apply. Even a successful OCR reparse returns `document_ocr_review_required`, with no automatically accepted financial values. Scanned/flattened Allegheny receipts without AcroForm fields use their separately validated payment-table layout when OCR is enabled; existing AcroForm receipt behavior remains the default.

For local inspection without county/provider access:

```sh
TAXES_OCR_ENABLED=1 node scripts/ocr-pdf.mjs input.pdf runtime/ocr-review
```

The command creates private `extraction.json` and `text.txt`, including the original SHA256, coordinates, OCR page list and confidence diagnostics. It does not change the source, fetch a record, infer business fields or produce a payable amount. Local operator overrides are `TAXES_PYTHON`, `TAXES_TESSERACT`, `TAXES_PDFINFO` and `TAXES_PDFTOPPM`; container execution ignores host binary overrides.

Limitations: English printed text, no handwriting guarantee, no automatic OCR of images on a page that already has embedded text, and no automatic correction of skew or damaged print. Three image-only copies of retained county PDFs passed local recognition/identity/review checks on 13 October 2026; these are controlled scan simulations, not acceptance of unseen original county scans. The production container still needs to be built and validated on the deployment host.

To enable managed binary PDF ingress, install the reviewed Nginx locations and set `TAXES_ARTIFACT_INGEST_ORIGIN` to the approved HTTPS origin. Polling has a separate rate limit from lookup submissions. The ingest path permits bounded binary bodies; ordinary API input retains its 8 KiB application limit. Leave ingress unset until an external upload test passes; chunked transfer remains available.

## Retention, monitoring and rollback

SQLite/WAL/SHM files are mode 0600; new runtime directories are mode 0700. Use a dedicated private durable volume and encrypted backups. Source bodies and derived artifacts are private data, not repository fixtures. Operational logs exclude property values, credentials, cookies, arbitrary source stderr and upload tokens.

The runner purges terminal job evidence after 90 days, once an hour. Active jobs and unresolved financial/session outcomes are retained for reconciliation. Monitor disk usage separately; SQLite file size does not shrink automatically after deletion.

Use `scripts/soak-reliability.mjs` with a private key and state path for health/queue checks. It performs **no source lookup** and cannot prove live extraction accuracy. Run hourly for seven days after a validated staging deployment. Alert on worker inactivity/queue age, cleanup pending, disk pressure, validation/layout errors and exhausted recovery. Source probes require a separate bounded approval.

Before deployment: verify loaded release, current source hashes, no active provider work, current reservations and remaining authorized allowance. Back up SQLite consistently with `VACUUM INTO`, retain the prior release and private environment backup, install locked dependencies, run offline tests/build and validate auth/assets/job recovery. Schema changes are additive. Rollback changes application code only and preserves the current database, artifacts, jobs and spending history; never restore an older ledger over new spend.

## County acceptance

`acceptance-matrix.json` contains 36 **pending slots**, not claimed verified properties. Fill twelve distinct independently verified identities per county, original source URLs, collection dates, exact field expectations and reviewer. Existing dated fixtures are regression evidence only.

`scripts/accept-reliability.mjs` rejects incomplete matrices and stale/mismatched approvals. Default evaluation is direct-only. An approval JSON must contain exact origin, `max_jobs:36`, `approved_by`, `expires_at` and explicit `allow_paid:true` only when paid work is separately approved and the original ledger is available. Load keys privately, never in command arguments. The script records authenticated job/API assertions; independently verify rendered UI for each case and retain proof. API success alone is not county acceptance. UI proof and seven elapsed days remain separate gates.
