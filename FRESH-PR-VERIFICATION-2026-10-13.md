# Fresh consolidated PR verification — 13 October 2026

## Reviewed baseline and scope

Upstream main: `1f476b3897ec74cbe0a3091f005cd71be4307156`. Latest previous PR #7: `7f608b040bc20e7f040aa2cda2d51927a58894cb`. The isolated branch `codex/eleven-county-auto-routing` preserves that newer backend and its production acceptance, and incorporates the reviewed newer common-form work from the separate local checkout. Older local UI must not overwrite the newer automatic Bradford address resolver or recovered Miami/Osceola source policies.

The selector contains **11 counties: ten Florida counties plus Allegheny, Pennsylvania**. This is not eleven Florida counties. No additional county or unverified parcel mode is enabled.

| County | Admitted input |
| --- | --- |
| Allegheny, PA | Parcel |
| Baker, FL | Parcel; collector only |
| Bradford, FL | Address + owner with automatic site/mailing detection, or parcel |
| Columbia, DeSoto, Highlands, Palm Beach, Suwannee, Union, FL | Parcel; Palm Beach optionally accepts the matching collector account |
| Miami-Dade, Osceola, FL | Address + owner; managed recovery where required |

## Changes and regression protections

The common form selects a supported adapter from entered identifiers, without a search-method or address-meaning selector. Explicit parcel input takes precedence only for admitted parcel routes. Irrelevant fields are disabled/hidden. County switches preserve typed address/owner and clear parcel/account identifiers; samples are filled only by Use example, never dispatched automatically. Saved address jobs clear stale parcel state. Exact owner/unit identity, review candidates and detected mailing meaning remain visible. No fixture, statewide-roll or alternative-property fallback is introduced.

## Fresh verification of this consolidated source

- Full external-network-disabled suite: **514 passed, 0 failed, 0 skipped** using Node 24.19.0. Local HTTP integration tests required sandbox loopback permission. The initial sandbox-restricted failures were rerun successfully; they were not ignored.
- Self-host build and `git diff --check`: passed.
- Actual controller checks include authenticated requests/rendering for all nine admitted parcel routes and three address workflows, automatic field requirements, optional accounts, explicit examples, stale jobs, ambiguity selection and mailing detection.
- Chrome inspected the actual isolated candidate at `http://127.0.0.1:18321/poc`: eleven choices, empty initial form, common routing, Miami address-only fields and coverage table. Browser UI checks do not constitute new county-source acceptance.
- Same-day original-source → authenticated API → UI acceptance is **reused dated evidence**, not a fresh paid replay: see [nine direct county samples](docs/POC-VERIFIED-COUNTIES-2026-10-13.md), [four Bradford address cases](docs/BRADFORD-AUTO-ADDRESS-CHECKPOINT-2026-10-13.md), and [Miami/Osceola production acceptance](docs/PRODUCTION-MIAMI-OSCEOLA-RECOVERY-2026-10-13.md). Backend source bytes remain those of the reviewed PR #7 baseline.

## Limits and release handling

Miami and Osceola collector retrieval still needs approved provider entitlement/runtime access; defaults remain guarded and fresh source outages remain explicit. Sample verification does not establish every-property success, complete annual/certificate/deed history or title clearance. No new paid capture, subscription, records request, email, deployment or production configuration change was made for this PR. Existing ledgers, databases and credentials were preserved.

The user explicitly requested a fresh PR and closure of superseded task PRs. PR #6 was already closed; #7 is superseded by this consolidated branch. Earlier #2/#3/#4 are merged history and cannot be removed by closing. Dependency-update PRs are outside this replacement scope. This PR is for review; it does not merge or deploy itself.
