# Client feedback validation — 13 October 2026

The current PR integrates client extraction fixes with durable retrieval jobs and optional document tooling. It remains a draft implementation review; public deployment and complete historical clearance are not claimed.

## Verified client behavior

The actual isolated staging service was checked through authenticated job reads after its five-case live source/API/POC acceptance. The reported Miami address/owner resolves to the exact parcel, retains two active certificate liabilities and reconciles the original latest redemption PDF. All four Bradford cases retain matching property/assessment/tax data; Callahan and Fletcher explicitly use owner-mailing address mode. Their physical property sites remain separate.

Bradford preserves every published history row and the bounded All Years search's verified originals in additive sections. The existing AccountHistory latest-year contract and current-liability totals remain unchanged. Historical zero balances do not prove certificate redemption; original historical owners are retained for their own years.

Paid annual bills expose source-backed ad valorem/non-ad valorem totals, combined tax, payment details and total millage with explicit rate units. Certificate notices explicitly mark absent annual/payment fields as not published. Bradford's unprinted discountable subtotal remains null; the client has been asked to supply the manual-discount formula, eligible base, date/rate rules, rounding and a worked example before any inferred calculation is added.

## Regression and release scope

The exact PR candidate passes 484 offline tests and the self-host build on Node 24.21.0. Existing CI validates Node 22. Reviewed changes include independently loaded collector panels, cancellation-aware/hash-verified PDF transfer, repeated redemption-field reconciliation, historical identity/pagination checks, preserved provider dispatch outcomes and accurate field-availability explanations.

The loaded isolated release has 476 passing Node 22 checks and separately retained source-to-UI acceptance. The broader PR additionally contains optional OCR and Chromium improvements that are not activated in that release. Do not describe all PR files as live-deployed. OCR is disabled by default, requires an isolated runtime in production mode and always retains recognition output for human review. Controlled image-only samples are tests, not acceptance of arbitrary county scans.

## Outstanding gates

- Public staging still reaches the shared backend. Its staging-only route must be switched and externally checked by an administrator before client public-URL acceptance.
- Paid source recovery remains disabled after bounded verification. Original spending records and explicit access/capture approvals remain required.
- Miami's independent Clerk search remains restricted; unavailable annual years and full certificate/deed coverage remain explicit gaps.
- OCR container activation, public binary ingress, the broader county/property acceptance matrix and monitoring gates remain open.

This PR publishes implementation, source-derived regression fixtures and this sanitized checkpoint. Private access keys, environment files, operational logs, database backups and raw deployment evidence are excluded. No email was sent.
