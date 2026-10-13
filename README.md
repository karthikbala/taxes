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
- `/poc`: unified county workflow selector with rich address/owner and existing parcel lookups; `/live`: older parcel explorer with the same authenticated parcel API.
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

The `/poc` selector is deliberately limited to nine counties whose production samples returned county tax records and parsed original documents on 13 October 2026 with paid recovery disabled: Allegheny, Baker, Bradford, Columbia, DeSoto, Highlands, Palm Beach, Suwannee and Union. Bradford supports address/owner and parcel search; Baker is collector-only; the others use parcel IDs. The page defaults to Bradford. Annual-roll-only, blocked and conflicting workflows are excluded. The broader API source directory remains separate from POC admission.

`public/poc-workflows.mjs` owns the explicit admitted modes. Re-admission requires fresh source → original document → authenticated API acceptance under the deployed access configuration. Passing sample checks does not guarantee every property or complete historical clearance. Miami-Dade and Osceola remain excluded while their required source recovery is unavailable.

Osceola includes exact-account Collector certificate and tax-deed reports. The independent Clerk parcel search is optional: privately provision `SCRAPEDO_API_KEY` and explicitly enable `INVISIA_OSCEOLA_CLERK_ENABLED=1`. It uses one bounded native HTTP query through Scrape.do and the existing spending policy. Public-query completeness does not establish historical/title clearance. See [the dated source and staging evidence](docs/OSCEOLA-CERTIFICATE-DEED-COVERAGE-2026-10-12.md).

Runtime extraction is fixed code, never an LLM call. County selection fills sample inputs. Miami defaults to the Zeneral-verified T-15 / GASTON GIRARD neighbour example with same-building units enabled. The original client-supplied unit-401 sample remains a regression fixture and API example; the other two county defaults are Zeneral-selected public examples.

`npm test` blocks external source/provider traffic. Fixtures mock those transports; HTTP server tests explicitly allow literal loopback only. GitHub CI runs offline tests and the self-host build on Node 22. It does not deploy or use provider secrets.

Real county calls are separate from tests. Without the existing managed browser credentials and approved ledger, challenged sources return explicit unavailable/blocked sections; saved samples are never fallback data.

## Miami-Dade neighbouring properties

The `/poc` page includes **Check neighbouring properties**. The separate protected `POST /api/v2/property/neighbors` endpoint accepts the lookup fields and optional `neighborOptions`. The default scope includes only parcels with a verified shared boundary. Same-building condo units are excluded unless the demo checkbox **Include units in the same building** is selected or the API explicitly sets `neighborOptions.sameBuilding: true`. Miami pre-fills `555 NE 15 ST UNIT T-15` / `GASTON GIRARD` and selects that checkbox to demonstrate the three verified unit owner matches. Uncheck it for boundary-only mode. It returns official geometry, registered-name comparisons and explicit coverage. It uses deterministic direct county requests. See [implementation and live examples](docs/MIAMI-NEIGHBORS-2026-10-09.md).

```sh
curl -X POST 'http://127.0.0.1:3000/api/v2/property/neighbors' \
  -H "Authorization: Bearer $POC_ACCESS_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"scrap_order_id":"10000001","address":"555 NE 15 ST UNIT 401","ownerName":"JUDE PATRICK JACOB","county":"miami-dade-fl","transactionType":"REFI","state":"FL","neighborOptions":{"sameBuilding":false,"adjacency":true,"maxCandidates":50}}'
```

Matching owner tiles open a fresh lookup of the selected property through the existing v2 API. The form follows the selected address/unit and owner; the page checks the clicked folio against the returned appraiser and resolution IDs before displaying its details. **Back to neighbour results** restores the original subject, highlighted matches and neighbour JSON without another source request. Original client order metadata is retained, and each lookup gets its own extraction request ID. See [drilldown acceptance and handoff](docs/NEIGHBOR-PROPERTY-DRILLDOWN-2026-10-10.md).

## Linux deployment

Use [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [systemd service](deploy/taxes.service) and [Nginx template](deploy/nginx.conf). Provision Node 22, an unprivileged service user, private environment file, durable SQLite storage, HTTPS and server/DNS permissions. Docker templates are an optional alternative.

Keep managed source access off until the prior production spending ledger and settled browser history are migrated and verified. `npm run budget:import -- --budget <snapshot.json> --database <database-path> --approved-import` requires an owner-supplied settled snapshot with the existing budget ID and complete browser_runs array; it never replaces an existing ledger or assumes a new $5 allowance.

SQLite currently supports one application instance. Do not run independent budget databases or old/new paid deployments concurrently. GitHub pushes and npm builds do not deploy; releases and DNS cutover need explicit owner authorization.

## Historical hosting

The live taxes.zeneral.ai site still uses the existing Worker host until your colleague deploys and switches DNS. On 8 October 2026, the explicitly requested matrix page was added at /florida in v28, source d744bb03af1bde6eeb1e775556aea740577ded11. Extraction remains based on accepted v27; see dated [source evidence](docs/evidence/README.md). This publication does not change the Linux deployment direction.

Old Worker routes and scaffolding are isolated under [legacy/sites-worker](legacy/sites-worker/README.md). Hosting identifiers and the former dependency manifest are archived under docs/history. They are reference material, not dependencies or instructions to use Sites. No .openai hosting declaration remains in the active project.

Before deleting old local files, preserve the current hosted key and required production backups through approved private storage. The repo is private; grant your colleague GitHub access and authorized server/DNS access. They do **not** need a ChatGPT Sites account for the chosen deployment path.

## County TLS intermediate chain

`npm start` and `npm run dev` launch Node with the reviewed public Let’s Encrypt YR2 chain in `vendor/tls/letsencrypt-yr2-chain.pem`. Highlands currently omits that chain in its TLS handshake. The bundle is signed through Node’s existing ISRG Root X1; certificate, hostname and expiry checks remain enabled. For a direct systemd Node entry point, set `NODE_EXTRA_CA_CERTS` to the absolute bundle path in the service environment before startup. Setting it inside an already running Node process does not repair the TLS context. See [certificate provenance](vendor/tls/README.md).

## Resumable retrieval

Miami-Dade, Osceola and Bradford address orders now use authenticated durable jobs on the standalone SQLite runtime. The POC shows progress and can restore an opaque job reference after reload; the access key stays in memory. Existing synchronous APIs remain compatible. See [job API and operations](docs/reliability/RUNBOOK.md), [failure coverage](docs/reliability/FAILURE-MATRIX.md) and [cost/access gates](docs/reliability/COST-AND-ACCESS-GATES.md). Optional Chromium, licensed PyMuPDF/OCR, fresh 36-property acceptance and the seven-day staging soak require their documented activation gates. This implementation does not establish complete historical clearance.

## Bradford automatic address detection

Bradford address orders default to **Detect automatically** (`addressType: "auto"`, also used when omitted). Complete county site and owner searches must identify one parcel with the exact owner and site or mailing street/unit; different parcels remain ambiguous, and incomplete searches block automatic selection. The response records the detected address meaning and retains the actual property site separately from the supplied address. The optional selector and `addressType: "site"` / `"mailing"` overrides remain available. This detection is Bradford-only; other counties keep their existing behavior. See [Besil identity and automated-recovery acceptance](docs/BESIL-IDENTITY-AND-AUTOMATION-2026-10-13.md).
