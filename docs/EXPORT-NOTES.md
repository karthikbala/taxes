# Export and sanitization notes — 8 October 2026

This private repository was exported as a fresh current-source tree with new Git history. The original Sites checkout and its history were preserved; old deployment bundles were not pushed.

Accepted runtime source reference: b184c17c610ebbb055c23beb6b7f025d5f82af3b, Sites v27. The export adds portable local setup, CI and developer/agent documentation. Those development additions do not imply a production deployment.

The bounded audit examined 30 original revisions, 346 tracked files and 475 unique historical blobs. It found no historically tracked hosted POC access-key file, env files, private keys, provider-token patterns or JWT candidates. Binary documents were not exhaustively audited.

Excluded:
- Original Git object/history database.
- Deployment archives, including a historical archive containing two generated prerenderSecret values.
- Build output/cache, dependencies, local execution profile, .wrangler state, credentials and private local access-key files.

Two fixture files were sanitized without changing their extracted property/tax data:
- Three remaining public county nonproduction search API keys were replaced with TEST_ONLY_PUBLIC_KEY in the Miami collector config fixture.
- Two public embedded URL apikey values were replaced in the Volusia accepted appraiser HTML fixture.
- Original/export hashes and counts are in [export-sanitization.json](export-sanitization.json). Original captures remain outside this repository; the sanitized files are fixtures and cannot provide live service credentials.

Source-derived client attachments, public property examples, parser fixtures and selected dated evidence are retained privately for reproducibility. Old evidence is labelled and never used as a runtime fallback.

A fresh clone must run npm ci, setup:local, offline tests and build. GitHub Actions performs offline checks/build only. Live source tests and production publication are separate authorized steps.

