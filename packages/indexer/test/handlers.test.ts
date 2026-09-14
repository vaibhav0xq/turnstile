// The whole life of a seat, replayed through the real handlers with simulated logs: created → bought →
// bound → listed → passed on → rebound → admitted. No chain, no Postgres.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, describe, it } from "node:test";
import { createTestIndexer } from "envio";
import "../src/handlers/turnstile.ts";
import { activityId, eventId, eventMinuteId, fanId, ticketId } from "../src/ids.ts";

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
const RESALE_PRICE = 5_000_000_000_000_000n;
const RESALE_FEE = 250_000_000_000_000n;
const EVENT_ID = eventId(CHAIN, EVENT);

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
              params: { tokenId: 2001n, seller: FAN, price: RESALE_PRICE },
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
              params: {
                tokenId: 2001n,
                seller: FAN,
                buyer: TAKER,
                price: RESALE_PRICE,
                fee: RESALE_FEE,
              },
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
    const night = await indexer.Event.getOrThrow(EVENT_ID);
    assert.equal(night.id, `${CHAIN}-${EVENT.toLowerCase()}`);
    assert.equal(night.chainId, CHAIN);
    assert.equal(night.address, EVENT.toLowerCase());
    assert.notEqual(eventId(143, EVENT), night.id);
    assert.equal(activityId(CHAIN, 123, 4), "10143-123-4");
    assert.equal(night.name, "Rooftop Sessions");
    assert.equal(night.eventId, 3n);
    assert.equal(night.organiser, ORGANISER.toLowerCase());
    assert.equal(night.venue, VENUE);
    assert.equal(night.createdBlock, BigInt(START + 10));
  });

  it("keeps the organiser's counters: sold, inside, listed, resales, volume", async () => {
    const night = await indexer.Event.getOrThrow(EVENT_ID);
    assert.equal(night.sold, 2);
    assert.equal(night.comps, 0);
    assert.equal(night.checkedIn, 1);
    assert.equal(night.listed, 0);
    assert.equal(night.resales, 1);
    assert.equal(night.primaryVolume, 20_000_000_000_000_000n);
    assert.equal(night.resaleVolume, RESALE_PRICE);
    assert.equal(night.resaleFees, RESALE_FEE);

    const stats = await indexer.Stats.getOrThrow(`${CHAIN}`);
    assert.deepEqual(
      {
        events: stats.events,
        sold: stats.sold,
        comps: stats.comps,
        checkedIn: stats.checkedIn,
        resales: stats.resales,
        fans: stats.fans,
      },
      { events: 1, sold: 2, comps: 0, checkedIn: 1, resales: 1, fans: 2 },
    );
    assert.equal(stats.primaryVolume, 20_000_000_000_000_000n);
    assert.equal(stats.resaleVolume, RESALE_PRICE);
    assert.equal(stats.resaleFees, RESALE_FEE);
    assert.equal(stats.lastActivityAt, BigInt(T0 + 16 * 2));
    assert.equal(stats.lastBlock, BigInt(START + 16));
  });

  it("follows the seat through the resale: new holder, cleared key, rebound, admitted", async () => {
    const seat = await indexer.Ticket.getOrThrow(ticketId(CHAIN, EVENT, 2001n));
    assert.equal(seat.id, `${CHAIN}-${EVENT.toLowerCase()}-2001`);
    assert.equal(seat.chainId, CHAIN);
    assert.equal(seat.holder_id, fanId(CHAIN, TAKER));
    assert.equal(seat.tier, 2);
    assert.equal(seat.handovers, 1);
    assert.equal(seat.listedPrice, undefined);
    assert.equal(seat.doorKey, KEY_TAKER.toLowerCase());
    assert.equal(seat.checkedInAt, BigInt(T0 + 16 * 2));
    const stalls = await indexer.Ticket.getOrThrow(ticketId(CHAIN, EVENT, 1n));
    assert.equal(stalls.holder_id, fanId(CHAIN, TAKER));
    assert.equal(stalls.doorKey, undefined);
    assert.equal(stalls.checkedInAt, undefined);
  });

  it("writes the attendance record behind the passport", async () => {
    const fan = await indexer.Fan.getOrThrow(fanId(CHAIN, FAN));
    assert.equal(fan.id, `${CHAIN}-${FAN.toLowerCase()}`);
    assert.equal(fan.chainId, CHAIN);
    assert.equal(fan.address, FAN.toLowerCase());
    assert.deepEqual(
      { tickets: fan.tickets, bought: fan.bought, checkIns: fan.checkIns },
      { tickets: 0, bought: 1, checkIns: 0 },
    );
    const taker = await indexer.Fan.getOrThrow(fanId(CHAIN, TAKER));
    assert.deepEqual(
      { tickets: taker.tickets, bought: taker.bought, checkIns: taker.checkIns },
      { tickets: 2, bought: 2, checkIns: 1 },
    );
    assert.equal(taker.firstSeenAt, BigInt(T0 + 11 * 2));
    assert.equal(taker.lastSeenAt, BigInt(T0 + 16 * 2));
  });

  it("tells the story of the seat in order, one row per thing that happened", async () => {
    const feed = (await indexer.Activity.getAll())
      .filter((a) => a.ticket_id === ticketId(CHAIN, EVENT, 2001n))
      .sort((a, b) => Number(a.block - b.block) || a.id.localeCompare(b.id));
    assert.deepEqual(
      feed.map((a) => a.kind),
      ["MINT", "BIND", "LIST", "RESALE", "BIND", "CHECKIN"],
    );
    const resale = feed[3];
    assert.equal(resale?.actor, FAN.toLowerCase());
    assert.equal(resale?.counterparty, TAKER.toLowerCase());
    assert.equal(resale?.txHash, "0xaa06");
    assert.equal(resale?.chainId, CHAIN);
    assert.match(resale?.id ?? "", new RegExp(`^${CHAIN}-${START + 14}-\\d+$`));
    const admitted = feed[5];
    assert.equal(admitted?.actor, TAKER.toLowerCase());
    assert.equal(admitted?.counterparty, GATE.toLowerCase());
    assert.equal(admitted?.event_id, EVENT_ID);

    const minute = await indexer.EventMinute.getOrThrow(eventMinuteId(EVENT_ID, T0 + 11 * 2));
    assert.equal(minute.event_id, EVENT_ID);
    assert.equal(minute.chainId, CHAIN);
    assert.equal(minute.minute, 1_789_399_980n);
    assert.equal(minute.mints, 2);
    assert.equal(minute.checkIns, 1);
    assert.equal(minute.resales, 1);
    assert.equal(minute.volume, 20_000_000_000_000_000n + RESALE_PRICE);

    const handover = await indexer.Handover.getOrThrow(resale?.id ?? "");
    assert.equal(handover.event_id, EVENT_ID);
    assert.equal(handover.ticket_id, ticketId(CHAIN, EVENT, 2001n));
    assert.equal(handover.seller, FAN.toLowerCase());
    assert.equal(handover.buyer, TAKER.toLowerCase());
    assert.equal(handover.price, RESALE_PRICE);
    assert.equal(handover.fee, RESALE_FEE);
  });
});
