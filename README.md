# taxes — standalone Zeneral property-tax application

**Deployment target: your own Linux server with Nginx/systemd. ChatGPT Sites is not required.** The default setup, dev server, build and production entry point use Node.js and SQLite. GitHub is the canonical code repository.

Read [AGENTS.md](AGENTS.md), [development handoff](docs/DEVELOPMENT-HANDOFF.md), [architecture](docs/ARCHITECTURE.md) and [Linux deployment guide](docs/DEPLOYMENT.md). Agents must use the self-hosted route and must not create or publish a ChatGPT Site.

## Local setup

Install Git and Node 22 LTS, minimum 22.13. No Cloudflare account, Codex hosting tooling, Python, browser installation or managed-provider credentials are required for offline setup.

```sh
git clone https://github.com/karthikbala/taxes.git
cd taxes
npm ci
npm run setup:local
npm test
npm run build
npm start
```

Open http://127.0.0.1:3000/poc. Setup generates an ignored `.env.local` containing a random local `INVISIA_POC_API_KEY`; read that file privately and paste the key into the form. Paid source access is disabled. SQLite schema is initialized at ignored `runtime/taxes.sqlite`; no paid budget is created or reset.

For development use `npm run dev`. Node watches imported code; restart it after changes to generated HTML text modules if required. `npm run db:setup` initializes missing local schema without replacing data. Build emits `dist/selfhost`; deployment uses the full repository with the standalone server, not an old Worker bundle.

## Entry points and configuration

- `server/index.mjs`: standalone HTTP server, startup and shutdown.
- `server/app.mjs`: authenticated APIs, safe pages/static assets, deadlines and request IDs.
- `server/sqlite.mjs`: persistent local database with atomic reservation/reconciliation.
- `lib/client/`, `lib/live/`: existing deterministic source adapters, parsing, matching and validation.
- `/florida`: the dated 67-county source matrix, with search and backend/access filters.
- `/poc`: rich address/owner workflow; `/live`: older parcel workflow with self-hosted API key input.
- `/healthz`: liveness only, no provider calls.
- `/api/v2/health`: protected readiness/preflight, distinct from liveness or extraction proof.

Environment variables are listed in [.env.example](.env.example). The defaults bind `127.0.0.1:3000`, use SQLite and disable managed browser access. Production requires `INVISIA_POC_API_KEY`. Use a durable `TAXES_DB_PATH` and privately provision the production environment; never commit env files or databases.

Both v1 and v2 lookup endpoints require the Bearer key on the standalone server. Source capability endpoints remain public.

```sh
curl -X POST 'http://127.0.0.1:3000/api/v2/property/lookup' \
  -H "Authorization: Bearer $POC_ACCESS_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"scrap_order_id":"10000001","address":"555 NE 15 ST UNIT 401","ownerName":"JUDE PATRICK JACOB","county":"miami-dade-fl","transactionType":"REFI","state":"FL"}'
```

Load `POC_ACCESS_KEY` securely from your local environment before using curl. The local key differs from the existing hosted API key. Order ID is pass-through business metadata; each call generates an independent request ID.

## Sources and testing

Three richer client workflows are enabled: Miami-Dade, Osceola and Bradford, with explicit partial coverage. Twenty legacy parcel workflows are configured; seventeen still await the richer contract. The 67-county registry is research coverage, not 67 completed crawlers.

Runtime extraction is fixed code, never an LLM call. County selection fills sample inputs; Miami is client-supplied, the other two are Zeneral-selected public examples.

`npm test` blocks external source/provider traffic. Fixtures mock those transports; HTTP server tests explicitly allow literal loopback only. GitHub CI runs offline tests and the self-host build on Node 22. It does not deploy or use provider secrets.

Real county calls are separate from tests. Without the existing managed browser credentials and approved ledger, challenged sources return explicit unavailable/blocked sections; saved samples are never fallback data.

## Miami-Dade neighbouring properties

The `/poc` page includes **Check neighbouring properties**. The separate protected `POST /api/v2/property/neighbors` endpoint accepts the lookup fields and optional `neighborOptions`. The default scope includes only parcels with a verified shared boundary. Same-building condo units are excluded unless the demo checkbox **Include units in the same building** is selected or the API explicitly sets `neighborOptions.sameBuilding: true`. For the separately verified Gaston example, enter `555 NE 15 ST UNIT T-15` / `GASTON GIRARD` and select that checkbox. It returns official geometry, registered-name comparisons and explicit coverage. It uses deterministic direct county requests. See [implementation and live examples](docs/MIAMI-NEIGHBORS-2026-10-09.md).

```sh
curl -X POST 'http://127.0.0.1:3000/api/v2/property/neighbors' \
  -H "Authorization: Bearer $POC_ACCESS_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"scrap_order_id":"10000001","address":"555 NE 15 ST UNIT 401","ownerName":"JUDE PATRICK JACOB","county":"miami-dade-fl","transactionType":"REFI","state":"FL","neighborOptions":{"sameBuilding":false,"adjacency":true,"maxCandidates":50}}'
```

## Linux deployment

Use [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [systemd service](deploy/taxes.service) and [Nginx template](deploy/nginx.conf). Provision Node 22, an unprivileged service user, private environment file, durable SQLite storage, HTTPS and server/DNS permissions. Docker templates are an optional alternative.

Keep managed source access off until the prior production spending ledger and settled browser history are migrated and verified. `npm run budget:import -- --budget <snapshot.json> --database <database-path> --approved-import` requires an owner-supplied settled snapshot with the existing budget ID and complete browser_runs array; it never replaces an existing ledger or assumes a new $5 allowance.

SQLite currently supports one application instance. Do not run independent budget databases or old/new paid deployments concurrently. GitHub pushes and npm builds do not deploy; releases and DNS cutover need explicit owner authorization.

## Historical hosting

The live taxes.zeneral.ai site still uses the existing Worker host until your colleague deploys and switches DNS. On 8 October 2026, the explicitly requested matrix page was added at /florida in v28, source d744bb03af1bde6eeb1e775556aea740577ded11. Extraction remains based on accepted v27; see dated [source evidence](docs/evidence/README.md). This publication does not change the Linux deployment direction.

Old Worker routes and scaffolding are isolated under [legacy/sites-worker](legacy/sites-worker/README.md). Hosting identifiers and the former dependency manifest are archived under docs/history. They are reference material, not dependencies or instructions to use Sites. No .openai hosting declaration remains in the active project.

Before deleting old local files, preserve the current hosted key and required production backups through approved private storage. The repo is private; grant your colleague GitHub access and authorized server/DNS access. They do **not** need a ChatGPT Sites account for the chosen deployment path.
