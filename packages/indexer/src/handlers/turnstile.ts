// Turnstile handlers: one factory, many event clones registered as they are created.
//
// Everything the product shows without touching an RPC comes from here — the organiser's sold / inside
// counts, the live door feed, and the attendance record behind a fan's passport. Handlers run twice under
// HyperIndex's preload optimisation, so they only read through `context` and never keep state outside it.

import { type Activity, type Event, type Fan, indexer, type Ticket } from "envio";

const ticketId = (eventAddress: string, tokenId: bigint) => `${eventAddress}-${tokenId}`;

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
  id: `${e.chainId}-${e.block.number}-${e.logIndex}`,
  event_id: e.srcAddress,
  ticket_id: ticket.id,
  kind,
  actor,
  counterparty,
  amount,
  timestamp: BigInt(e.block.timestamp),
  block: BigInt(e.block.number),
  txHash: e.transaction.hash,
});

const seen = (fan: Fan, at: number): Fan => ({ ...fan, lastSeenAt: BigInt(at) });

// ------------------------------------------------------------------------------------------- factory

indexer.contractRegister(
  { contract: "TurnstileFactory", event: "EventCreated" },
  async ({ event, context }) => {
    context.chain.TurnstileEvent.add(event.params.eventAddress);
  },
);

indexer.onEvent({ contract: "TurnstileFactory", event: "EventCreated" }, async ({ event, context }) => {
  const night: Event = {
    id: event.params.eventAddress,
    eventId: event.params.eventId,
    organiser: event.params.organiser,
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
});

// --------------------------------------------------------------------------------------------- seats

indexer.onEvent({ contract: "TurnstileEvent", event: "TicketMinted" }, async ({ event, context }) => {
  const { tokenId, to, tier, faceValue, comp } = event.params;
  const night = await context.Event.getOrThrow(event.srcAddress);
  const fan = await context.Fan.getOrCreate({
    id: to,
    tickets: 0,
    bought: 0,
    checkIns: 0,
    firstSeenAt: BigInt(event.block.timestamp),
    lastSeenAt: BigInt(event.block.timestamp),
  });
  const paid = comp ? 0n : faceValue;

  const ticket: Ticket = {
    id: ticketId(event.srcAddress, tokenId),
    event_id: event.srcAddress,
    tokenId,
    tier: Number(tier),
    holder_id: to,
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
  context.Activity.set(activity(event, ticket, "MINT", to, undefined, paid));
});

indexer.onEvent({ contract: "TurnstileEvent", event: "DoorKeyBound" }, async ({ event, context }) => {
  const ticket = await context.Ticket.getOrThrow(ticketId(event.srcAddress, event.params.tokenId));
  const bound: Ticket = { ...ticket, doorKey: event.params.doorKey };
  context.Ticket.set(bound);
  context.Activity.set(activity(event, bound, "BIND", ticket.holder_id, event.params.doorKey, 0n));
});

// Emitted only inside a resale, right before ListingFilled: the seat stops answering to the seller's key.
// The RESALE row tells that story, so this one updates the seat quietly.
indexer.onEvent({ contract: "TurnstileEvent", event: "DoorKeyCleared" }, async ({ event, context }) => {
  const ticket = await context.Ticket.getOrThrow(ticketId(event.srcAddress, event.params.tokenId));
  context.Ticket.set({ ...ticket, doorKey: undefined });
});

// -------------------------------------------------------------------------------------------- resale

indexer.onEvent({ contract: "TurnstileEvent", event: "Listed" }, async ({ event, context }) => {
  const ticket = await context.Ticket.getOrThrow(ticketId(event.srcAddress, event.params.tokenId));
  const night = await context.Event.getOrThrow(event.srcAddress);
  const wasListed = ticket.listedPrice !== undefined;
  const listed: Ticket = { ...ticket, listedPrice: event.params.price };
  context.Ticket.set(listed);
  context.Event.set({ ...night, listed: night.listed + (wasListed ? 0 : 1) });
  context.Activity.set(activity(event, listed, "LIST", event.params.seller, undefined, event.params.price));
});

indexer.onEvent({ contract: "TurnstileEvent", event: "Delisted" }, async ({ event, context }) => {
  const ticket = await context.Ticket.getOrThrow(ticketId(event.srcAddress, event.params.tokenId));
  if (ticket.listedPrice === undefined) return; // defensive: the contract never emits this for an unlisted seat
  const night = await context.Event.getOrThrow(event.srcAddress);
  const delisted: Ticket = { ...ticket, listedPrice: undefined };
  context.Ticket.set(delisted);
  context.Event.set({ ...night, listed: Math.max(0, night.listed - 1) });
  context.Activity.set(activity(event, delisted, "DELIST", ticket.holder_id, undefined, 0n));
});

indexer.onEvent({ contract: "TurnstileEvent", event: "ListingFilled" }, async ({ event, context }) => {
  const { tokenId, seller, buyer, price, fee } = event.params;
  const ticket = await context.Ticket.getOrThrow(ticketId(event.srcAddress, tokenId));
  const night = await context.Event.getOrThrow(event.srcAddress);
  const from = await context.Fan.getOrThrow(seller);
  const to = await context.Fan.getOrCreate({
    id: buyer,
    tickets: 0,
    bought: 0,
    checkIns: 0,
    firstSeenAt: BigInt(event.block.timestamp),
    lastSeenAt: BigInt(event.block.timestamp),
  });

  const handed: Ticket = {
    ...ticket,
    holder_id: buyer,
    doorKey: undefined, // cleared on chain in the same transaction (DoorKeyCleared) — keep the row honest either way
    listedPrice: undefined,
    handovers: ticket.handovers + 1,
  };

  context.Ticket.set(handed);
  context.Event.set({
    ...night,
    listed: Math.max(0, night.listed - 1),
    resales: night.resales + 1,
    resaleVolume: night.resaleVolume + price,
    resaleFees: night.resaleFees + fee,
  });
  context.Fan.set({ ...seen(from, event.block.timestamp), tickets: Math.max(0, from.tickets - 1) });
  context.Fan.set({ ...seen(to, event.block.timestamp), tickets: to.tickets + 1, bought: to.bought + 1 });
  context.Activity.set(activity(event, handed, "RESALE", seller, buyer, price));
});

// ---------------------------------------------------------------------------------------------- door

indexer.onEvent({ contract: "TurnstileEvent", event: "CheckedIn" }, async ({ event, context }) => {
  const { tokenId, holder, gate } = event.params;
  const ticket = await context.Ticket.getOrThrow(ticketId(event.srcAddress, tokenId));
  const night = await context.Event.getOrThrow(event.srcAddress);
  const fan = await context.Fan.getOrThrow(holder);
  const inside: Ticket = { ...ticket, checkedInAt: BigInt(event.block.timestamp) };
  context.Ticket.set(inside);
  context.Event.set({ ...night, checkedIn: night.checkedIn + 1 });
  context.Fan.set({ ...seen(fan, event.block.timestamp), checkIns: fan.checkIns + 1 });
  context.Activity.set(activity(event, inside, "CHECKIN", holder, gate, 0n));
});
