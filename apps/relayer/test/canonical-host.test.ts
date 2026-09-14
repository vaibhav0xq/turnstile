import assert from "node:assert/strict";
import test from "node:test";
import { canonicalHostPolicy, hostnameOf, redirectStatus, redirectTarget } from "../src/canonical-host.ts";

test("no public origin means no redirects at all", () => {
  assert.equal(canonicalHostPolicy(null, "www.example.com"), null);
  assert.equal(redirectTarget(null, "www.example.com", "/"), null);
});

test("www.<apex> and REDIRECT_HOSTS aliases redirect, the apex and other hosts do not", () => {
  const policy = canonicalHostPolicy(
    "https://turnstile.work",
    " https://turnstile.club/, turnstile.one:443 ,turnstile.work",
  );
  assert.ok(policy);
  assert.equal(policy.origin, "https://turnstile.work");
  assert.deepEqual([...policy.aliases].sort(), ["turnstile.club", "turnstile.one", "www.turnstile.work"]);
  assert.equal(
    redirectTarget(policy, "www.turnstile.work", "/e/0xabc?tour=1"),
    "https://turnstile.work/e/0xabc?tour=1",
  );
  assert.equal(redirectTarget(policy, "WWW.Turnstile.Work:443", "/"), "https://turnstile.work/");
  assert.equal(redirectTarget(policy, "turnstile.club", "/me"), "https://turnstile.work/me");
  assert.equal(redirectTarget(policy, "turnstile.work", "/"), null);
  assert.equal(redirectTarget(policy, "turnstile-staging.replit.app", "/"), null);
  assert.equal(redirectTarget(policy, "localhost:8787", "/api/health"), null);
  assert.equal(redirectTarget(policy, undefined, "/"), null);
});

test("a malformed Host header never redirects", () => {
  const policy = canonicalHostPolicy("https://turnstile.work", undefined);
  assert.equal(hostnameOf("www.turnstile.work/evil"), null);
  assert.equal(hostnameOf("www.turnstile.work@attacker"), null);
  assert.equal(redirectTarget(policy, "www.turnstile.work/evil", "/"), null);
  assert.equal(hostnameOf("[::1]:8787"), "[::1]");
});

test("redirect status keeps the method for non-GET requests", () => {
  assert.equal(redirectStatus("GET"), 301);
  assert.equal(redirectStatus("HEAD"), 301);
  assert.equal(redirectStatus("POST"), 308);
});
