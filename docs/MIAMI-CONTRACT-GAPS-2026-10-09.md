# Miami client contract fixes — 9 October 2026

Requested scope: close the audited Miami mapping/parser gaps and investigate independent certificate/deed sources. Work began 8 October 23:55 IST; default first milestone 60 minutes, checkpoint30. Taxes remains isolated from PortTrack.

## Implemented

- Canonical certificateNumber/interestRate with original source object retained in normalization provenance.
- Payment/event dates normalized to MM/DD/YYYY; unsupported dates remain null with raw evidence and warning; printed schedule labels retained.
- Printed discountable subtotal extraction where available. Both original Miami bills lack that field/eligibility evidence: preserve null with field provenance and visible section note, not copied totalTax.
- Monetary reconciliation within $0.05, millage compared at printed precision, per-authority tax calculation check. Source amounts unchanged; discrepancies yield explicit partial outcome.
- Same-year authority comparison now precedes appraiser-derived exemption enrichment; mismatch/unavailable values withhold the derived field.
- Explicit assessment roll status/scope: no source certification label means Status null; ownerOccupied remains null unless authoritative source reports it.
- Visible source validation/reconciliation panel, missing-section companion notes and certificate/deed coverage details. Root status/ExtractionMetadata are additive; client business status remains new.

## Source-access investigation

Official Tax Collector pages link certificate/deed application tools and the Clerk's public record tools. Native public Clerk cases page https://miamidade.realtdm.com/public/cases/List returned403 in IAB. County application instructions link LienHub but application submission is not public clearance evidence. Clerk official landing fetched200; public case access must be separately proven.

User explicitly requested Firecrawl/Scrape.do tests under existing $5 combined cap. Firecrawl is configured in Taxes hosting; Scrape.do has no project credential configured. A fixed, Bearer-protected diagnostic route /api/v2/diagnostics/miami-tax-deed accepts only {} and uses existing entitlement check, reservation, deadline/cancellation, cleanup and ledger. It returns BLOCKED/LOGIN_REQUIRED/FAILED/DISCOVERY_ONLY, never parcel/case/clearance proof from discovery. Caller URLs/code are rejected. No generic URL scraper added.

## Validation/release checkpoint

64 initial focused checks passed; final changed caller/UI checks13, then final UI7. Additional fixed-target/auth/shared-ledger/cancellation checks8 passed. Both hosted and standalone builds passed. Tests are offline/mock evidence, not new source acceptance. Final revision, CI, deployment, live request and spend receipts are appended after bounded tests.

## Remaining source limits

Full historical certificate/deed clearance and unpublished years cannot be asserted from published annual bill rows. Current source PDFs do not establish totalDiscountable; null remains explicit. These limits must not be concealed by replacing values from the client fixture. Scanned OCR, arbitrary county expansion and a broad title search are not part of this release.

## Live checkpoint 9 October 00:43 IST

- v30 deployed source8fda53e687fedc1eed7b8b6715077cd468692e23; deployment appgdep_6ac7e3d246648191bb51327540d45359.
- v31 sourcee9b4f83abe5d5b64978fd71d5718e53bb4c2b4c1; deployment appgdep_6ac7e97e0b5c8191b4fbf24ac2e4736c, environment2.
- First Firecrawl source probe failed in execution runtime: TextEncoder is not defined. This was probe compatibility failure, not a county-access conclusion. Request ray a4776d89aff92447; browser lease38b7b280-023a-4d1d-9a0b-6b046e29c2d1. Paid actual2credits, conservatively priced$0.04; total ledger$1.84, reserved0, remaining$3.16.
- Corrected emitted code uses plain JavaScript UTF-8 byte counting. Four restricted-VM regressions pass without injected TextEncoder/Buffer. Corrected hosted build passed; final publication/source proof pending below.
- Scrape.do credential-only exception from PortTrack is pending explicit owner authorization due Taxes AGENTS isolation rule; no credential was read/imported and no Scrape.do test performed.

## Accepted live client lookup and source continuation

- GitHub246d08d3b4239a8a192a2f261a30271517d48713: CI37830992044 succeeded, 221 offline tests plus selfhost build. Prior CI caught a stale one-module assertion; updated it to verify both POC browser modules and MIME types, focused server15 passed.
- v32 source7fbf87cbd3695d6be06cc2fc24a7fcb355cad7ae; deployment appgdep_6ac7ecb8ff2881918f72fdd7386b8359 succeeded, environment2.
- Fresh Miami request cef45f59-3e8a-4590-9d96-291308951e9f: matched folio01-3231-052-0010, 14 authority rows, $3,132.45 combined, $3,007.15 payment, receiptEEX-26-000928, 11/25/2025. All14 authority calculations and authority/year taxable comparisons matched; errors[]. Printed totals independent comparison unavailable in this retrieved layout; never represented as passed.
- Current original bill mailingAddress is null although appraiser mailingAddress is populated. This is an unresolved bill-header extraction/source-layout limit; no appraiser address was copied into the bill field.
- Corrected Firecrawl entry probe3de7d513-2454-45c1-8994-73d46a1f87d9 reached Clerk public cases page200 and discovered exact parcel search field/filter controls. Discovery does not prove record/case/clearance.
- User subsequently requested service testing and approved one shared-company Scrape.do credential exception. Credential stays in worker environment; no token persisted/copied into Taxes or logs/Git; no PortTrack code/data/deployment changed.
- v33 source0d1537e9f579e4aea09ee92e50926ad23de9449a; deployment appgdep_6ac7f3d1bc3481919e1330b91082aaf2 succeeded. Optional exact folio search uses discovered field/button once and returns unverified tables/pagination. Fixed external allowance debit precedes the one external request; no source URL/code/cost override accepted.
- Exact Firecrawl folio HTTP request timed out at caller; no response body retained. Ledger reconciled and reserved0. This is not a no-case/no-debt result. No blind replay.
- External allowance d40c598b-64da-4de1-b71a-29c0bfd9b8a5 conservatively charged$0.08 before dispatch. Ledger snapshot$2.04 spent,0 reserved,$2.96 remaining; includes conservative allowance, not vendor invoice proof.
- Source continuation was explicitly requested after the JSON milestone; a20-minute parcel-search target overran during safe budget/credential integration. Close after the authorized bounded tests; do not widen provider/county trials.

## Final corrections and service evidence

- Scrape.do current account active, five concurrent slots,48 monthly credits available. Initial100-credit guard did not dispatch. Official request-cost documentation verifies basic rendering5 credits (residential rendering25); one authorized render then returned200,26,939bytes, authoritative Scrape.do-Request-Cost5 and remaining43. Token stayed in worker environment; only sanitized public portal summary copied into Taxes. No exact parcel/case result or historical clearance claimed from this entry page.
- Mailing-address root cause independently reproduced in the client PDF: Mailing Address and Property Address headings share one horizontal row. The former guard treated any text to the right as inline remittance text, discarding the taxpayer block. Restricted the guard to the same column; source-derived Miami positive and Osceola remittance negative controls pass.21 focused checks passed. No appraiser address substituted.
- Final hosted v34 sourcebbb72257ccf8861c73069dfe93c9bdd81f318459; saved version appgprj_6ac53842fb58819195dbc8435c4116e9~appgver_ddd960def5bc81918472f69fcadeb4d2; deployment appgdep_6ac7f9eec6d8819196833f794f07cfda succeeded, environment2. Fresh final mailing lookup pending below.
- GitHub057da537e8aa1189d52fd7b24ee398166289f312 CI37836109567 succeeded for source-test lane. Latest mailing-source code requires final CI after this commit; do not count earlier CI as that check.

## Final acceptance

Fresh final request abb4c1b6-b274-4768-ae78-fff32435ba63 verifies the mailbox correction: original receipt_pdf page1 positioned text contains both owners,202 MALLARD WAY,PEEKSKILL/NY/10566. Bill mailingAddress is populated from those source items, not the appraiser. Folio matched;14 authority rows; combined$3,132.45; paid$3,007.15; all authority calculations matched; extraction errors[]. Screenshot and complete client JSON are included in this evidence directory.

GitHub code7a72cffa7c3c3b23cbcfa0fc9043b11f1e62335e CI37838461532 succeeded (offline suite and standalone build). This final evidence update changes no application code; reuse that exact code-revision check rather than replay paid/source tests.

Final ledger snapshot$2.08 conservatively accounted,0 reserved,$2.92 remaining under$5. This includes$0.08 external allowance; Scrape.do authoritative receipt reports5 credits, not a verified USD invoice. No funds reset or limits raised. API keys never printed/committed; shared Scrape.do token remained in worker environment.

Remaining source limits: original Miami PDFs do not publish a totalDiscountable subtotal/eligibility proof; ownerOccupied lacks an authoritative field; full historical certificate/deed clearance remains unproven. Firecrawl and Scrape.do each reached the Clerk entry page200, but no independently verified property-specific deed result was integrated. Exact Firecrawl search caller timed out and no result body was retained; do not reinterpret that as no cases. Discovery endpoints stay distinct from client lookup/acceptance and must not advertise full coverage.

Stop source/provider trials at this checkpoint. Continuation needs a new bounded scope for the case/certificate adapter and durable diagnostic result capture, not replay of historical trials. Keep remaining17 county upgrades and production Linux cutover separate.
