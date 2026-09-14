// Turnstile handlers: one factory, many event clones registered as they are created.
//
// Everything the product shows without touching an RPC comes from here — the organiser's sold / inside
// counts, the live door feed, and the attendance record behind a fan's passport. Handlers run twice under
// HyperIndex's preload optimisation, so they only read through `context` and never keep state outside it.

import {
  type Activity,
  type Event,
  type EventMinute,
  type Fan,
  type Handover,
  indexer,
  type Stats,
  type Ticket,
} from "envio";
import { activityId, addr, eventId, eventMinuteId, fanId, handoverId, statsId, ticketId } from "../ids.ts";

type Meta = {
  chainId: number;
  logIndex: number;
  srcAddress: string;
  block: { number: number; timestamp: number };
  transaction: { hash: string };
};

const activity = (
  e: Meta,
  ticket: Ticket,
  kind: Activity["kind"],
  actor: string,
  counterparty: string | undefined,
  amount: bigint,
): Activity => ({
  id: activityId(e.chainId, e.block.number, e.logIndex),
  event_id: eventId(e.chainId, e.srcAddress),
  ticket_id: ticket.id,
  chainId: e.chainId,
  kind,
  actor: addr(actor),
  counterparty: counterparty === undefined ? undefined : addr(counterparty),
  amount,
  timestamp: BigInt(e.block.timestamp),
  block: BigInt(e.block.number),
  txHash: e.transaction.hash,
});

const seen = (fan: Fan, at: number): Fan => ({ ...fan, lastSeenAt: BigInt(at) });

const baseStats = (e: Meta): Stats => ({
  id: statsId(e.chainId),
  chainId: e.chainId,
  events: 0,
  sold: 0,
  comps: 0,
  checkedIn: 0,
  resales: 0,
  fans: 0,
  primaryVolume: 0n,
  resaleVolume: 0n,
  resaleFees: 0n,
  lastActivityAt: BigInt(e.block.timestamp),
  lastBlock: BigInt(e.block.number),
});

const getStats = async (context: { Stats: { get(id: string): Promise<Stats | undefined> } }, e: Meta) =>
  (await context.Stats.get(statsId(e.chainId))) ?? baseStats(e);

const touchedStats = (stats: Stats, e: Meta): Stats => ({
  ...stats,
  lastActivityAt: BigInt(e.block.timestamp),
  lastBlock: BigInt(e.block.number),
});

const getMinute = async (
  context: { EventMinute: { get(id: string): Promise<EventMinute | undefined> } },
  e: Meta,
): Promise<EventMinute> => {
  const nightId = eventId(e.chainId, e.srcAddress);
  return (
    (await context.EventMinute.get(eventMinuteId(nightId, e.block.timestamp))) ?? {
      id: eventMinuteId(nightId, e.block.timestamp),
      event_id: nightId,
      chainId: e.chainId,
      minute: BigInt(Math.floor(e.block.timestamp / 60) * 60),
      mints: 0,
      checkIns: 0,
      resales: 0,
      volume: 0n,
    }
  );
};

const getFan = async (
  context: { Fan: { get(id: string): Promise<Fan | undefined> } },
  e: Meta,
  address: string,
) => {
  const id = fanId(e.chainId, address);
  const existing = await context.Fan.get(id);
  return {
    fan:
      existing ??
      ({
        id,
        chainId: e.chainId,
        address: addr(address),
        tickets: 0,
        bought: 0,
        checkIns: 0,
        firstSeenAt: BigInt(e.block.timestamp),
        lastSeenAt: BigInt(e.block.timestamp),
      } satisfies Fan),
    created: existing === undefined,
  };
};

// ------------------------------------------------------------------------------------------- factory

indexer.contractRegister(
  { contract: "TurnstileFactory", event: "EventCreated" },
  async ({ event, context }) => {
    context.chain.TurnstileEvent.add(event.params.eventAddress);
  },
);

indexer.onEvent({ contract: "TurnstileFactory", event: "EventCreated" }, async ({ event, context }) => {
  const id = eventId(event.chainId, event.params.eventAddress);
  const night: Event = {
    id,
    chainId: event.chainId,
    address: addr(event.params.eventAddress),
    eventId: event.params.eventId,
    organiser: addr(event.params.organiser),
    name: event.params.name,
    venue: event.params.venue,
    startsAt: event.params.startsAt,
    createdAt: BigInt(event.block.timestamp),
    createdBlock: BigInt(event.block.number),
    sold: 0,
    comps: 0,
    checkedIn: 0,
    listed: 0,
    resales: 0,
    primaryVolume: 0n,
    resaleVolume: 0n,
    resaleFees: 0n,
  };
  context.Event.set(night);
  const stats = (await context.Stats.get(statsId(event.chainId))) ?? baseStats(event);
  context.Stats.set({
    ...touchedStats(stats, event),
    events: stats.events + 1,
  });
});

// --------------------------------------------------------------------------------------------- seats

indexer.onEvent({ contract: "TurnstileEvent", event: "TicketMinted" }, async ({ event, context }) => {
  const { tokenId, to, tier, faceValue, comp } = event.params;
  const night = await context.Event.getOrThrow(eventId(event.chainId, event.srcAddress));
  const { fan, created } = await getFan(context, event, to);
  const stats = await getStats(context, event);
  const minute = await getMinute(context, event);
  const paid = comp ? 0n : faceValue;

  const ticket: Ticket = {
    id: ticketId(event.chainId, event.srcAddress, tokenId),
    event_id: night.id,
    chainId: event.chainId,
    tokenId,
    tier: Number(tier),
    holder_id: fan.id,
    faceValue,
    comp,
    doorKey: undefined,
    listedPrice: undefined,
    checkedInAt: undefined,
    mintedAt: BigInt(event.block.timestamp),
    handovers: 0,
  };

  context.Ticket.set(ticket);
  context.Event.set({
    ...night,
    sold: night.sold + 1,
    comps: night.comps + (comp ? 1 : 0),
    primaryVolume: night.primaryVolume + paid,
  });
  context.Fan.set({
    ...seen(fan, event.block.timestamp),
    tickets: fan.tickets + 1,
    bought: fan.bought + 1,
  });
  context.Stats.set({
    ...touchedStats(stats, event),
    sold: stats.sold + 1,
    comps: stats.comps + (comp ? 1 : 0),
    fans: stats.fans + (created ? 1 : 0),
    primaryVolume: stats.primaryVolume + paid,
  });
  context.EventMinute.set({
    ...minute,
    mints: minute.mints + 1,
    volume: minute.volume + paid,
  });
  context.Activity.set(activity(event, ticket, "MINT", to, undefined, paid));
});

indexer.onEvent({ contract: "TurnstileEvent", event: "DoorKeyBound" }, async ({ event, context }) => {
  const ticket = await context.Ticket.getOrThrow(
    ticketId(event.chainId, event.srcAddress, event.params.tokenId),
  );
  const bound: Ticket = { ...ticket, doorKey: addr(event.params.doorKey) };
  context.Ticket.set(bound);
  context.Activity.set(activity(event, bound, "BIND", event.params.by, event.params.doorKey, 0n));
  const stats = await getStats(context, event);
  context.Stats.set(touchedStats(stats, event));
});

// Emitted only inside a resale, right before ListingFilled: the seat stops answering to the seller's key.
// The RESALE row tells that story, so this one updates the seat quietly.
indexer.onEvent({ contract: "TurnstileEvent", event: "DoorKeyCleared" }, async ({ event, context }) => {
  const ticket = await context.Ticket.getOrThrow(
    ticketId(event.chainId, event.srcAddress, event.params.tokenId),
  );
  context.Ticket.set({ ...ticket, doorKey: undefined });
});

// -------------------------------------------------------------------------------------------- resale

indexer.onEvent({ contract: "TurnstileEvent", event: "Listed" }, async ({ event, context }) => {
  const ticket = await context.Ticket.getOrThrow(
    ticketId(event.chainId, event.srcAddress, event.params.tokenId),
  );
  const night = await context.Event.getOrThrow(eventId(event.chainId, event.srcAddress));
  const wasListed = ticket.listedPrice !== undefined;
  const listed: Ticket = { ...ticket, listedPrice: event.params.price };
  context.Ticket.set(listed);
  context.Event.set({ ...night, listed: night.listed + (wasListed ? 0 : 1) });
  context.Activity.set(activity(event, listed, "LIST", event.params.seller, undefined, event.params.price));
  const stats = await getStats(context, event);
  context.Stats.set(touchedStats(stats, event));
});

indexer.onEvent({ contract: "TurnstileEvent", event: "Delisted" }, async ({ event, context }) => {
  const ticket = await context.Ticket.getOrThrow(
    ticketId(event.chainId, event.srcAddress, event.params.tokenId),
  );
  if (ticket.listedPrice === undefined) return; // defensive: the contract never emits this for an unlisted seat
  const night = await context.Event.getOrThrow(eventId(event.chainId, event.srcAddress));
  const holder = await context.Fan.getOrThrow(ticket.holder_id);
  const delisted: Ticket = { ...ticket, listedPrice: undefined };
  context.Ticket.set(delisted);
  context.Event.set({ ...night, listed: Math.max(0, night.listed - 1) });
  context.Activity.set(activity(event, delisted, "DELIST", holder.address, undefined, 0n));
  const stats = await getStats(context, event);
  context.Stats.set(touchedStats(stats, event));
});

indexer.onEvent({ contract: "TurnstileEvent", event: "ListingFilled" }, async ({ event, context }) => {
  const { tokenId, seller, buyer, price, fee } = event.params;
  const ticket = await context.Ticket.getOrThrow(ticketId(event.chainId, event.srcAddress, tokenId));
  const night = await context.Event.getOrThrow(eventId(event.chainId, event.srcAddress));
  const from = await context.Fan.getOrThrow(fanId(event.chainId, seller));
  const { fan: to, created } = await getFan(context, event, buyer);
  const stats = await getStats(context, event);
  const minute = await getMinute(context, event);

  const handed: Ticket = {
    ...ticket,
    holder_id: to.id,
    handovers: ticket.handovers + 1,
  };
  const cleared: Ticket = { ...handed, doorKey: undefined, listedPrice: undefined };

  context.Ticket.set(cleared);
  context.Event.set({
    ...night,
    listed: Math.max(0, night.listed - 1),
    resales: night.resales + 1,
    resaleVolume: night.resaleVolume + price,
    resaleFees: night.resaleFees + fee,
  });
  context.Fan.set({ ...seen(from, event.block.timestamp), tickets: Math.max(0, from.tickets - 1) });
  context.Fan.set({ ...seen(to, event.block.timestamp), tickets: to.tickets + 1, bought: to.bought + 1 });
  context.Stats.set({
    ...touchedStats(stats, event),
    resales: stats.resales + 1,
    fans: stats.fans + (created ? 1 : 0),
    resaleVolume: stats.resaleVolume + price,
    resaleFees: stats.resaleFees + fee,
  });
  context.EventMinute.set({
    ...minute,
    resales: minute.resales + 1,
    volume: minute.volume + price,
  });
  const handover: Handover = {
    id: handoverId(event.chainId, event.block.number, event.logIndex),
    event_id: night.id,
    ticket_id: ticket.id,
    chainId: event.chainId,
    seller: addr(seller),
    buyer: addr(buyer),
    price,
    fee,
    timestamp: BigInt(event.block.timestamp),
    block: BigInt(event.block.number),
    txHash: event.transaction.hash,
  };
  context.Handover.set(handover);
  context.Activity.set(activity(event, cleared, "RESALE", seller, buyer, price));
});

// ---------------------------------------------------------------------------------------------- door

indexer.onEvent({ contract: "TurnstileEvent", event: "CheckedIn" }, async ({ event, context }) => {
  const { tokenId, holder, gate } = event.params;
  const ticket = await context.Ticket.getOrThrow(ticketId(event.chainId, event.srcAddress, tokenId));
  const night = await context.Event.getOrThrow(eventId(event.chainId, event.srcAddress));
  const fan = await context.Fan.getOrThrow(fanId(event.chainId, holder));
  const stats = await getStats(context, event);
  const minute = await getMinute(context, event);
  const inside: Ticket = { ...ticket, checkedInAt: BigInt(event.block.timestamp) };
  context.Ticket.set(inside);
  context.Event.set({ ...night, checkedIn: night.checkedIn + 1 });
  context.Fan.set({ ...seen(fan, event.block.timestamp), checkIns: fan.checkIns + 1 });
  context.Stats.set({
    ...touchedStats(stats, event),
    checkedIn: stats.checkedIn + 1,
  });
  context.EventMinute.set({ ...minute, checkIns: minute.checkIns + 1 });
  context.Activity.set(activity(event, inside, "CHECKIN", holder, gate, 0n));
});
