import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";

// The same module is preloaded in each test worker. Tests may replace fetch with
// fixture transports; accidentally falling back to the real network fails closed.
if (process.env.INVISIA_OFFLINE_TEST_WORKER === "1") {
  const blocked = () => { throw new Error("Network access is disabled in npm test; use a fixture transport."); };
  globalThis.fetch = blocked;
  for (const protocol of [http, https]) {
    protocol.request = blocked;
    protocol.get = blocked;
  }
  syncBuiltinESMExports();
} else {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const tests = readdirSync(new URL("../tests/", import.meta.url))
    .filter(name => name.endsWith(".test.mjs")).sort().map(name => `tests/${name}`);
  if (!tests.length) throw new Error("No offline test files found.");
  const result = spawnSync(process.execPath, ["--import", fileURLToPath(import.meta.url), "--test", ...tests], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, INVISIA_OFFLINE_TEST_WORKER: "1", INVISIA_BROWSER_ENABLED: "0", INVISIA_BROWSER_API_KEY: "", INVISIA_POC_API_KEY: "" },
  });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
