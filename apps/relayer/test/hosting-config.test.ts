import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("Railway cannot boot without the hosted single-writer mode", () => {
  const result = spawnSync(process.execPath, ["-e", "import('./src/config.ts')"], {
    cwd: new URL("../", import.meta.url).pathname,
    encoding: "utf8",
    env: {
      ...process.env,
      RAILWAY_SERVICE_ID: "test-service",
      HOSTING_MODE: "",
      CHAIN_ID: "10143",
      RPC_URL: "http://127.0.0.1:8545",
    },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Hosted Turnstile requires HOSTING_MODE/);
});
