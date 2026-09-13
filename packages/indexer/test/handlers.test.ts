// The whole life of a seat, replayed through the real handlers with simulated logs: created → bought →
// bound → listed → passed on → rebound → admitted. No chain, no Postgres.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";
import { createTestIndexer } from "envio";
import "../src/handlers/turnstile.ts";

const CHAIN = 10143;
// simulate() applies config.yaml's start_block, so the replay is pinned just above the real deployment.
const START = Number(
  /id: 10143[\s\S]*?start_block: (\d+)/.exec(
    readFileSync(new URL("../config.yaml", import.meta.url), "utf8"),
  )?.[1] ?? 0,
);
const EVENT = "0x2CAB6A5aAF4bCB322C7bc85E81740AF10A1E4f85";
const ORGANISER = "0x427e4F058b0F92340c458F24f25b17AB770f491C";
const FAN = "0xa474E24e29eEc4733a741bB4C4800Ce7D3f424A8";
const TAKER = "0x2D4f6E4b0E45327E92A9bE5E1C1AE2C489678630";
const KEY_FAN = "0x1111111111111111111111111111111111111111";
const KEY_TAKER = "0x2222222222222222222222222222222222222222";
const GATE = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const VENUE = "0xe0a180026ff7299d64b68b6dc19a629ea8f586e0b928441124cec7942754fedd";
const T0 = 1_789_400_000;

const at = (block: number, hash: string) => ({
  block: { number: START + block, timestamp: T0 + block * 2 },
  transaction: { hash },
});

const indexer = createTestIndexer();

describe("Turnstile handlers", () => {
  before(async () => {
    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [
            {
              contract: "TurnstileFactory",
              event: "EventCreated",
              params: {
                eventId: 3n,
                eventAddress: EVENT,
                organiser: ORGANISER,
                name: "Rooftop Sessions",
                venue: VENUE,
                startsAt: BigInt(T0 + 3 * 86_400),
              },
              ...at(10, "0xaa01"),
            },
            {
              contract: "TurnstileEvent",
              event: "TicketMinted",
              srcAddress: EVENT,
              params: { tokenId: 2001n, to: FAN, tier: 2n, faceValue: 0n, comp: false },
              ...at(11, "0xaa02"),
            },
            {
              contract: "TurnstileEvent",
              event: "TicketMinted",
              srcAddress: EVENT,
              params: { tokenId: 1n, to: TAKER, tier: 0n, faceValue: 20_000_000_000_000_000n, comp: false },
              ...at(11, "0xaa03"),
            },
            {
              contract: "TurnstileEvent",
              event: "DoorKeyBound",
              srcAddress: EVENT,
              params: {
                tokenId: 2001n,
                doorKey: KEY_FAN,
                previous: "0x0000000000000000000000000000000000000000",
                by: FAN,
              },
              ...at(12, "0xaa04"),
            },
            {
              contract: "TurnstileEvent",
              event: "Listed",
              srcAddress: EVENT,
              params: { tokenId: 2001n, seller: FAN, price: 0n },
              ...at(13, "0xaa05"),
            },
            // a resale: the seller's key is cleared, then the listing is filled — same transaction
            {
              contract: "TurnstileEvent",
              event: "DoorKeyCleared",
              srcAddress: EVENT,
              params: { tokenId: 2001n, previous: KEY_FAN },
              ...at(14, "0xaa06"),
            },
            {
              contract: "TurnstileEvent",
              event: "ListingFilled",
              srcAddress: EVENT,
              params: { tokenId: 2001n, seller: FAN, buyer: TAKER, price: 0n, fee: 0n },
              ...at(14, "0xaa06"),
            },
            {
              contract: "TurnstileEvent",
              event: "DoorKeyBound",
              srcAddress: EVENT,
              params: {
                tokenId: 2001n,
                doorKey: KEY_TAKER,
                previous: "0x0000000000000000000000000000000000000000",
                by: TAKER,
              },
              ...at(15, "0xaa07"),
            },
            {
              contract: "TurnstileEvent",
              event: "CheckedIn",
              srcAddress: EVENT,
              params: { tokenId: 2001n, holder: TAKER, doorKey: KEY_TAKER, gate: GATE, slot: 59_644_216n },
              ...at(16, "0xaa08"),
            },
          ],
        },
      },
    });
  });

  it("registers the clone from EventCreated and stores the night", async () => {
    assert.ok(indexer.chains[CHAIN].TurnstileEvent.addresses.includes(EVENT));
    const night = await indexer.Event.getOrThrow(EVENT);
    assert.equal(night.name, "Rooftop Sessions");
    assert.equal(night.eventId, 3n);
    assert.equal(night.organiser, ORGANISER);
    assert.equal(night.venue, VENUE);
    assert.equal(night.createdBlock, BigInt(START + 10));
  });

  it("keeps the organiser's counters: sold, inside, listed, resales, volume", async () => {
    const night = await indexer.Event.getOrThrow(EVENT);
    assert.equal(night.sold, 2);
    assert.equal(night.comps, 0);
    assert.equal(night.checkedIn, 1);
    assert.equal(night.listed, 0);
    assert.equal(night.resales, 1);
    assert.equal(night.primaryVolume, 20_000_000_000_000_000n);
    assert.equal(night.resaleVolume, 0n);
    assert.equal(night.resaleFees, 0n);
  });

  it("follows the seat through the resale: new holder, cleared key, rebound, admitted", async () => {
    const seat = await indexer.Ticket.getOrThrow(`${EVENT}-2001`);
    assert.equal(seat.holder_id, TAKER);
    assert.equal(seat.tier, 2);
    assert.equal(seat.handovers, 1);
    assert.equal(seat.listedPrice, undefined);
    assert.equal(seat.doorKey, KEY_TAKER);
    assert.equal(seat.checkedInAt, BigInt(T0 + 16 * 2));
    const stalls = await indexer.Ticket.getOrThrow(`${EVENT}-1`);
    assert.equal(stalls.holder_id, TAKER);
    assert.equal(stalls.doorKey, undefined);
    assert.equal(stalls.checkedInAt, undefined);
  });

  it("writes the attendance record behind the passport", async () => {
    const fan = await indexer.Fan.getOrThrow(FAN);
    assert.deepEqual(
      { tickets: fan.tickets, bought: fan.bought, checkIns: fan.checkIns },
      { tickets: 0, bought: 1, checkIns: 0 },
    );
    const taker = await indexer.Fan.getOrThrow(TAKER);
    assert.deepEqual(
      { tickets: taker.tickets, bought: taker.bought, checkIns: taker.checkIns },
      { tickets: 2, bought: 2, checkIns: 1 },
    );
    assert.equal(taker.firstSeenAt, BigInt(T0 + 11 * 2));
    assert.equal(taker.lastSeenAt, BigInt(T0 + 16 * 2));
  });

  it("tells the story of the seat in order, one row per thing that happened", async () => {
    const feed = (await indexer.Activity.getAll())
      .filter((a) => a.ticket_id === `${EVENT}-2001`)
      .sort((a, b) => Number(a.block - b.block) || a.id.localeCompare(b.id));
    assert.deepEqual(
      feed.map((a) => a.kind),
      ["MINT", "BIND", "LIST", "RESALE", "BIND", "CHECKIN"],
    );
    const resale = feed[3];
    assert.equal(resale?.actor, FAN);
    assert.equal(resale?.counterparty, TAKER);
    assert.equal(resale?.txHash, "0xaa06");
    const admitted = feed[5];
    assert.equal(admitted?.actor, TAKER);
    assert.equal(admitted?.counterparty, GATE);
    assert.equal(admitted?.event_id, EVENT);
  });
});
