# Architecture

This standalone Vinext/React application runs as a Cloudflare Worker. [README](../README.md) owns installation, local preview, secret provisioning and deployment procedure; [handoff](DEVELOPMENT-HANDOFF.md) owns the dated acceptance snapshot. [AGENTS.md](../AGENTS.md) defines change/release rules.

## Request path

`/poc` → browser `/poc.js` → authenticated `POST /api/v2/property/lookup` → input normalization → county address/owner resolution → appraiser sections → identity-joined collector history/original annual bill → contract serialization → JSON/UI.

| Component | Responsibility |
| --- | --- |
| `app/poc/route.ts`, `lib/poc-page.ts`, `public/poc.js` | POC form, county examples, safe value rendering, source/section coverage and JSON download |
| `app/api/v2/property/lookup/route.ts` | Bearer authorization, bounded JSON input, request-ID assignment, guarded browser integration and error response |
| `lib/client/access.mjs` | POC authorization and managed-service entitlement/ledger preflight |
| `lib/client/engine.mjs` | County dispatch, bounded fresh transport, retries, partial-section preservation, provenance and composed validation |
| `lib/client/miami.mjs`, `osceola.mjs`, `bradford.mjs` | Native address/owner resolution and county appraiser enrichment |
| `lib/client/bill.mjs`, `visualgov.mjs` | Deterministic original PDF/HTML bill parsing and public annual-history parsing |
| `lib/client/delinquency.mjs` | Decimal money handling and scope-aware liability classification |
| `lib/client/contract.mjs`, `profiles.mjs` | Input/client envelope, mandatory sections, metadata and explicit county readiness |
| `lib/client/logging.mjs` | Correlated structured events with a restricted safe field set |
| `lib/live/florida.mjs`, county/collector adapters | Existing deterministic parcel-based source retrieval shared with v2 |
| `lib/live/managed-browser.mjs`, `browser-budget.mjs` | Approved scripted browser capture and D1 reservation/reconciliation |
| `tests/`, `tests/fixtures/` | Offline independent contract, source parser, identity, renderer and failure evidence |

`/live` and `/api/v1/property/lookup` retain the legacy parcel interface. `/api/v1/sources` exposes the broader source catalogue. `/api/v2/sources` exposes configured client profiles; `/api/v2/health` is authenticated readiness/preflight. Neither health nor capability output proves fresh extraction correctness or the loaded source revision.

## Matching and extraction boundaries

Each county resolver returns an explicit match outcome and candidate evidence. Complete pagination is required before unique-match claims. Owner comparison and unit-sensitive addresses prevent neighbour/condominium collisions. Parcel-to-collector joins retain county-specific aliases/keys rather than silently assuming all account IDs equal the assessor ID.

Transport captures fresh response identity, status, timestamps and hashes within deadlines/body limits. Direct retrieval comes first; approved managed-browser recovery captures original HTML/PDF using scripted JavaScript. Browser recovery is deterministic and preserves the direct blocked-source event separately. The original document must independently match the expected parcel/account and annual bill year.

Bill parsing retains authority rows, source rate units, exemptions/non-ad-valorem rows, totals and printed payment data. Appraiser certified/preliminary/working years stay distinct. Cross-source values require source-backed identity/year/authority matching. A generated report never becomes an original source PDF.

The client envelope preserves source-backed sections on partial failure, per-section status, explanatory notes, field provenance, validation and extraction metadata. `EMPTY` requires inspected-source support; unavailable values remain null and legitimate zero/false values survive rendering. Current paid status/balance and public annual history are separate from complete delinquency or certificate/deed clearance.

## Runtime state and secrets

Hosting declares D1 binding `DB` in `.openai/hosting.json`; `drizzle/` contains the budget/run schema. D1 stores the shared managed-browser ledger and run reservations, not a completed production order-management system. Preserve the existing ledger during migration. Local `.wrangler/` state is disposable preview state and must not be treated as the production ledger.

`INVISIA_POC_API_KEY` authorizes v2 requests. Managed access additionally requires `INVISIA_BROWSER_API_KEY`, `INVISIA_BROWSER_ENABLED=1`, the DB binding, verified entitlement and remaining authorized budget. Secret values belong in approved secret storage and ignored local configuration. The browser form retains its entered POC key only in page memory; do not persist it or add it to logs.

Deployment identity/account permissions and standalone setup are operator concerns recorded in README. The existing Sites project binding is historical deployment configuration, not permission for another maintainer to deploy into that account. No runtime reads a Mac-specific path or PortTrack checkout.

## Safe extension point

For a new rich county contract, add native resolution/enrichment beside the existing county modules, reuse reviewed collector-family parsing where applicable, and add source-derived offline positive/negative fixtures. Keep `address_lookup_enabled` false until independent source → JSON → UI acceptance passes. A shared maintainer integrates any engine, contract, auth, transport, budget or UI change and releases once focused checks pass. Use `profiles.mjs` for explicit readiness/limitations and update the dated handoff with revision and live proof.
