import assert from "node:assert/strict";
import { test } from "node:test";
import { keccak256, parseEther, stringToBytes } from "viem";
import {
  buildCreateEventArgs,
  defaultDraft,
  deriveSymbol,
  type EventDraft,
  metadataBaseURI,
  parseMon,
  validateDraft,
} from "../src/app/event-draft.ts";

const NOW = Date.UTC(2026, 8, 14, 12, 0, 0);
const GATE = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as const;
const venueIds = {
  club: keccak256(stringToBytes("venue:metropolis-club:v1")),
  theatre: keccak256(stringToBytes("venue:metropolis-theatre:v1")),
};

function draft(overrides: Partial<EventDraft> = {}): EventDraft {
  return {
    ...defaultDraft(NOW),
    name: "Neon Night at Metropolis",
    tiers: [
      { key: 1, name: "General Admission", priceMon: "0", seatCount: 300 },
      { key: 2, name: "Booth", priceMon: "0.05", seatCount: 12 },
    ],
    ...overrides,
  };
}

test("a default draft opens doors three days out and is only missing a name", () => {
  const d = defaultDraft(NOW);
  assert.ok(d.startsAt * 1000 > NOW + 2.9 * 86_400_000);
  assert.deepEqual(
    validateDraft(d, NOW).map((i) => i.field),
    ["name"],
  );
});

test("symbols come from initials", () => {
  assert.equal(deriveSymbol("Neon Night at Metropolis"), "NNAM");
  assert.equal(deriveSymbol("act 3"), "A3");
  assert.equal(deriveSymbol("x"), "TSTL");
});

test("MON amounts parse to wei and reject garbage", () => {
  assert.equal(parseMon("0"), 0n);
  assert.equal(parseMon("0.05"), parseEther("0.05"));
  assert.equal(parseMon("1e3"), null);
  assert.equal(parseMon("-1"), null);
  assert.equal(parseMon("99999999999999999999999"), null); // > uint96
});

test("tiers get a thousand seat ids each and percentages become basis points", () => {
  const args = buildCreateEventArgs(draft(), {
    venueIds,
    gates: [GATE],
    baseURI: "https://relayer.example/api/events/3/tickets/",
  });
  assert.deepEqual(
    args.tiers.map((t) => [t.firstSeat, t.seatCount, t.price]),
    [
      [1, 300, 0n],
      [1001, 12, parseEther("0.05")],
    ],
  );
  assert.equal(args.config.symbol, "NNAM");
  assert.equal(args.config.venue, venueIds.club);
  assert.equal(args.config.resaleCapBps, 11_000);
  assert.equal(args.config.resaleFeeBps, 500);
  assert.equal(args.config.salesEndAt, 0n);
  assert.deepEqual(args.gates, [GATE]);
  assert.equal(args.config.baseURI, "https://relayer.example/api/events/3/tickets/");
});

test("validation catches what the contract would revert on, with a field per issue", () => {
  const soon = draft({ startsAt: Math.floor(NOW / 1000) + 60 });
  assert.ok(validateDraft(soon, NOW).some((i) => i.field === "startsAt"));
  const lateSales = draft({ salesEndAt: draft().startsAt + 1 });
  assert.ok(validateDraft(lateSales, NOW).some((i) => i.field === "salesEndAt"));
  const badTier = draft({ tiers: [{ key: 1, name: "", priceMon: "abc", seatCount: 0 }] });
  const fields = validateDraft(badTier, NOW).map((i) => i.field);
  assert.equal(fields.filter((f) => f === "tier.0").length, 3);
  const fee = draft({ resaleFeePct: 101 });
  assert.ok(validateDraft(fee, NOW).some((i) => i.field === "resale"));
  assert.throws(() => buildCreateEventArgs(badTier, { venueIds, gates: [], baseURI: "" }));
});

test("metadata prefix ends with a slash so the token id appends cleanly", () => {
  assert.equal(metadataBaseURI("https://r.example/", 7n), "https://r.example/api/events/7/tickets/");
});
