# Archived Worker/Sites adapter

These files preserve the previous Cloudflare Worker/Sites scaffolding for historical reference. They are not the active application, are not dependencies of npm start/build/setup, and are not configured for deployment from this folder. Their former relative paths and dependency assumptions require deliberate migration if ever reused.

The user selected Linux + Nginx/systemd. Use ../../server, ../../AGENTS.md and ../../docs/DEPLOYMENT.md. Do not create a Site, install the former platform dependencies or run these old publishing helpers unless the human explicitly requests a different deployment architecture.

The accepted old runtime identity is archived at ../../docs/history/cloudflare-sites-v27.json. The old package manifest is a record only at ../../docs/history/cloudflare-sites-package.json. Production on the old host was not changed by this repository migration.
