# Optional street suffix review — 12 October 2026

## Outcome

Current staging already supports omitted trailing street suffixes. No implementation change was necessary. For Miami, `1900 N Bayshore, Unit 512` can match the official `1900 N BAYSHORE DR`, unit `512`. Input validation and the portal do not require a separate suffix field.

The matcher keeps number, direction and unit exact. A supplied suffix must agree. Multiple plausible parcels remain ambiguous unless verified owner evidence narrows them to one; incomplete result coverage cannot establish a match. Miami additionally uses the official owner index when the native suffix-free address query returns no candidates, then verifies the detail address and unit.

## Deployment evidence

Read-only SSH inspection confirmed staging current release `besil-20261012-pdf-recovery-v7`. Its Miami, Osceola and Bradford resolver file hashes exactly match this checkout. Baseline HEAD is `024e558037ca3bd973f2744d0677c9e6cba53a00`; existing uncommitted changes were preserved.

- Miami SHA256: `b50b657bc7f7dee9c3cc47ae74b980790e9bb6db1e27aeabfe3c795eb0a08af9`
- Osceola SHA256: `c6ecbde5c5d7099a85353ae88df74815f7a4e21671510811f8f57088b738a026`
- Bradford SHA256: `314ddbd69dcde03bc2aa709e864d62932c9f4d6bf20fe28fcbf6c3d9eea8287f`

## Checks and limits

Reviewed `tests/client-besil-feedback.test.mjs`: existing source-derived cases cover omitted suffix matching, wrong numbers/directions/units, conflicting supplied suffixes, ambiguous candidates, incomplete pages and Miami owner-index fallback/detail verification. Reused the prior v7 offline suite evidence (318 passing tests) documented in `BESIL-MIAMI-PDF-REPAIR-2026-10-12.md`. No tests or paid source requests were run for this review; no provider cost incurred.

The prior live v7 request used the full address with `Dr`; it is not fresh live acceptance for suffix omission. This review confirms deployed implementation support, not every county website's current response. Production deployment was neither inspected nor changed.
