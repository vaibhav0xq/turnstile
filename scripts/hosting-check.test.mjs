import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { validateConfiguration, validateDist, validateRuntimeEnvironment } from "./hosting-check.mjs";

const production = {
  HOSTING_MODE: "production",
  CHAIN_ID: "10143",
  PUBLIC_ORIGIN: "https://turnstile.work",
  CORS_ORIGIN: "https://turnstile.work",
  VITE_SITE_URL: "https://turnstile.work",
  VITE_API_URL: "",
  VITE_RP_ID: "",
  DATABASE_URL: "postgres://test-only",
  RPC_URL: "https://server-rpc.example",
  PUBLIC_RPC_URL: "https://browser-rpc.example",
  RELAYER_PRIVATE_KEY: "test-only",
  GATE_SIGNER_PRIVATE_KEY: "test-only",
  GATE_TOKEN: "test-only",
  VITE_ENVIO_GRAPHQL_URL: "https://indexer.example/graphql",
  TRUSTED_PROXY_HOPS: "1",
  DRIP_ENABLED: "0",
};

test("only the production API and SPA routes are allowed", () => {
  validateConfiguration();
  const web = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  const backend = JSON.parse(readFileSync(new URL("../railway.json", import.meta.url), "utf8"));
  const stagingApi = {
    source: "/api/:path*",
    has: [{ type: "host", value: { eq: "staging.turnstile.work" } }],
    destination: "https://api.staging.turnstile.work/api/:path*",
  };
  assert.throws(() => validateConfiguration({ ...web, rewrites: [...web.rewrites, stagingApi] }, backend));
  assert.throws(() =>
    validateConfiguration(
      { ...web, rewrites: [{ ...web.rewrites[0], has: undefined }, web.rewrites[1]] },
      backend,
    ),
  );
});

test("production requires canonical origins, separate RPCs, and a durable database", () => {
  validateRuntimeEnvironment("production", production);
  assert.throws(() => validateRuntimeEnvironment("staging", { ...production, HOSTING_MODE: "staging" }));
  assert.throws(() =>
    validateRuntimeEnvironment("production", {
      ...production,
      PUBLIC_ORIGIN: "https://staging.turnstile.work",
    }),
  );
  assert.throws(() => validateRuntimeEnvironment("production", { ...production, DATABASE_URL: "" }));
  assert.throws(() =>
    validateRuntimeEnvironment("production", { ...production, VITE_RP_ID: "staging.turnstile.work" }),
  );
  assert.throws(() =>
    validateRuntimeEnvironment("production", { ...production, VITE_API_URL: "https://api.turnstile.work" }),
  );
  assert.throws(() => validateRuntimeEnvironment("production", { ...production, TRUSTED_PROXY_HOPS: "" }));
  assert.throws(() =>
    validateRuntimeEnvironment("production", { ...production, PUBLIC_RPC_URL: production.RPC_URL }),
  );
  assert.throws(() =>
    validateRuntimeEnvironment("production", { ...production, ENVIRONMENT_LABEL: "staging" }),
  );
});

test("production build requires the canonical host and excludes staging", () => {
  const html =
    '<link data-canonical-host="turnstile.work" href="https://turnstile.work/"><meta content="https://turnstile.work/">';
  validateDist("production", html);
  assert.throws(() => validateDist("staging", html));
  assert.throws(() => validateDist("production", `${html}https://staging.turnstile.work/`));
  assert.throws(() => validateDist("production", html.replaceAll("turnstile.work", "other.example")));
});
