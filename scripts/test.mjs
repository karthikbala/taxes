import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";

// The same module is preloaded in each test worker. Tests may replace fetch with
// fixture transports; accidentally falling back to the real network fails closed.
if (process.env.INVISIA_OFFLINE_TEST_WORKER === "1") {
  const allowedLocal = target => {
    if (process.env.INVISIA_TEST_ALLOW_LOOPBACK !== "1") return false;
    try { const u = new URL(target instanceof Request ? target.url : String(target)); return ["http:","https:"].includes(u.protocol) && ["127.0.0.1","[::1]"].includes(u.hostname); } catch { return false; }
  };
  const guarded = original => (...args) => {
    if (!allowedLocal(args[0])) throw new Error("Network access is disabled in npm test; use a fixture transport.");
    return original(...args);
  };
  globalThis.fetch = guarded(globalThis.fetch);
  for (const protocol of [http, https]) {
    protocol.request = guarded(protocol.request.bind(protocol));
    protocol.get = guarded(protocol.get.bind(protocol));
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
