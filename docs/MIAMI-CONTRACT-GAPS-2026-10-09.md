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
