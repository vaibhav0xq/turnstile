#!/usr/bin/env node
// Read-only checks. Never print environment values, tokens, connection strings or wallet keys.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const load = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const originFor = (mode) => `https://${mode === "staging" ? "staging." : ""}turnstile.work`;

function routeFor(routes, source, host) {
  return routes.find(
    (route) =>
      route.source === source &&
      route.has?.some((match) => match.type === "host" && match.value?.eq === host),
  );
}

export function validateConfiguration(web = load("vercel.json"), backend = load("railway.json")) {
  assert.equal(web.outputDirectory, "apps/web/dist");
  assert.equal(web.installCommand, "pnpm install --frozen-lockfile");
  assert.equal(web.buildCommand, "pnpm --filter @turnstile/web build");
  for (const mode of ["staging", "production"]) {
    const host = new URL(originFor(mode)).hostname;
    const api = `https://api.${host}/api/:path*`;
    assert.equal(routeFor(web.rewrites, "/api/:path*", host)?.destination, api);
    assert.equal(routeFor(web.rewrites, "/:path*", host)?.destination, "/index.html");
  }
  assert.equal(
    routeFor(web.redirects, "/:path*", "www.turnstile.work")?.destination,
    "https://turnstile.work/:path*",
  );
  assert.equal(web.rewrites.filter((route) => route.source === "/api/:path*").length, 2);
  assert.ok(
    web.rewrites.every((route) => route.has?.some((match) => match.type === "host" && match.value?.eq)),
  );
  assert.equal(backend.deploy.startCommand, "pnpm --filter @turnstile/relayer start");
  assert.equal(backend.deploy.healthcheckPath, "/api/health");
  assert.equal(backend.deploy.numReplicas, 1);
  assert.equal(backend.deploy.overlapSeconds, 0);
  assert.equal(backend.deploy.sleepApplication, false);
  assert.ok(backend.deploy.drainingSeconds >= 60);
  assert.match(
    readFileSync(new URL("apps/relayer/db/schema.sql", root), "utf8"),
    /create table if not exists passports/i,
  );
}

export function validateRuntimeEnvironment(mode, env) {
  assert.ok(["staging", "production"].includes(mode), "Choose staging or production");
  const origin = originFor(mode);
  const hostname = new URL(origin).hostname;
  for (const key of [
    "DATABASE_URL",
    "RPC_URL",
    "PUBLIC_RPC_URL",
    "RELAYER_PRIVATE_KEY",
    "GATE_SIGNER_PRIVATE_KEY",
    "GATE_TOKEN",
    "VITE_ENVIO_GRAPHQL_URL",
  ]) {
    assert.ok(env[key], `Missing ${key}`);
  }
  assert.equal(env["HOSTING_MODE"], mode);
  assert.equal(env["CHAIN_ID"], "10143");
  assert.equal(env["PUBLIC_ORIGIN"], origin);
  assert.equal(env["CORS_ORIGIN"], origin);
  assert.equal(env["VITE_SITE_URL"], origin);
  assert.ok(!env["VITE_RP_ID"] || env["VITE_RP_ID"] === hostname, "RP ID must match this host");
  assert.ok(!env["VITE_API_URL"], "API must remain same-origin through /api");
  assert.ok(!env["STATIC_DIR"], "The hosted relayer must not serve web assets");
  assert.notEqual(env["DRIP_ENABLED"], "1", "Drip must be disabled");
  assert.match(env["TRUSTED_PROXY_HOPS"] ?? "", /^(0|[1-9][0-9]*)$/, "Measure TRUSTED_PROXY_HOPS at ingress");
  assert.notEqual(env["RPC_URL"], env["PUBLIC_RPC_URL"], "Browser and server RPC keys must be separate");
}

export function validateDist(mode, html) {
  assert.ok(["staging", "production"].includes(mode), "Choose staging or production");
  const origin = originFor(mode);
  const host = new URL(origin).hostname;
  assert.ok(html.includes(`data-canonical-host="${host}"`), "Incorrect canonical host in web build");
  assert.ok(html.includes(`href="${origin}/"`), "Incorrect canonical URL in web build");
  assert.ok(html.includes(`content="${origin}/"`), "Incorrect Open Graph URL in web build");
  if (mode === "staging")
    assert.ok(!html.includes("https://turnstile.work/"), "Staging build references production origin");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, mode] = process.argv.slice(2);
  try {
    if (command === "--config") validateConfiguration();
    else if (command === "--env") validateRuntimeEnvironment(mode, process.env);
    else if (command === "--dist")
      validateDist(mode, readFileSync(new URL("apps/web/dist/index.html", root), "utf8"));
    else
      throw new Error(
        "Usage: hosting-check.mjs --config | --env staging|production | --dist staging|production",
      );
    process.stdout.write("Hosting configuration check passed\n");
  } catch (error) {
    process.stderr.write(
      `Hosting configuration check failed: ${error instanceof Error ? error.message : "unknown error"}\n`,
    );
    process.exitCode = 1;
  }
}
