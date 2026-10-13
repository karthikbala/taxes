# Failure coverage

| Cause | Implementation | Verification gate |
| --- | --- | --- |
| Server 403/challenge | Direct → fixed local browser → approved managed browser → operator gap | Fresh exact-property access acceptance |
| Missing credentials/ledger | Preflight, explicit BUDGET_PENDING, no automatic retry | Real authorized entitlement/ledger reconciliation |
| 429/network/outage | Retry-After, bounded attempts, persistent retry schedule, circuit breaker | Offline fault injection; fresh county sample |
| Browser disconnect/restart | Independent jobs, leases, stage artifacts and checkpoints | Job/HTTP restart and cleanup tests |
| Dynamic history layouts | Existing footer/loaded-row markers preserved | Both source-derived layouts and live sample |
| Large/truncated PDF | Binary ticket ingress, chunk fallback, signature/size/hash | Offline upload integrity; external binary ingress acceptance |
| Unsupported PDF/scans | Worker unpdf → licensed PyMuPDF/Tesseract, OCR review | License/container build and real scanned sample |
| Suffix/unit/address ambiguity | Preserve current county resolvers and explicit review candidates | Existing source-derived identity regressions |
| Missing HTML-only subtotal | Existing same-account/year supplementation retained | Fresh source → job → UI comparison |
| Date/amount conflicts | Exact decimal checks and equivalent date normalization retained | Negative mutations and unaffected controls |
| Restricted historical years | Evidence-backed gap and unsent records-request draft | Authoritative county response or repeatable authorized feed |
| Incomplete certificate/deed scope | Independent source scopes; no inferred clearance | Exact-query/pagination tests and source review |
| Unknown paid outcome | Durable dispatch/session ownership, cleanup, conservative reconciliation | Failure/restart tests and provider cleanup acceptance |

Software support does not establish that every county/property is accepted. The 36-property matrix, gated optional tools and seven-day soak must be completed before production approval.
