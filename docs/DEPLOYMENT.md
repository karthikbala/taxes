# Self-hosting and colleague setup

The user selected a Linux server with Nginx/systemd for the future deployment. GitHub is the primary source of truth. The standalone Node 22 runtime requires no ChatGPT Sites hosting, Sites editor account or Cloudflare execution environment. This guide prepares deployment; it does not authorize provisioning, live cutover, account changes or DNS changes.

## Colleague prerequisites

The owner must grant the colleague access to the private `karthikbala/taxes` GitHub repository, authorized SSH access to the selected server, and DNS permissions when cutover is approved. Assign one maintainer to integrate and release shared changes. Share runtime keys through approved private secret storage; never send them through source files, tickets or logs. The existing hosted POC key must be securely preserved or separately rotated with authorization.

Install Node **22.13 or newer in the Node 22 line**, npm, Nginx and HTTPS certificate tooling on the selected Linux host. Use a dedicated unprivileged `taxes` service user, private environment file, durable database directory and protected backups. The default route is Nginx + systemd; Docker is an optional alternative below.

## Local setup without cloud access

From a fresh clone:

```sh
npm ci
npm run setup:local
npm test
npm run build
npm start
```

Setup creates a random local POC key in private `.env.local` and initializes local SQLite schema. It does not create a paid budget or grant provider access. The Node server loads `.env.local`; default host/port are `127.0.0.1:3000`. Use the generated key in the local POC form. Offline tests/builds need no provider credentials. Fixtures remain test evidence and are never production fallback records.

| Variable | Purpose | Default / policy |
| --- | --- | --- |
| `HOST` | Node listener address | `127.0.0.1`; container requires `0.0.0.0` |
| `PORT` | Node listener port | `3000` |
| `TAXES_DB_PATH` | Durable SQLite file | `./runtime/taxes.sqlite` locally; `/var/lib/taxes/taxes.sqlite` for systemd |
| `INVISIA_POC_API_KEY` | Authenticates v2 API requests | Random local key; production key from approved secret storage |
| `INVISIA_BROWSER_ENABLED` | Allows managed source access | `0` by default |
| `INVISIA_BROWSER_API_KEY` | Existing managed source credential | Absent unless approved entitlement and budget are verified |

The runtime exposes SQLite through the application database interface. Keep one application instance until a shared database is deliberately implemented. The database, journals and backups must live on durable storage with write access for the service user.

## Linux installation and systemd

After target-server deployment is authorized, place the reviewed checkout at `/opt/taxes`, record the exact Git commit and install/build with `npm ci` and `npm run build`. Create `/var/lib/taxes` owned by the service user. Do not run local setup on a production ledger or use a newly generated local key as the production secret.

Create `/etc/taxes/taxes.env` with mode `0600`, owned by root. Obtain the production key through approved secret storage and add these values privately:

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
TAXES_DB_PATH=/var/lib/taxes/taxes.sqlite
INVISIA_POC_API_KEY=<securely provisioned production key>
INVISIA_BROWSER_ENABLED=0
```

The placeholder is not a usable key. `/etc/taxes/taxes.env` uses systemd EnvironmentFile syntax. A privately provisioned `.env.local` in the checkout is an alternative, but keep secrets outside releases where possible. Do not put secrets in shell history.

Copy [the service template](../deploy/taxes.service) to `/etc/systemd/system/taxes.service`. It assumes Node at `/usr/bin/node`; adjust `ExecStart` to the verified system Node path if needed. Verify the service user, paths, environment file and imported schema before starting. Once ready:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now taxes
sudo systemctl status taxes
sudo journalctl -u taxes --since today
```

The service runs the Node entry point directly and writes only its durable state directory under the supplied hardening configuration. Inspect safe structured logs; do not add credentials or extracted personal/property values to log output.

## Reverse proxy and HTTPS

[The Nginx template](../deploy/nginx.conf) forwards to the loopback Node server, bounds request bodies to 16 KiB and allows 150 seconds for source responses. It includes a request rate limit and assumes an HTTPS certificate at the indicated paths. Obtain a valid certificate using the operator's approved method before enabling this template. Adapt host/certificate paths for a staging domain as needed, run `nginx -t`, then reload Nginx.

Public use requires valid HTTPS, appropriate firewall rules and DNS pointing at the authorized server. Cloudflare may remain the DNS provider. Change its record only when the owner explicitly authorizes cutover; this setup requires no new Cloudflare Worker or Sites application. A proxy timeout alone does not establish source success; use authenticated API acceptance for changed county behavior.

## Optional Docker deployment

[The Dockerfile](../deploy/Dockerfile) builds the Node runtime. [The compose template](../deploy/compose.yaml) publishes only `127.0.0.1:3000` on the host for Nginx and mounts a durable database directory. It sets `HOST=0.0.0.0` inside the container so the published port works. One container is the supported SQLite topology.

Privately provision `/etc/taxes/taxes.env` first; Compose reads it outside the build context. Create `/var/lib/taxes` writable by the container's unprivileged Node user (UID 1000 for the supplied image), and import/verify the database before enabling managed access. Do not mount secrets into the image or bake them into a build layer. Confirm the host port is free if a systemd installation already exists.

```sh
docker compose -f deploy/compose.yaml build
docker compose -f deploy/compose.yaml up -d
docker compose -f deploy/compose.yaml logs --tail 100 app
```

Use the same Nginx/HTTPS setup. The Docker route requires its own build and smoke verification on the target host before release.

## Preserve the paid ledger before cutover

The legacy ledger ID is `florida-phase1-2026-10-07`. Its accepted milestone snapshot was **$5 approved, $1.48 spent, $0 reserved**; these figures are dated, not current authority. The production D1 ledger and every reservation/run record must be preserved. A zero-spend local database is not a migrated production database.

Before migration, inspect queued/running paid work and drain it without interrupting another maintainer's canary. Pause new paid work at the old deployment for cutover, take a consistent D1 backup/export, import its schema/data into the durable SQLite target, and reconcile ledger IDs, limits, spent/reserved values and run/reservation states. Back up both the source export and destination; record reconciliation evidence. Resolve outstanding reservations explicitly. Do not reset spend, mint a new $5 allowance or raise a cap.

Keep `INVISIA_BROWSER_ENABLED=0` until existing provider entitlement, secure credentials, compatible runtime support, current ledger availability and the requested live-testing scope are verified. Full challenged-source testing requires explicit current budget authorization; setup, CI and health checks never authorize it.

## Future release and rollback

Record the Git commit, selected offline checks and build result before a release. Check/drain paid activity before worker/source changes. Back up SQLite consistently with the application stopped or a reviewed SQLite backup method; copying only a live main database file can omit journal state. Preserve the prior release and database backup.

After starting the reviewed target, verify UI/assets, authentication rejection/acceptance, readiness and the loaded process/release identity. If county behavior changed, verify exact source identity/year → parsed record → JSON → rendered UI within the separately authorized sample/budget. Health and capability responses alone are not extraction proof. The currently documented runtime has no automatic claim that a GitHub push deployed it.

Perform DNS/traffic cutover only after explicit authorization and verified target acceptance. Ensure only one deployment initiates paid activity against the migrated ledger. Rollback must stop target paid work and reconcile any newly incurred spending before restoring the former runtime; never restore an older ledger snapshot that discards spend. Save a dated checkpoint with real release, usage and acceptance evidence.

## Historical deployment retained

The accepted 8 October 2026 POC snapshot was `https://taxes.zeneral.ai/poc`, source revision `b184c17c610ebbb055c23beb6b7f025d5f82af3b`, saved v27 (`appgver_105267febd30819180ec4b590e93f1a2`), deployment `appgdep_6ac758a79b988191894c7814daf30bd6`, environment revision 2, on the existing Sites/Cloudflare Worker with D1. `docs/history/cloudflare-sites-v27.json` is retained as legacy deployment configuration. See [the handoff](DEVELOPMENT-HANDOFF.md) for source/API acceptance evidence.

Those facts do not establish today's loaded revision. This self-host preparation makes no live deployment or DNS changes. Removing the original Mac checkout does not stop that cloud application; first preserve the hosted key, repository/evidence and required backups. Colleagues using the future Node route need GitHub/server access, not a Sites editor account.
