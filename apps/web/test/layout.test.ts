// Venue layouts are derived from on-chain data only (venue id + tier ranges), so the same event must
// place the same seat in the same spot on every device — the seat picker, the ticket's "view from your
// seat" and the gate's room all rely on it.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { EventInfo } from "../src/chain/config.ts";
import { buildLayout, seatLabel, seatViewpoint, VENUE_IDS, venueKind } from "../src/venues/layout.ts";

function event(
  venue: `0x${string}`,
  tiers: Array<[name: string, firstSeat: number, seatCount: number]>,
): EventInfo {
  return {
    address: "0xa83d5293e0904e17E5058fEF7EFC41dC4beD159D",
    eventId: "1",
    name: "Neon Night at Metropolis",
    symbol: "NEON",
    venue,
    organiser: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    startsAt: 1_789_569_105,
    salesEndAt: 1_789_569_105,
    resaleCapBps: 11_000,
    resaleFeeBps: 500,
    capacity: tiers.reduce((n, [, , count]) => n + count, 0),
    sold: 0,
    checkedIn: 0,
    tiers: tiers.map(([name, firstSeat, seatCount], index) => ({
      index,
      name,
      priceWei: index === 0 ? "0" : "50000000000000000",
      firstSeat,
      seatCount,
    })),
  };
}

const club = event(VENUE_IDS.club, [
  ["General Admission", 1, 300],
  ["Booth", 1001, 12],
]);
const theatre = event(VENUE_IDS.theatre, [
  ["Stalls", 1, 180],
  ["Circle", 201, 120],
  ["Balcony", 401, 80],
]);
const unknownVenue = event(`0x${"ab".repeat(32)}`, [["Floor", 1, 50]]);

for (const [label, ev] of [
  ["club", club],
  ["theatre", theatre],
  ["generic", unknownVenue],
] as const) {
  test(`${label}: every on-chain seat gets exactly one position`, () => {
    const layout = buildLayout(ev);
    const ids = new Set<number>();
    for (const seat of layout.seats) {
      assert.equal(ids.has(seat.id), false, `seat ${seat.id} placed twice`);
      ids.add(seat.id);
      assert.equal(layout.byId.get(seat.id), seat);
      assert.ok(Number.isFinite(seat.x) && Number.isFinite(seat.y) && Number.isFinite(seat.z));
    }
    const sectionIds = layout.sections.flatMap((s) => s.seatIds);
    assert.equal(new Set(sectionIds).size, sectionIds.length, "a seat belongs to one section");
    assert.equal(sectionIds.length, layout.seats.length);
    for (const section of layout.sections) {
      for (const id of section.seatIds) assert.equal(layout.byId.get(id)?.tier, section.tier);
    }
    for (const tier of ev.tiers) {
      for (let id = tier.firstSeat; id < tier.firstSeat + tier.seatCount; id++) {
        const seat = layout.byId.get(id);
        assert.ok(seat, `seat ${id} of ${tier.name} is missing`);
        assert.equal(seat.tier, tier.index);
      }
    }
    assert.equal(ids.size, ev.capacity);
  });

  test(`${label}: seats do not overlap`, () => {
    const { seats } = buildLayout(ev);
    let minGap = Number.POSITIVE_INFINITY;
    for (let i = 0; i < seats.length; i++) {
      for (let j = i + 1; j < seats.length; j++) {
        const a = seats[i];
        const b = seats[j];
        if (!a || !b) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        if (d < minGap) minGap = d;
      }
    }
    assert.ok(minGap > 0.5, `closest pair of seats is ${minGap.toFixed(3)} units apart`);
  });
}

test("layout is deterministic and cached per event", () => {
  const a = buildLayout(club);
  const b = buildLayout({ ...club });
  assert.equal(a, b, "same address + tiers → same layout object");
  const other = buildLayout({ ...club, address: "0x792468FF569fD02Bc73b7178da095C61DB4d3426" });
  assert.notEqual(a, other);
  assert.deepEqual(
    a.seats.map((seat) => [seat.id, seat.x, seat.y, seat.z]),
    other.seats.map((seat) => [seat.id, seat.x, seat.y, seat.z]),
    "the same venue id + tiers give the same geometry regardless of the event address",
  );
});

test("venue ids map to the two Metropolis rooms, anything else falls back to the generic room", () => {
  assert.equal(venueKind(club), "club");
  assert.equal(venueKind(theatre), "theatre");
  assert.equal(venueKind(unknownVenue), "generic");
  assert.equal(venueKind({ ...club, venue: VENUE_IDS.club.toUpperCase() as `0x${string}` }), "club");
});

test("labels and the view from a seat", () => {
  const layout = buildLayout(club);
  const first = layout.byId.get(1);
  assert.ok(first);
  assert.match(seatLabel(first), /^General Admission · Row [A-Z] · \d+$/);
  const booth = layout.byId.get(1001);
  assert.ok(booth);
  assert.match(seatLabel(booth), /^Booth · Row [A-Z] · \d+$/);
  const view = seatViewpoint(layout, first);
  assert.ok(view.position.y > first.y, "the eye sits above the seat");
  assert.deepEqual(view.target, layout.camera.stageFocus, "every seat looks at the stage");
});
