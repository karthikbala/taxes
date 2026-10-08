# Recovered collector status — 8 October 2026

Cause: TaxSys direct collector identity HTTP403 was retained as failed even after independently verified browser recovery. POC displayed raw attempt status without recovery context.

Change: after collector identity and account-link checks succeed, mark the blocked direct attempt recovered. Preserve attempt_status=failed, HTTP403/error/provenance and recovery_source_id=tax_collector_browser. POC displays “Direct access blocked — recovered through browser”. Genuine mismatches, non-block failures and failed/unverified browser recovery remain failed. Identity checks and extraction are unchanged.

Verification: 44 focused recovery/Florida/phase-one checks plus seven client-engine integration checks passed; hosted build and JS syntax passed. No paid/provider/live county requests. Saved Miami evidence is historical; no new property acceptance claimed. All 40 browser-run rows terminal at bounded preflight (not a lock against new requests).

Release: hosted v29 source 7e462e1f1c2ca1f7a7fa478f6508fdb238e1e3ce, saved version appgprj_6ac53842fb58819195dbc8435c4116e9~appgver_1219e053087c819199bae00348d0183c; deployment appgdep_6ac7c99dfe048191ad8d6847b051b984 succeeded, environment revision2. Custom-domain poc.js and source-status.mjs fetched successfully using curl with browser User-Agent and contained new code. Default Python HTTP user-agent returned403; direct browser navigation to the module was client-blocked. No fresh paid UI lookup was run. Existing displayed results retain old labels; new results use recovery metadata. Standalone GitHub receives same code; Linux remains chosen future hosting route.
