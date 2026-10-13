# POC county visibility and live status — 13 October 2026

The user identified that Miami-Dade and Osceola, already demonstrated to Besil, were missing. A nine-county sample-verification allowlist had hidden those established address workflows along with unsupported parcel/roll entries. Hiding temporary source limitations made supported features appear removed. The correction preserves explicitly enabled address contracts and states their current source limitations; it does not promote their full retrieval to verified.

## Fresh production check

Production preflight loaded revision `c0483631d3475ce25ccb52f2c0bce85c0947b439`, separate protected service/database, paid/local-browser recovery disabled, zero active durable jobs, zero browser runs and no spending-ledger rows. Hypothesis: the nine listed sample workflows still retrieve their expected source identity and parsed document under the current runtime. Bound: one direct-only request per listed sample, maximum two concurrent API calls, zero paid calls. No annual-roll fallback.

Checks at **18:28–18:29 IST** returned eight fully successful samples and one partial Highlands result. Highlands tax/PDF retrieval succeeded, but the appraiser failed because the new production environment omitted NODE_EXTRA_CA_CERTS. The prior reviewed county intermediate-chain setting was restored through a root-owned bundle outside interns paths. Its signatures, existing-root anchoring, CA constraints and validity passed offline verification; TLS checking was never disabled. One follow-up Highlands request returned succeeded with assessment, taxes and parsed original PDF, zero errors. Reuse the eight successful results because neither their code nor configuration changed apart from adding that reviewed public chain.

| County | Verified method | Fresh request ID |
| --- | --- | --- |
| Allegheny, Pennsylvania | Parcel assessment/taxes + original PDF | `c1dc9dcb-6f6c-4c6c-91f3-6a7ffdf1e13e` |
| Baker, Florida | Parcel collector taxes + original HTML; assessment not requested | `c45e73fe-e558-4785-ab11-415a152653e5` |
| Bradford, Florida | Parcel assessment/taxes + original HTML | `a9292c5e-43a6-4f3e-9a13-c0a68a19083d` |
| Columbia, Florida | Parcel assessment/taxes + original PDF | `efe4c6ac-6183-43db-9132-0b511f24b863` |
| DeSoto, Florida | Parcel assessment/taxes + original HTML | `9ce93219-0518-44f6-9cf0-e30cd14aaf65` |
| Highlands, Florida | Parcel assessment/taxes + original PDF, after TLS configuration repair | `70bc1479-dae8-4525-93a9-cf27d4998daa` |
| Palm Beach, Florida | Parcel assessment/taxes + original assessment PDF (not a collector bill PDF) | `71e5ada7-7572-45dd-80ef-ffe6f732766e` |
| Suwannee, Florida | Parcel assessment/taxes + original PDF | `fedd41f2-ad76-4add-9625-530beb30a8f2` |
| Union, Florida | Parcel assessment/taxes + original HTML | `304bee15-af1e-4d43-b4a4-13ddeb506c12` |

All nine latest samples returned succeeded, a parsed original, tax data and no extraction errors; expected parcel/document identity and published reconciliation checks passed. Eight are Florida counties; Allegheny is in Pennsylvania. This is sample verification, not all-property acceptance, universal address search or full historical clearance. Bradford's four independent fresh address/owner cases remain recorded in the [automatic-address checkpoint](BRADFORD-AUTO-ADDRESS-CHECKPOINT-2026-10-13.md).

## The two established address workflows

Miami-Dade and Osceola adapters were never deleted. They are restored to the selector using their enabled address-contract metadata, with generic source-access-limited labels in the selector, workflow note and coverage table. They retain address/owner input and explicit partial/blocked results; unverified county parcel modes and annual rolls are not silently enabled. Existing saved jobs become accessible again. No county-specific address-mode control is added.

Latest retained full source checks from earlier today:

- Miami-Dade: `5e109efa-0df2-49af-8f83-79f8dc22cd2c`, 17:26:55 IST. Assessment retrieved; collector source_blocked; original bill dependency failed. Besil's exact 20 NE 10 ST result also independently matched the property but was collector-blocked. These are dated checks, not a new successful delinquency claim.
- Osceola: `ff2b98a9-56aa-4b7d-a7a5-84081135ddcb`, 17:26:56 IST. Appraiser and collector source_blocked; original document dependency failed. Yesterday's accepted `3250 VINELAND RD` lookup used managed-browser recovery. Current production has recovery disabled, and the original authorized spending ledger is absent. A prior successful recovery does not establish current delivery.

No repeated paid/blocked-source evaluation was launched for these two counties. Restoring visibility is distinct from repairing source access. The original ledger and approved recovery capability must be available and reconciled before paid recovery can be enabled; no budget was created/reset and no bypass was enabled.

## Engineering and operational evidence

The UI change is capability-driven: all explicitly enabled address contracts remain visible, with source availability separated from sample verification. Focused workflow/controller, rendering, HTTP, API-audit and Baker checks passed **53/53**; build passed. TLS-chain check passed **1/1**. A new regression asserts that both established counties remain selectable, their limits are displayed, county switching launches no source calls and unverified parcel modes remain rejected. Production deployment and actual browser checks are recorded in private receipts under outputs/poc-county-status-2026-10-13. Source adapters/parsers are unchanged.

Production remains taxes.zeneral.ai; interns staging remains the nip.io hostname with separate service/database and no permission to modify production. New paid usage is **zero calls / $0**. Preserve source timestamps, full JSON, the initial Highlands failure and its corrected result; do not rewrite the failed check as an initial pass. The prior nine-county admission note is historical and superseded by this visibility policy.

## Activated visibility release

Production loaded `8fe086617be610a6472d2e49a00ba122b2721d08`, release `county-visibility-20261013-8fe086617be6`, PID 115843, at 18:40 IST. All adapters/server bytes match the source revision used for fresh sample verification; the reviewed TLS setting remains loaded. The server passed 53 focused checks and build before activation. Public assets match the release. Actual browser verification confirmed all eleven choices, the Miami-Dade and Osceola limitation labels/notes, and no address-mode control. County selection did not initiate source retrieval. Final preflight had zero active jobs, unresolved sessions or paid runs, and a consistent SQLite snapshot passed quick_check. Besil’s unsent draft was corrected to say the established workflows remain visible with source limitations.
