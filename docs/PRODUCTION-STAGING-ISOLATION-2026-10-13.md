# Production and interns staging — 13 October 2026

The user designated `taxes.zeneral.ai` as production and the nip.io domain as interns staging. They run separate Node services, operating-system identities and SQLite databases on the same host. DNS and certificates are unchanged.

| Environment | URL | Service owner | Service / loopback port |
| --- | --- | --- | --- |
| Production | https://taxes.zeneral.ai/poc | Dedicated `taxes-public` system account; root controls releases | `taxes-public.service` / 3002 |
| Interns staging | https://taxes-staging.37-27-51-7.nip.io/poc | `interns` | User `taxes-staging-isolated.service` / 3001 |

Production code and its Node runtime live under `/opt/taxes-public`, outside the interns-owned checkout. Root owns the release files and system service; the runtime account has a non-login shell. Production uses its own durable SQLite directory under `/var/lib/taxes-public`. A consistent snapshot preserved existing public jobs, artifacts and spending history at separation. The existing POC access key was preserved. No paid ledger was created or reset; managed recovery remains disabled because the original ledger is unavailable.

The interns account has no sudo or Docker group membership. Access checks reject modifying the production release, parent directories, Nginx vhost or system unit, and reading the production environment, database or process environment. Interns can continue deploying their own staging user service without changing production's code, environment or database. An API access key remains an application-client credential, separate from OS deployment authority.

Production releases require the authorized root operator: prepare an immutable reviewed Git revision, run offline tests/build, check active jobs and provider reconciliation, take a consistent database backup, update the production system service and verify authenticated source → JSON → UI acceptance. Check the loaded process directory and `TAXES_SOURCE_REVISION`; environment labels and health responses do not establish county acceptance. Retain the current database on code rollback so later jobs/spending are preserved.

The dedicated production unit uses the repository's systemd hardening: `ProtectHome`, `ProtectSystem=strict`, `PrivateTmp`, `NoNewPrivileges`, and write access confined to its own durable state directory. Operator receipts and consistent snapshots are stored privately on the server. New production state needs inclusion in any future scheduled backup verification; the older interns database alone is not production's recovery point.
