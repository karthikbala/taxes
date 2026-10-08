# Standalone server validation — 8 October 2026

The user selected future deployment on a Linux server with Nginx/systemd and explicitly excluded ChatGPT Sites hosting. The default installation and entry points now follow that choice. This is code preparation, not an actual production cutover.

## Change and isolation

- Default setup, dev, build and start use a standalone Node server with persistent SQLite.
- Active dependencies are cheerio, pdf-lib and unpdf. Former Worker/framework scaffolding is isolated in legacy/sites-worker; former hosting identifiers and manifest are historical records in docs/history. There is no active .openai hosting declaration.
- AGENTS, README, handoff, architecture and deployment guide explicitly choose self-hosting and prohibit automatic Site publication.
- Existing county engines, matching, source provenance and JSON contracts are reused. v1 lookup now requires the key in the standalone route; its UI sends that key from browser memory. v2 authentication is retained.
- Local setup generates a private .env.local, disables paid source access and creates schema only. The browser reservation code requires an existing approved ledger and cannot recreate a fresh five-dollar allowance.
- SQLite batches preserve atomic cap enforcement, rollback, restart state and idempotent reconciliation. The approved importer preserves settled budget totals and all supplied historical runs, refusing active reservations, replacements, malformed billing and raised limits.
- HTTP limits, safe static assets, request IDs, deadlines and cancellation are covered. SQLite remains available while background source cleanup reconciles after a timeout/disconnect; shutdown allows 150 seconds of grace.
- Undici was patched within major 7 to 7.30.0 after a current runtime dependency audit identified advisories. No runtime API extraction behavior was changed by that patch.

## Verification

- All 192 guarded offline tests passed on the declared minimum Node 22.13.1 after the final runtime/dependency changes. Source/provider traffic stayed blocked; explicit literal-loopback fixtures exercised HTTP bridging.
- Standalone build succeeded with the minimal dependency set.
- Local startup on an available loopback port: /healthz, /poc, /poc.js, /poc-render.mjs and /api/v2/sources returned 200; JavaScript modules had JavaScript MIME type; /.env.local returned 404. Protected readiness returned 401 without a key and 200 with the local key, with managed source access disabled.
- Current npm production dependency audit returned zero findings after the patch. This is a dated dependency check, not an exhaustive security review or a promise about later dependency versions.
- GitHub CI passed for the initial self-host commit 009f888954aba8bb58a21cfdd03cdb1162beb446. The final lockfile/documentation commit requires its own authoritative CI result; use the workflow result for the exact current revision.
- The default port 3000 was occupied by another local app, so the smoke used an available separate port; that other app was not stopped.

No county website, paid browser session, model/provider call, DNS update, new subscription, Cloudflare provisioning or live Site deployment was performed during this migration. Production remains the previously accepted v27 deployment until an authorized server cutover. Provider spending snapshots in older evidence remain historical; no ledger was reset.

## Target-host work still required

The Linux templates were reviewed, but Nginx and Docker were not installed here. The colleague must provision the server, secrets, HTTPS, durable storage and permissions; run nginx -t; validate systemd and restart persistence; import a current drained ledger/history; and perform bounded source-to-JSON acceptance before enabling paid traffic or switching DNS. Docker is optional and requires a target build/smoke check if selected.

Code/source checks do not prove every target IP can access every county. Blocked sources and unavailable sections must remain explicit, with no saved-data fallback. See DEPLOYMENT.md for the chosen route and cutover safeguards.
