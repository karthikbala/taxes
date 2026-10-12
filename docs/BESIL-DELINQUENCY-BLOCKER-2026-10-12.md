# Miami Unit 512 staging checkpoint — 12 October 2026

## Outcome

Besil's delinquency requirement remains unaccepted on staging. Do not send a resolution confirmation or present saved amounts as a current collector balance.

Target: `https://taxes-staging.37-27-51-7.nip.io/poc`.
Property: 1900 N Bayshore Dr, Unit 512, Miami, FL 33132-0000.
Matched folio: `01-3231-067-0130`.

## Deployment and authentication

The running release is `/home/interns/apps/taxes/releases/besil-20261010-ecea0e182994`. Nginx's enabled `taxes-staging` configuration proxies the staging hostname to `127.0.0.1:3000`. The active `taxes-staging.service` loads `/home/interns/.config/taxes/staging.env`.

The actual running process's POC key was privately loaded into the requested Chrome form. Authenticated `/api/v2/health` returned HTTP 200 both directly and through public HTTPS. Its managed-source result was `ready: false, reason: not_configured`. No keys are recorded here.

## Failure evidence

The completed Chrome lookup `f548a881-6bfa-4aca-9017-7f5a78009abb`, collected at `2026-10-12T04:22:51.405Z`, matched the requested unit and owners. The collector identity request returned HTTP 403. Delinquency coverage is `UNAVAILABLE`, with unknown amounts and no negative clearance conclusion.

The private staging configuration has no `INVISIA_BROWSER_API_KEY`. Read-only inspection of staging SQLite found zero budget rows and zero historical browser runs. No original ledger backup was present in the inspected Taxes admin directory. Direct HTTP and ordinary server-browser diagnosis had already failed to retrieve the collector record; do not repeat unchanged requests as a fix.

## Reused and refreshed validation

The source-derived before/after replay in `evidence/manager-uat-2026-10-10/offline-parser-replay.json` demonstrates the implemented parsing correction: the saved 2025 record exposes $4,085.87 due and issued certificate #3299. Its $3,885.35 face amount must not be added to the balance. This is dated, partial source evidence, not today's payable quote.

On 12 October, `node --test tests/client-besil-feedback.test.mjs` passed with the bundled Node runtime. No application code or server configuration was changed during this checkpoint. No paid source work was dispatched and no allowance was created or reset.

## Required continuation

1. The deployment owner must securely provision the existing managed-source credential and export the original `florida-phase1-2026-10-07` ledger with historical `browser_runs`.
2. Reconcile current source spending and outstanding reservations, coordinate source/target spending ownership, back up SQLite, and use the existing reviewed importer. Never substitute an empty run history or synthesize a fresh allowance.
3. Verify entitlement and current authorized budget before enabling recovery. Define one bounded exact-property acceptance attempt and cost ceiling; retain fail-closed identity, year and document checks.
4. Retrieve fresh collector history for this folio, verify its annual bill year and active certificate, then prove source → parser → authenticated API → Chrome with retained JSON and screenshots. Only then mark the live requirement resolved.

The owner-provisioning question is pending in the chat. The Bradford affected-property example and production deployment verification are separate unresolved acceptance items.

## Credential provisioning follow-up

The user subsequently supplied the managed-source credential and authorized staging setup. It was written atomically to the private staging environment file with mode `0600`; no credential value is included in this checkpoint. The provider's read-only entitlement endpoint returned HTTP 200 and reported 991 remaining credits. This provider balance is not the application's authorized dollar ledger.

The staging service was restarted and its running process confirmed the credential is loaded. Public authenticated health returned HTTP 200. Recovery remains explicitly disabled because the original ledger and historical runs are still absent. No paid capture, new allowance, source balance claim or production deployment was performed. A request for the original production ledger export remains pending.

After the user authorized proceeding with the recommended approach, a read-only Sites database-overview request for the recorded production project returned `project_not_found` (404). The connected account therefore still cannot obtain the original ledger. `EXPORT-EXISTING-SOURCE-BUDGET.sql` provides the two read-only queries for the deployment owner. Access or an owner export remains necessary; the provider key alone does not restore the missing application ledger.
