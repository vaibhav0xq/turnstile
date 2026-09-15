import assert from "node:assert/strict";
import test from "node:test";
import { clientIp, isInternalIp, limiterKey, normalizeIp } from "../src/client-ip.ts";

const headers = (forwarded?: string) =>
  new Headers(forwarded === undefined ? {} : { "x-forwarded-for": forwarded });

test("one trusted proxy: the client is the last entry, whatever it sent itself", () => {
  const spoofed = clientIp(headers("1.2.3.4, 203.0.113.9"), { trustedHops: 1 });
  assert.equal(spoofed.address, "203.0.113.9");
  assert.equal(spoofed.source, "x-forwarded-for");
  assert.equal(spoofed.forwardedEntries, 2);
  // Rotating the forged prefix never changes the key.
  const rotated = clientIp(headers("9.9.9.9, 8.8.8.8, 203.0.113.9"), { trustedHops: 1 });
  assert.equal(rotated.key, spoofed.key);
});

test("two trusted proxies: second public entry from the right", () => {
  const seen = clientIp(headers("1.2.3.4, 203.0.113.9, 35.190.0.7"), { trustedHops: 2 });
  assert.equal(seen.address, "203.0.113.9");
  // With one trusted hop the same chain fails closed on the load balancer's address, never on the forgery.
  assert.equal(
    clientIp(headers("1.2.3.4, 203.0.113.9, 35.190.0.7"), { trustedHops: 1 }).address,
    "35.190.0.7",
  );
});

test("internal hops (path router, sidecar) are skipped without configuration", () => {
  assert.equal(
    clientIp(headers("1.2.3.4, 203.0.113.9, 127.0.0.1"), { trustedHops: 1 }).address,
    "203.0.113.9",
  );
  assert.equal(clientIp(headers("203.0.113.9, 10.0.0.5, ::1"), { trustedHops: 1 }).address, "203.0.113.9");
  assert.equal(
    clientIp(headers("2001:db8::7, fd00::1, 172.31.0.9"), { trustedHops: 1 }).address,
    "2001:db8::7",
  );
  // A forged internal address on the left is never reached: the walk stops at the first public entry.
  assert.equal(
    clientIp(headers("10.9.9.9, 203.0.113.9, 127.0.0.1"), { trustedHops: 1 }).address,
    "203.0.113.9",
  );
  // Only internal entries → no client address at all.
  assert.equal(clientIp(headers("10.0.0.1, 127.0.0.1"), { trustedHops: 1 }).key, "unknown");
});

test("a connection straight from a public peer is keyed by its socket, whatever it sends", () => {
  const seen = clientIp(headers("1.2.3.4, 203.0.113.9"), { trustedHops: 1, remoteAddress: "198.51.100.23" });
  assert.equal(seen.address, "198.51.100.23");
  assert.equal(seen.source, "socket");
  // …while the same headers through the local proxy read the forwarded chain.
  assert.equal(
    clientIp(headers("1.2.3.4, 203.0.113.9"), { trustedHops: 1, remoteAddress: "127.0.0.1" }).address,
    "203.0.113.9",
  );
});

test("isInternalIp", () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.1.1",
    "100.64.0.1",
    "::1",
    "fc00::1",
    "fd12::1",
    "fe80::1",
  ])
    assert.equal(isInternalIp(ip), true, ip);
  for (const ip of ["172.32.0.1", "8.8.8.8", "203.0.113.9", "2001:db8::1", "35.190.0.7", "100.128.0.1"])
    assert.equal(isInternalIp(ip), false, ip);
});

test("fewer entries than trusted hops never falls back to the client-controlled end", () => {
  const seen = clientIp(headers("1.2.3.4"), { trustedHops: 2 });
  assert.equal(seen.key, "unknown");
  assert.equal(seen.source, "none");
});

test("direct (no proxy): only the socket address counts", () => {
  const seen = clientIp(headers("1.2.3.4"), { trustedHops: 0, remoteAddress: "::ffff:198.51.100.7" });
  assert.equal(seen.address, "198.51.100.7");
  assert.equal(seen.source, "socket");
  assert.equal(clientIp(headers("1.2.3.4"), { trustedHops: 0 }).key, "unknown");
});

test("x-real-ip and garbage entries are ignored", () => {
  const real = new Headers({ "x-real-ip": "1.2.3.4" });
  assert.equal(clientIp(real, { trustedHops: 1 }).key, "unknown");
  assert.equal(clientIp(headers("not-an-ip"), { trustedHops: 1 }).key, "unknown");
  // An unparsable entry at the trusted end stops the walk: nothing to its left is trusted.
  assert.equal(clientIp(headers("1.2.3.4, unknown"), { trustedHops: 1 }).key, "unknown");
  assert.equal(clientIp(headers("1.2.3.4, unknown, 127.0.0.1"), { trustedHops: 1 }).key, "unknown");
});

test("normalizeIp strips ports, brackets and the v4-mapped prefix", () => {
  assert.equal(normalizeIp("203.0.113.9:51234"), "203.0.113.9");
  assert.equal(normalizeIp("[2001:db8::1]:443"), "2001:db8::1");
  assert.equal(normalizeIp("::ffff:203.0.113.9"), "203.0.113.9");
  assert.equal(normalizeIp("  2001:db8::1 "), "2001:db8::1");
  assert.equal(normalizeIp("999.1.1.1"), null);
  assert.equal(normalizeIp(""), null);
});

test("IPv6 keys by /64 so privacy-extension rotation shares one bucket", () => {
  assert.equal(limiterKey("2001:db8:abcd:12::1"), "2001:0db8:abcd:0012::/64");
  assert.equal(limiterKey("2001:db8:abcd:12:ffff:ffff:ffff:ffff"), "2001:0db8:abcd:0012::/64");
  assert.notEqual(limiterKey("2001:db8:abcd:13::1"), limiterKey("2001:db8:abcd:12::1"));
  assert.equal(limiterKey("203.0.113.9"), "203.0.113.9");
});
