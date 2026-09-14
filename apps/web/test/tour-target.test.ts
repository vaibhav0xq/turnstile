import assert from "node:assert/strict";
import { test } from "node:test";
import { pickTourEvent } from "../src/app/tour-target.ts";

const paid = { priceWei: "1000000000000000" };
const free = { priceWei: "0" };
const events = [
  { address: "0xAAA0000000000000000000000000000000000001", eventId: "1", tiers: [free, paid] },
  { address: "0xBBB0000000000000000000000000000000000002", eventId: "2", tiers: [paid] },
  { address: "0xCCC0000000000000000000000000000000000003", eventId: "3", tiers: [paid, free] },
  { address: "0xDDD0000000000000000000000000000000000010", eventId: "10", tiers: [paid] },
];

test("defaults to the newest event that has a free tier", () => {
  assert.equal(pickTourEvent(events, null)?.eventId, "3");
});

test("?event= wins when it names a listed event, case-insensitively", () => {
  assert.equal(pickTourEvent(events, "0xbbb0000000000000000000000000000000000002")?.eventId, "2");
});

test("an unknown ?event= falls back to the default rather than nothing", () => {
  assert.equal(pickTourEvent(events, "0x0000000000000000000000000000000000000000")?.eventId, "3");
});

test("with no free tier anywhere the first event is used; no events gives undefined", () => {
  assert.equal(
    pickTourEvent(
      events.filter((e) => !e.tiers.includes(free)),
      null,
    )?.eventId,
    "2",
  );
  assert.equal(pickTourEvent([], null), undefined);
});

test("eventId ordering is numeric, not lexical", () => {
  const withFreeTen = events.map((e) => (e.eventId === "10" ? { ...e, tiers: [free] } : e));
  assert.equal(pickTourEvent(withFreeTen, null)?.eventId, "10");
});
