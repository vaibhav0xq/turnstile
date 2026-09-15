import assert from "node:assert/strict";
import { test } from "node:test";
import { NIGHT_LINGER_MS, nightsOn } from "../src/app/nights.ts";

const now = Date.UTC(2026, 8, 18, 15, 0, 0);
const at = (ms: number) => ({ startsAt: Math.floor(ms / 1000) });

test("nightsOn keeps tonight and the future, drops rooms whose doors are hours behind", () => {
  const events = [
    at(now + 7 * 86_400_000), // next week
    at(now - 3_600_000), // doors an hour ago: still on
    at(now - NIGHT_LINGER_MS + 1000), // a second inside the linger
    at(now - NIGHT_LINGER_MS), // exactly at the boundary: gone
    at(now - 86_400_000), // yesterday
  ];
  assert.deepEqual(nightsOn(events, now), events.slice(0, 3));
});

test("nightsOn is order-preserving and leaves an empty bill empty", () => {
  assert.deepEqual(nightsOn([], now), []);
  const events = [at(now + 1), at(now - 10 * 86_400_000), at(now + 2)];
  assert.deepEqual(nightsOn(events, now), [events[0], events[2]]);
});
