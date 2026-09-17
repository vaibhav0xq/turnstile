import assert from "node:assert/strict";
import { test } from "node:test";
import { SLOT_MS } from "@turnstile/identity";
import { codeStale, DOOR_WARN_MS, sessionPhase } from "../src/lib/session.ts";

const T = 1_800_000_000_000;

test("sessionPhase warns before the end and never after it", () => {
  assert.equal(sessionPhase(T, T + DOOR_WARN_MS + 1), "live");
  assert.equal(sessionPhase(T, T + DOOR_WARN_MS), "ending");
  assert.equal(sessionPhase(T, T + 1), "ending");
  assert.equal(sessionPhase(T, T), "expired");
  assert.equal(sessionPhase(T + 1, T), "expired");
});

test("codeStale matches the gate's previous-slot grace", () => {
  const slotEndsAt = T;
  assert.equal(codeStale(T - 1, slotEndsAt), false); // current slot
  assert.equal(codeStale(T + SLOT_MS - 1, slotEndsAt), false); // previous slot, still accepted
  assert.equal(codeStale(T + SLOT_MS, slotEndsAt), true); // two slots old, refused
  assert.equal(codeStale(T, 0), false); // nothing rendered yet is not stale
});
