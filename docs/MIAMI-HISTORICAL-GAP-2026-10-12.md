# Miami historical coverage investigation — 12 October 2026

## Outcome

**Not fully resolved.** The missing annual records are explicitly withheld by the collector's public site. No verified public source providing the complete independent certificate history was found. No runtime source data was replaced or warning removed, and no code/deployment change was made for this investigation.

Property: **1900 N Bayshore Dr, Unit 512**, Miami 33132-0000; folio **01-3231-067-0130**.

## Evidence and cause

- The previously captured collector account contains five explicit unavailable rows for **2008–2012**, each directing users to call the Tax Collector. Each row has no bill/PDF action link. This is a source restriction, not a parser dropping returned bills. See [captured source](evidence/discountable-public-2026-10-12/miami-account.html), lines 1821–1916. This capture is dated evidence, not a new live collector retrieval.
- A fresh browser inspection of [Miami-Dade LienHub](https://lienhub.com/county/miamidade) showed public county-held sale inventory and a holder portfolio. Searching the formatted folio in county-held inventory displayed no matching records. That inventory does **not** include a proven all-holder historical scope, so its empty result cannot establish complete certificate coverage or cancel the known active certificate. The initial digits-only search was also empty; the formatted-folio search was used for the retained evidence.
- The portfolio link led to a login requirement. LienHub describes this as the status of a holder's own certificates, applications and redemption payments. An ordinary holder login has not been established as a complete parcel-history source.
- The public auction landing page exposed the next-sale announcement and advertised list, not a verified complete historical-status export. An advertised delinquent list cannot establish later redemption or clearance.
- The [Tax Collector's public-records page](https://www.mdctaxcollector.gov/public-records-request) identifies **pr@mdctaxcollector.gov**, telephone **305-375-5448**, as the official records-request route. The email was verified in the rendered browser page.

The earlier fresh staging acceptance remains the evidence for successful PDF retrieval and independent Clerk empty search: [previous acceptance checkpoint](BESIL-PDF-HISTORICAL-SEARCH-2026-10-12.md), request `4e7ea89d-9171-477f-bbeb-906cc46553f5`, collected `2026-10-12T06:01:28.023Z`. It reported an active 2025 certificate, number 3299, with a $4,085.87 redemption quote payable if received by October 30, 2026. These are earlier verified values, not re-fetched in this investigation. Even complete historical coverage would not mean this active delinquency is paid or cleared.

## Concrete next step

[Ready-to-send collector records request](MIAMI-HISTORICAL-RECORDS-REQUEST-2026-10-12.txt) asks for the five annual records, all-holder certificate history, status dates, redemption details, any predecessor account, and explicit scope/as-of date. It also asks for the current certificate quote and requires notice before fees. **The request has not been sent.** Outbound email needs the user's authorization.

A complete authoritative record/export or a verified official query exposing the same scope is needed before an adapter can truthfully close these gaps. A one-off record response would be dated evidence for this parcel, not a fresh runtime fallback for future lookups. Recurring extraction would additionally need an authorized, repeatable source path with exact folio/year matching, complete bounded traversal and provenance. Missing records must remain unknown until supported. Certificate and deed coverage must be evaluated separately from whether a liability is active.

## Revision, deployment and verification

- Checkout baseline: `024e558037ca3bd973f2744d0677c9e6cba53a00`, branch main; existing implementation and unrelated edits preserved.
- Read-only SSH check: `/home/interns/apps/taxes/current` resolves to `besil-20261012-discountable-public-v10`; `taxes-staging.service` is active. No restart or deployment occurred.
- Changes this investigation: documentation and source-research evidence only. Verification: reviewed saved collector markup, live public portal scope/search/login, official custodian contact and request wording. No application tests rerun because application code was unchanged.
- Managed-browser API calls/paid captures: **zero**. No spending-ledger or credential changes.
- [County-held portal observation](evidence/historical-gap-2026-10-12/county-held-search.txt) and [screenshot](evidence/historical-gap-2026-10-12/county-held-search.png). This is manually inspected research evidence, not client runtime extraction or proof of full certificate clearance.

## Acceptance still required

1. Authoritative records for every missing annual year, or explicit official no-record/inapplicability statements with matching parcel/account scope.
2. Independent certificate history covering all holders, all relevant years and terminal/active statuses, with an explicit complete scope and date.
3. A repeatable verified source adapter, source-derived failure tests and fresh authenticated staging JSON/UI acceptance if runtime automation is to claim that coverage.
4. Never equate complete history with no delinquency: current active certificates remain active until the source supplies their redemption/closure.
