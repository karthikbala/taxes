# Miami Unit 512 delinquency acceptance — 12 October 2026

## Verified result

The missing delinquency output is fixed and freshly verified for Besil's example on staging. This supersedes the earlier credential/ledger blocker for this bounded test; it does not close every Besil requirement or establish complete historical clearance.

- Property: 1900 N Bayshore Dr, Unit 512, Miami, FL 33132-0000.
- Matched collector account / folio: `01-3231-067-0130`.
- Fresh staging API request: `0dbfbb1a-39c9-4f5f-ad48-2aeffdc4c3c8`.
- Fresh Chrome request: `ce05c35a-deac-4883-8407-4b99eb08a933`.
- Active delinquency: true.
- Annual bill year: 2025.
- Current amount due and listed delinquent annual liability: $4,085.87, unpaid.
- Certificate #3299: Issued 06/01/2026, face $3,885.35, rate 0.25%.
- Do not add the certificate face amount to the amount due.

The collector account was independently verified after managed browser recovery. Original source URL, retrieval timestamp, source hash, and field provenance remain in the client JSON.

## Deployed change

Current staging release: `/home/interns/apps/taxes/releases/besil-20261012-staging-recovery-v3`.
Base staging release: `besil-20261010-ecea0e182994`; local Git HEAD remains `024e558037ca3bd973f2744d0677c9e6cba53a00` with uncommitted changes. This was an SSH staging deployment, not a GitHub push or production release.

The user explicitly instructed bypassing the application spending ledger. A new opt-in policy requires both `TAXES_DEPLOYMENT_ENV=staging` and `INVISIA_BROWSER_LEDGER_BYPASS=1`; default and production configurations retain original ledger enforcement. No ledger/history was fabricated, reset or overwritten. The private provider key remains outside source control in the staging environment file with mode 0600.

The override defaults to one capture per application process. Its optional staging limit is clamped to 1–10; it is an operator-controlled diagnostic limit, not a durable dollar cap, and resets on process restart. The default capture is consumed in the current process. An attempted increase to ten captures was rejected by automatic approval review and was NOT applied. Explicit user approval for additional manual-testing captures is pending. Staging health verifies provider entitlement but does not report this process counter.

The browser capture now waits up to 15 seconds for the collector frame and handles direct frame navigation. PDF transfer chunks are smaller and preserve base64 concatenation boundaries. Session creation and billed cleanup are logged without credentials. Automatic cleanup sometimes remained unconfirmed; the two affected owned sessions were explicitly stopped afterward.

## Checks and cost

- Full offline regression suite passed 308 tests after the policy and PDF transfer changes.
- After the final bounded frame-wait adjustment, the focused staging policy, managed-browser and Besil feedback test files passed; build and diff whitespace checks passed.
- Focused policy/cleanup tests also passed on the Linux server before activation.
- Three live captures: first API success (3 credits), intermediate frame-missing failure (2 credits), final Chrome delinquency success (4 credits).
- Provider balance: 991 before → 982 after. All three sessions stopped; provider listed zero active sessions after cleanup. Read-only entitlement checks were separate from captures.

## Retained evidence

- `evidence/besil-delinquency-2026-10-12/api-first-acceptance.json`
- `evidence/besil-delinquency-2026-10-12/staging-chrome-acceptance.json`
- `evidence/besil-delinquency-2026-10-12/staging-delinquency-after.jpg`

## Remaining limits

The original annual PDF transfer still fails during provider chunk requests. Consequently annual PDF sections are unavailable; no substitute PDF values are asserted. The authenticated response correctly remains `partial`.

Delinquency history coverage remains `PARTIAL`: years 2008–2012 are unavailable and independent certificate/deed clearance is not implemented. Unknown total prior-year liability remains null; known prior-year due $0.00 is only a known subtotal and must not be interpreted as complete clearance.

The intermediate failed Chrome request was `19ebe421-e985-4180-8411-cf2f0677a053` (`SOURCE_FRAME_MISSING`). Source access can still fail; the fix preserves explicit unavailable outcomes. No claim covers every property or stable fleet acceptance.

Bradford's affected-property/year example and actual production deployment verification remain separate open requirements. Production was not modified.
