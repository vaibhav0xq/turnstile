import assert from "node:assert/strict";
import test from "node:test";
import { canonicalHostPolicy, hostnameOf, redirectStatus, redirectTarget } from "../src/canonical-host.ts";

test("no public origin means no redirects at all", () => {
  assert.equal(canonicalHostPolicy(null, "www.example.com"), null);
  assert.equal(redirectTarget(null, "www.example.com", "/"), null);
});

test("www.<apex> and REDIRECT_HOSTS aliases redirect, the apex and other hosts do not", () => {
  const policy = canonicalHostPolicy(
    "https://turnstile.show",
    " https://turnstile.club/, turnstile.one:443 ,turnstile.show",
  );
  assert.ok(policy);
  assert.equal(policy.origin, "https://turnstile.show");
  assert.deepEqual([...policy.aliases].sort(), ["turnstile.club", "turnstile.one", "www.turnstile.show"]);
  assert.equal(
    redirectTarget(policy, "www.turnstile.show", "/e/0xabc?tour=1"),
    "https://turnstile.show/e/0xabc?tour=1",
  );
  assert.equal(redirectTarget(policy, "WWW.Turnstile.Show:443", "/"), "https://turnstile.show/");
  assert.equal(redirectTarget(policy, "turnstile.club", "/me"), "https://turnstile.show/me");
  assert.equal(redirectTarget(policy, "turnstile.show", "/"), null);
  assert.equal(redirectTarget(policy, "turnstile-staging.replit.app", "/"), null);
  assert.equal(redirectTarget(policy, "localhost:8787", "/api/health"), null);
  assert.equal(redirectTarget(policy, undefined, "/"), null);
});

test("a malformed Host header never redirects", () => {
  const policy = canonicalHostPolicy("https://turnstile.show", undefined);
  assert.equal(hostnameOf("www.turnstile.show/evil"), null);
  assert.equal(hostnameOf("www.turnstile.show@attacker"), null);
  assert.equal(redirectTarget(policy, "www.turnstile.show/evil", "/"), null);
  assert.equal(hostnameOf("[::1]:8787"), "[::1]");
});

test("redirect status keeps the method for non-GET requests", () => {
  assert.equal(redirectStatus("GET"), 301);
  assert.equal(redirectStatus("HEAD"), 301);
  assert.equal(redirectStatus("POST"), 308);
});
