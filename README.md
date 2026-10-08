# taxes — Zeneral property-tax extraction POC

Private development repository for https://taxes.zeneral.ai. The app joins county Property Appraiser and Tax Collector records and produces source-backed JSON. Runtime extraction is deterministic code; no LLM is called during lookups.

## Start here

- [Agent instructions](AGENTS.md)
- [Development status and next counties](docs/DEVELOPMENT-HANDOFF.md)
- [Architecture and source adapters](docs/ARCHITECTURE.md)
- [Hosting, credentials and team handoff](docs/DEPLOYMENT.md)
- [Dated live source evidence](docs/evidence/README.md)

Three richer v2 workflows are enabled: Miami-Dade, Osceola and Bradford. They are verified with explicit partial coverage. Twenty legacy parcel workflows are configured; the other seventeen have not passed the richer client contract. The 67-county registry is research coverage, not 67 working crawlers.

## Local setup

Install Git and Node.js 22 LTS (minimum 22.13). No Codex installation, Cloudflare login or provider subscription is needed for local setup.

```sh
git clone https://github.com/karthikbala/taxes.git
cd taxes
npm ci
npm run setup:local
npm test
npm run dev
```

Open the URL printed by the dev server (normally http://127.0.0.1:5173/poc).

The setup creates an ignored, mode-0600 `.dev.vars` containing a random local POC key and sets paid browser access off. It applies tracked migrations to a **local** D1 database in ignored `.wrangler/state`. It never initializes or resets production spending.

Read the local `INVISIA_POC_API_KEY` value in your editor/password manager and paste it into the local POC form. This key is different from the hosted site's key. It is never committed or printed by setup. Do not replace `.dev.vars` with production credentials for routine offline development.

```sh
npm run db:setup    # Apply new local migrations
npm run build      # Build production bundle locally
npm start          # Serve the built bundle locally
```

Use the origin printed by npm start; its port may differ from npm run dev. Neither command deploys production.

## API

`POST /api/v2/property/lookup` requires an Authorization Bearer POC key. `GET /api/v2/sources` lists county capabilities. `GET /api/v2/health` is protected and reports readiness/preflight; it does not prove extraction or identify the deployed revision. `/live` and `/api/v1/property/lookup` retain the older parcel interface.

```sh
curl -X POST 'https://taxes.zeneral.ai/api/v2/property/lookup' \
  -H "Authorization: Bearer $POC_ACCESS_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"scrap_order_id":"10000001","address":"555 NE 15 ST UNIT 401","ownerName":"JUDE PATRICK JACOB","county":"miami-dade-fl","transactionType":"REFI","state":"FL"}'
```

For local requests use your printed local server origin and local key. `10000001` is the client's dummy business order ID; every call has an independent generated request ID. REFI/PURCHASE are client-specified pass-through transaction labels.

Selecting a county fills its sample address/owner. Miami's example comes from the client; Osceola and Bradford were selected public-property examples.

## Tests and CI

`npm test` discovers all `tests/**/*.test.mjs` and blocks unmocked fetch/HTTP traffic. The fixtures include source-derived identity, matching, table, history and negative cases. Tests do not call providers or source sites. GitHub Actions runs npm ci, offline tests and build on Node 22; it does **not** deploy or hold production secrets.

Local live lookup is separate from offline testing. Direct native APIs may respond from your laptop, but challenged collector pages need separately authorized managed browser access and an approved budget. With the provider disabled, the app returns explicit unavailable/blocked sections; it never substitutes saved samples.

## Production and teammate access

GitHub is the canonical development/handoff repository. **A GitHub push does not automatically update taxes.zeneral.ai.** Production remains the existing Sites/Cloudflare Worker and D1 project. See [deployment instructions](docs/DEPLOYMENT.md) before publishing.

A colleague needs private GitHub collaborator access. For production changes they also need editor access to the existing Sites project and secure access to the appropriate runtime credential administration. Production credentials and the existing D1 ledger remain in the cloud when this Mac checkout is deleted.

Before deleting local files, copy the existing hosted POC access key to an approved password manager and arrange team access. Do not put keys, dev.vars, deployment archives, logs containing headers or local database state in Git.

## Repository provenance

This repository starts with a clean source snapshot of the accepted deployed code plus portable setup, CI and handoff documentation. Original operational deployment archives and old Git history were intentionally excluded. [Export and sanitization notes](docs/EXPORT-NOTES.md) record fixture changes and deployment provenance. Original runtime source revision: b184c17c610ebbb055c23beb6b7f025d5f82af3b (v27, 8 October 2026).

This application is independent of PortTrack and must not import its credentials, recipes or deployment configuration.

