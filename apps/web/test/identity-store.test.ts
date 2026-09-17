import assert from "node:assert/strict";
import { test } from "node:test";
import { ACCOUNT_SESSION_TTL_MS, DOOR_SESSION_TTL_MS } from "@turnstile/identity";

// The store reads the browser environment when it loads. Give it the minimum before importing it.
const stored = new Map<string, string>();
Object.assign(globalThis, {
  window: { location: { hostname: "localhost", search: "" } },
  localStorage: {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value),
    removeItem: (key: string) => void stored.delete(key),
  },
});
const { toEventRef, useIdentity } = await import("../src/identity/store.ts");

const T = 1_800_000_000_000;
const event = toEventRef(10143, "0x7cd7bcb4a8dfdbfd4769868e9f1dca04818c87e8");

test("renewing an expired door key keeps the account session and needs only the door ceremony", async () => {
  const realNow = Date.now;
  let now = T;
  Date.now = () => now;
  try {
    // Dev identity: a deterministic PRF through the real KDFs, so sessions behave as with a passkey.
    useIdentity.getState().setDevSeed("expiry-test");
    const fan = await useIdentity.getState().create();
    const first = await useIdentity.getState().ensureDoor(event);
    assert.equal(useIdentity.getState().liveDoor(event), first);

    // An hour later both sessions are over. The account session (15 min) always ends before the door's.
    now = T + DOOR_SESSION_TTL_MS + 60_000;
    assert.ok(ACCOUNT_SESSION_TTL_MS < DOOR_SESSION_TTL_MS);
    assert.ok(fan.expiresAt <= now && first.expiresAt <= now);
    assert.equal(useIdentity.getState().liveDoor(event), null);

    // "Generate a fresh door code" on the ticket calls renewDoor. Record every ceremony it starts.
    const ceremonies = new Set<string>();
    const unsubscribe = useIdentity.subscribe((s) => {
      if (s.busy) ceremonies.add(s.busy);
    });
    const renewed = await useIdentity.getState().renewDoor(event);
    unsubscribe();

    assert.deepEqual([...ceremonies], ["door"]); // no sign-in forced in between
    // The ticket panel keeps showing the seat as the fan's own: the expired account session is not swept.
    assert.equal(useIdentity.getState().fan, fan);
    // The code view is live again, on the same door key that is bound on chain.
    assert.equal(useIdentity.getState().liveDoor(event), renewed);
    assert.equal(renewed.address, first.address);
    assert.ok(renewed.expiresAt > now);
  } finally {
    Date.now = realNow;
    useIdentity.getState().setDevSeed(null);
  }
});
