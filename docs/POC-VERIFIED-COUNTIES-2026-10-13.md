# Verified POC county admission — 13 October 2026

Historical nine-county filter snapshot. The later [county-status checkpoint](POC-COUNTY-STATUS-2026-10-13.md) restores the established Miami-Dade and Osceola address workflows with explicit source-access limitations.

The POC now lists only nine workflows with fresh production source and original-document extraction. Annual-roll-only counties, blocked managed-recovery workflows and Polk’s unresolved source contradiction are excluded. Bradford is the default, with address/owner and parcel modes; Baker is collector-only. Other admitted counties use parcel IDs.

## Fresh production acceptance

One sample per county was requested through the authenticated production parcel API with paid recovery disabled. Every sample returned succeeded, parsed originals and no extraction errors. Historical clearance and untested property types remain unproven.

| County | Request ID | Original format |
| --- | --- | --- |
| allegheny-pa | `9afeb92f-67fe-4a5b-9dfb-7e2b36eec347` | PDF |
| baker-fl | `965ca240-e974-48da-8a7c-9b9ba53d78b6` | HTML |
| bradford-fl | `a0e07493-a807-4872-ab82-adb4ef43f065` | HTML |
| columbia-fl | `8fabe6a0-5bf9-462d-aec5-073654268361` | PDF |
| desoto-fl | `bea2b15b-53b5-4873-a935-3887e2f9f454` | HTML |
| highlands-fl | `f4aae895-de3a-4a3e-a725-9117e3820403` | PDF |
| palm-beach-fl | `e3b9b274-0d77-412e-991c-165e863d42bd` | PDF |
| suwannee-fl | `f2756f26-696e-44b3-8f9b-490ad9e10071` | PDF |
| union-fl | `d7b78218-2c63-4813-aa1f-ca21b3e50e70` | HTML |

## Regression checks

Nine controller/workflow checks, 13 rendering checks and 16 HTTP/server checks passed; self-host build passed. The full offline suite also passed 483/483 checks after separating the operational audit catalogue from POC admission. Unsupported source modes are rejected, switches clear stale values, existing Bradford mailing searches and Union physical-site selection remain supported. Saved lookups for removed counties cannot reactivate a hidden workflow.

Admission lives in public/poc-workflows.mjs and applies to the selector, coverage table and request builder. The larger API/source catalogue and operational audit request builder are retained separately. No paid access, spending ledger, crawler, authentication or tax parser was changed. Miami source-access restoration remains a separate outstanding task.
