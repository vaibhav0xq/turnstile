// "Pick the next seat" is the one tap most people take: it must land on the best seat left, skip the seat
// that just failed as taken even before the map has caught up, and say so when a tier is sold out.
import assert from "node:assert/strict";
import { test } from "node:test";
import { nextOpenSeat } from "../src/app/next-seat.ts";
import type { EventInfo } from "../src/chain/config.ts";
import type { SeatMap, SeatState } from "../src/chain/seats.ts";
import { buildLayout, VENUE_IDS } from "../src/venues/layout.ts";

const theatre: EventInfo = {
  address: "0xa83d5293e0904e17E5058fEF7EFC41dC4beD159D",
  eventId: "1",
  name: "The Metropolis Players: Act III",
  symbol: "ACT3",
  venue: VENUE_IDS.theatre,
  organiser: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  startsAt: 1_789_569_105,
  salesEndAt: 1_789_569_105,
  resaleCapBps: 11_000,
  resaleFeeBps: 500,
  capacity: 300,
  sold: 0,
  checkedIn: 0,
  tiers: [
    { index: 0, name: "Stalls", priceWei: "0", firstSeat: 1, seatCount: 180 },
    { index: 1, name: "Circle", priceWei: "50000000000000000", firstSeat: 201, seatCount: 120 },
  ],
};
const layout = buildLayout(theatre);

function sold(id: number): SeatState {
  return {
    id,
    holder: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    doorKey: "0x0000000000000000000000000000000000000000",
    checkedInAt: 0,
    listingPrice: 0n,
    listed: false,
  };
}
function mapOf(ids: number[]): SeatMap {
  return new Map(ids.map((id) => [id, sold(id)]));
}

test("no seat map yet means no pick (every seat would look open)", () => {
  assert.equal(nextOpenSeat(theatre, layout, undefined, 0), null);
});

test("picks the open seat nearest the centre of the front-most row that still has one", () => {
  const front = [...layout.byId.values()].filter((s) => s.id <= 180 && s.row === layout.byId.get(1)?.row);
  assert.ok(front.length > 2, "front row has more than two seats");
  const centre = front.reduce((a, b) =>
    Math.abs(b.x - layout.center.x) < Math.abs(a.x - layout.center.x) ? b : a,
  );
  assert.equal(nextOpenSeat(theatre, layout, new Map(), 0), centre.id);
  // sell the whole front row: the pick moves to the next row, still nearest the centre
  const next = nextOpenSeat(theatre, layout, mapOf(front.map((s) => s.id)), 0);
  assert.ok(next !== null && !front.some((s) => s.id === next));
  assert.notEqual(layout.byId.get(next ?? 0)?.row, front[0]?.row);
});

test("skips the seat that just failed as taken even while the map still shows it open", () => {
  const first = nextOpenSeat(theatre, layout, new Map(), 0);
  assert.ok(first !== null);
  const second = nextOpenSeat(theatre, layout, new Map(), 0, first);
  assert.ok(second !== null && second !== first);
  assert.equal(layout.byId.get(second)?.row, layout.byId.get(first)?.row, "same row, next best");
});

test("a sold-out tier yields nothing, and a tier index off the end is not an error", () => {
  const all = mapOf(Array.from({ length: 180 }, (_, i) => i + 1));
  assert.equal(nextOpenSeat(theatre, layout, all, 0), null);
  assert.equal(nextOpenSeat(theatre, layout, new Map(), 7), null);
  // the circle is untouched by the stalls selling out
  assert.ok(nextOpenSeat(theatre, layout, all, 1) !== null);
});
