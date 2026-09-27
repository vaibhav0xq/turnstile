import assert from "node:assert/strict";
import { test } from "node:test";
import { validateConfiguration, validateDist, validateRuntimeEnvironment } from "./hosting-check.mjs";

const staging = {
  HOSTING_MODE: "staging",
  CHAIN_ID: "10143",
  PUBLIC_ORIGIN: "https://staging.turnstile.work",
  CORS_ORIGIN: "https://staging.turnstile.work",
  VITE_SITE_URL: "https://staging.turnstile.work",
  VITE_API_URL: "",
  VITE_RP_ID: "",
  DATABASE_URL: "postgres://staging-only",
  RPC_URL: "https://server-rpc.example",
  PUBLIC_RPC_URL: "https://browser-rpc.example",
  RELAYER_PRIVATE_KEY: "test-only",
  GATE_SIGNER_PRIVATE_KEY: "test-only",
  GATE_TOKEN: "test-only",
  VITE_ENVIO_GRAPHQL_URL: "https://indexer.example/graphql",
  TRUSTED_PROXY_HOPS: "1",
  DRIP_ENABLED: "0",
};

test("hosting routes isolate the staging API and keep one relayer", () => {
  validateConfiguration();
});

test("staging cannot point at production origins or omit durable Postgres", () => {
  validateRuntimeEnvironment("staging", staging);
  assert.throws(() =>
    validateRuntimeEnvironment("staging", { ...staging, PUBLIC_ORIGIN: "https://turnstile.work" }),
  );
  assert.throws(() => validateRuntimeEnvironment("staging", { ...staging, DATABASE_URL: "" }));
  assert.throws(() => validateRuntimeEnvironment("staging", { ...staging, VITE_RP_ID: "turnstile.work" }));
  assert.throws(() => validateRuntimeEnvironment("staging", { ...staging, TRUSTED_PROXY_HOPS: "" }));
});

test("staging build rejects production canonical references", () => {
  const html =
    '<link data-canonical-host="staging.turnstile.work" href="https://staging.turnstile.work/"><meta content="https://staging.turnstile.work/">';
  validateDist("staging", html);
  assert.throws(() => validateDist("staging", `${html}https://turnstile.work/`));
});
