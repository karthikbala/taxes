import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { projectRoot } from "./sites-env.mjs";

const args = process.argv.slice(2);
if (args.length > 1 || (args.length && args[0] !== "--db-only")) {
  throw new Error("Usage: npm run setup:local or npm run db:setup");
}
if (!args.length) {
  const path = new URL("../.dev.vars", import.meta.url);
  if (!existsSync(path)) {
    writeFileSync(path, `# Local development only; never commit this file.\nINVISIA_POC_API_KEY=${randomBytes(32).toString("hex")}\nINVISIA_BROWSER_ENABLED=0\n`, { flag: "wx", mode: 0o600 });
    console.log("Created ignored .dev.vars with a fresh local API key; browser provider is disabled.");
  } else {
    console.log("Existing .dev.vars preserved.");
  }
}
// Explicit --local: no Cloudflare account, production database or API token.
const result = spawnSync(process.execPath, [
  fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url)),
  "d1", "migrations", "apply", "DB", "--local", "--config", "wrangler.local.jsonc",
  "--persist-to", ".wrangler/state",
], { cwd: projectRoot, stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
