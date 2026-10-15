# Architecture

This application has a standalone Node 22 server for local development and future Linux self-hosting. GitHub is the primary source of truth. The existing Cloudflare Worker/Sites deployment is a legacy runtime with dated acceptance evidence; preparing Node support does not replace it. [README](../README.md) owns installation and local setup; [deployment](DEPLOYMENT.md) owns future server operation; [handoff](DEVELOPMENT-HANDOFF.md) owns the dated acceptance snapshot. [AGENTS.md](../AGENTS.md) defines change/release rules.

## Request path

`/poc` → browser `/poc.js` → selected supported search method. Address-and-owner orders use authenticated `POST /api/v2/property/lookup` → input normalization → county address/owner resolution → appraiser sections → identity-joined collector history/original annual bill → contract serialization → JSON/UI. Parcel orders use the existing authenticated `/api/v1/property/lookup`; their original parcel envelope and source coverage are rendered separately.

`public/poc-workflows.mjs` combines the v1 catalogue and enabled v2 address contracts. The POC retains all three established address workflows, alongside nine counties with production parcel/collector sample verification. Source-limited address workflows stay visible with their availability stated; visibility does not promote acceptance. The full API catalogue remains separate, including explicitly requested Florida annual-roll modes. Annual-roll data is never an automatic fallback. Mode changes clear prior results and disable irrelevant fields; parcel JSON retains its own fields and source gaps.

| Component | Responsibility |
| --- | --- |
| `server/index.mjs`, `server/app.mjs`, `server/sqlite.mjs` | Standalone HTTP entry point, local environment loading, API/static delivery and SQLite runtime binding |
| `server/app.mjs`, `lib/poc-page.ts`, `public/poc.js` | POC form, county examples, safe value rendering, source/section coverage and JSON download |
| `server/app.mjs` | Bearer authorization, bounded JSON input, request-ID assignment, guarded browser integration and error response |
| `lib/client/access.mjs` | POC authorization and managed-service entitlement/ledger preflight |
| `lib/client/engine.mjs` | County dispatch, bounded fresh transport, retries, partial-section preservation, provenance and composed validation |
| `lib/client/miami.mjs`, `osceola.mjs`, `bradford.mjs`, `address-detection.mjs` | Native owner/site/mailing evidence, shared unique-parcel selection and county appraiser enrichment |
| `lib/client/bill.mjs`, `visualgov.mjs` | Deterministic original PDF/HTML bill parsing and public annual-history parsing |
| `lib/client/delinquency.mjs` | Decimal money handling and scope-aware liability classification |
| `lib/client/contract.mjs`, `profiles.mjs` | Input/client envelope, mandatory sections, metadata and explicit county readiness |
| `lib/client/logging.mjs` | Correlated structured events with a restricted safe field set |
| `lib/live/florida.mjs`, county/collector adapters | Existing deterministic parcel-based source retrieval shared with v2 |
| `lib/live/managed-browser.mjs`, `browser-budget.mjs` | Approved scripted browser capture and durable reservation/reconciliation |
| `tests/`, `tests/fixtures/` | Offline independent contract, source parser, identity, renderer and failure evidence |

`/live` and `/api/v1/property/lookup` retain the legacy parcel interface. `/api/v1/sources` exposes the broader source catalogue. `/api/v2/sources` exposes configured client profiles; `/api/v2/health` is authenticated readiness/preflight. Neither health nor capability output proves fresh extraction correctness or the loaded source revision.

## Matching and extraction boundaries

Each county resolver returns an explicit match outcome and candidate evidence. The three advertised address adapters accept automatic site/mailing detection through one shared unique-parcel selection rule; native evidence collection remains county-specific. Both address roles preserve the requested owner and complete parcel identity. Different matching parcels require review; address-role priority cannot choose one. Complete pagination is required before unique-match claims. Owner comparison and unit-sensitive addresses prevent neighbour/condominium collisions. Parcel-to-collector joins retain county-specific aliases/keys rather than silently assuming all account IDs equal the assessor ID.

Transport captures fresh response identity, status, timestamps and hashes within deadlines/body limits. Direct retrieval comes first; approved managed-browser recovery captures original HTML/PDF using scripted JavaScript. Browser recovery is deterministic and preserves the direct blocked-source event separately. The original document must independently match the expected parcel/account and annual bill year.

Bill parsing retains authority rows, source rate units, exemptions/non-ad-valorem rows, totals and printed payment data. Appraiser certified/preliminary/working years stay distinct. Cross-source values require source-backed identity/year/authority matching. A generated report never becomes an original source PDF.

The client envelope preserves source-backed sections on partial failure, per-section status, explanatory notes, field provenance, validation and extraction metadata. `EMPTY` requires inspected-source support; unavailable values remain null and legitimate zero/false values survive rendering. Current paid status/balance and public annual history are separate from complete delinquency or certificate/deed clearance.

## Runtime state and secrets

The Node runtime uses Node 22's built-in SQLite support. `TAXES_DB_PATH` defaults to `./runtime/taxes.sqlite`; `DB` remains the application-facing database interface. The schema stores the managed-browser ledger and run reservations, not a completed production order-management system. Use a durable, private database path and one app instance. A shared database requires a separate reviewed implementation.

The legacy hosting declaration `docs/history/cloudflare-sites-v27.json` binds D1 as `DB`. Its production ledger must be backed up, imported and reconciled during an authorized migration. Local setup creates schema only and leaves paid managed access disabled; it must never seed a replacement paid allowance. Local `.wrangler/` state is disposable preview state and is not a production backup.

`INVISIA_POC_API_KEY` authorizes v2 requests. Managed access additionally requires `INVISIA_BROWSER_API_KEY`, `INVISIA_BROWSER_ENABLED=1`, the DB binding, verified entitlement and remaining authorized budget. Secret values belong in approved secret storage and ignored local configuration. The browser form retains its entered POC key only in page memory; do not persist it or add it to logs.

`npm start` runs the standalone server at `HOST=127.0.0.1`, `PORT=3000` by default and reads private `.env.local` when present. Linux service configuration supplies variables from `/etc/taxes/taxes.env`; container operation sets `HOST=0.0.0.0` inside the container while publishing only a loopback host port. Nginx provides the public HTTPS boundary. Source extraction and CLI adapters stay deterministic, with no runtime model calls.

Server SSH, GitHub and DNS permissions are operator concerns recorded in the deployment guide. The historical Sites binding grants no authority to use that account. A colleague can run and maintain the Node route without a Sites editor account. No runtime reads a Mac-specific path or PortTrack checkout.

## Safe extension point

For a new rich county contract, add native resolution/enrichment beside the existing county modules, reuse reviewed collector-family parsing where applicable, and add source-derived offline positive/negative fixtures. Keep `address_lookup_enabled` false until independent source → JSON → UI acceptance passes. A shared maintainer integrates any engine, contract, auth, transport, budget or UI change and releases once focused checks pass. Use `profiles.mjs` for explicit readiness/limitations and update the dated handoff with revision and live proof.

## Durable address retrieval

The standalone runtime adds a SQLite-backed job runner for the three rich address workflows. Job requests authenticate before validation/dispatch and run independently of HTTP disconnects. Immutable per-job artifacts, stage checkpoints, recovery leases and recorded paid dispatch ownership support restart recovery. New jobs fetch fresh sources; incomplete pagination stages are refreshed rather than replayed as complete. Protected artifact/review/operations endpoints use the current single-operator key. See [operations and API](reliability/RUNBOOK.md).

PDF extraction runs outside the HTTP event loop, with a single bounded worker queue. Optional local Chromium precedes managed recovery. Optional PyMuPDF/Tesseract requires approved licensing and production container isolation. OCR output remains review-only. Structured field availability and source scopes accompany progressive POC results. Release acceptance, original spending-ledger reconciliation and the seven-day soak remain explicit gates; job completion does not establish historical clearance.
