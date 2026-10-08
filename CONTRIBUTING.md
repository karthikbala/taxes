# Contributing

Read AGENTS.md, README.md and docs/DEVELOPMENT-HANDOFF.md before changes. Use a feature branch (codex/ prefix for agent branches), preserve source identity/provenance, and keep one maintainer responsible for shared integration and release.

Use fixtures and the smallest meaningful offline test scope first. npm test blocks unmocked source/provider requests. Record changed behavior, tests and any unverified source coverage in the pull request. Never commit credentials, local databases, deployment bundles or paid-capture request headers.

Live/paid evaluation needs explicit scope and current budget authorization. GitHub CI does not deploy. Coordinate production changes through the existing Site maintainer and docs/DEPLOYMENT.md. Keep accepted source proof distinct from configured adapters, successful HTTP responses or job status.
