# Florida matrix publication — 8 October 2026

User requested the existing Florida-67-County-Source-Matrix-2026-10-08.html at https://taxes.zeneral.ai/florida. Preserved its dated research text/data; this does not refresh county evidence or advertise 67 accepted crawlers. Externalized its unchanged script for the standalone server CSP. Recombining HTML/script equals the original source bytes (SHA256 0560f6b7fe111e2df36f0514acb201530102a75c4f8a281226c42f7fa5519b6b).

## Release and validation

- Existing hosted source was freshly opened at b184c17c610ebbb055c23beb6b7f025d5f82af3b. Release changes only app/florida/route.ts, lib/florida-page.ts and public/florida.js.
- Hosted build passed; saved v28 source d744bb03af1bde6eeb1e775556aea740577ded11, saved version appgprj_6ac53842fb58819195dbc8435c4116e9~appgver_480e573fd6108191a80b3a3ffb90c8bc.
- Deployment appgdep_6ac7c54cf8b48191bb691d5cbc3f9de1 succeeded, environment revision 2. Secrets, DNS and bindings unchanged.
- Bounded drain preflight inspected all 40 existing browser-run rows: completed/failed only. No active rows observed; not a lock against new requests.
- Custom-domain browser verification: 67 rows visible, Miami search returns one, reset restores 67. Local browser verified the same behavior under standalone CSP.
- Standalone focused Florida + server checks: 17 passed; selfhost build and JS syntax passed. Filter fixture covers county search, collector Phenix, Cloudflare-block filter and reset. No duplicate full-suite run.
- No paid provider requests, source scraping or model extraction calls performed.

## Handoff

GitHub continues to target Node/SQLite on Linux with Nginx/systemd. The standalone server serves public/florida.html at /florida and /florida/, and the build copies both static files. This narrowly authorized existing-host publication does not authorize future automatic Sites releases or change the selfhost migration plan. The richer county capabilities and incomplete coverage remain as previously recorded.
