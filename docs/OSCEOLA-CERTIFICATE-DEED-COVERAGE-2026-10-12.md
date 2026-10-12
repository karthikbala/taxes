# Osceola public certificate and tax-deed coverage — 2026-10-12

## Change and source scope

The Osceola Collector account history alone does not establish certificate or tax-deed coverage. The official Collector site links its public TaxSys reports: report 1520, `Public-Certificate List All Certificates`, and report 1825, `Public-Tax Deed Search`, at https://county-taxes.net/osceola/reports/real-estate.

The new deterministic browser profile queries both reports for the independently joined collector account. Native exact matching requires a trailing `|`. It clears the certificate report's default `>2007` year filter, other text/date filters and all lifecycle restrictions. Parent-side checks verify the actual tab-delimited native POST, echoed response controls, report/schema/account identity, source count and consecutive pages. Capture is bounded to five pages per report, 500,000 characters per page and the existing shared provider deadline/budget policy. Incomplete counted results remain partial. No fixture is a runtime fallback.

Every published row retains its tax year, buyer/holder, certificate/deed lifecycle, original money fields and dates, with page/row provenance. Certificate issue year stays separate from tax year. Reissued certificates, historical holder records and redemption receipts are not added together. Account balances and certificate face values are not current redemption quotes. Positive issued certificates with a positive source account balance can establish active evidence; a closed historical deed cannot clear a newer certificate. Unknown status semantics stay as source fields.

Collector public report coverage and the independent Clerk case index are separate fields. Complete published queries do not establish retention completeness, missing annual years, a certified payoff or historical/title clearance.

## Source discovery and offline evidence

The exact-account Walmart report queries both returned zero records on 2026-10-12. A separate public county-held certificate sample, account `R132731-999204320020`, returned 33 certificate rows spanning tax years 2007–2025, including expired, issued, purchased, redeemed and surrendered records. Its Collector deed report returned two historical rows: Paid Off (application 2020-03-18, sale 2020-07-14), and Canceled (application 2026-04-01). The sanitized HTML fixtures retain these source rows and controls; positive parser tests supply the independently verified native query envelope, while the empty fixture retains the actual managed POST evidence.

The independent Clerk URL https://officialrecords.osceolaclerk.org/browserviewtd/ failed from the Mac, staging and in-app browser. A bounded managed-browser attempt returned `net::ERR_CONNECTION_RESET`. No Clerk query or negative case result was verified. The staging Taxes environment has no Scrape.do credential configured; no other project's credentials were accessed. Scrape.do was not called and no provider/budget configuration changed.

Discovery used two fixed browser sessions, both confirmed closed: `01a12f65-3258-72fc-9f00-d4652f62e647` (Clerk failure, two credits) and `01a12f6e-2ea1-717e-ab1c-5f18988d54ac` (both Collector reports, two credits). Total four credits ($0.08), within the declared eight-credit ($0.16) discovery ceiling. Private audit is retained under the staging Taxes admin directory. Pre-release provider inventory: 942 credits, zero active sessions; zero open client lookups/reservations. Existing explicit staging override remains unchanged. Prior task sessions are counted separately across restarts; no new ledger was created.

## Release checkpoint

Implementation and focused parser/integration checks complete. Shared offline suite and self-host build passed before release preparation. One final full Walmart lookup is planned on staging, maximum three sessions and twelve credits ($0.24), with source → JSON → actual UI checks. Together with six prior task sessions, this permits nine total sessions within the existing ten-capture staging allowance. Only one final full request is authorized by this checkpoint; no automatic paid retries are added.

Deployment identifiers, final tests, authenticated lookup evidence, UI proof and final provider accounting will be appended after acceptance. The appraiser recovery snapshot is recorded separately in [OSCEOLA-APPRAISER-RECOVERY-2026-10-12.md](OSCEOLA-APPRAISER-RECOVERY-2026-10-12.md).
