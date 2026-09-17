// The four Live surfaces plus the sync probe, verbatim from docs/envio-hosted-handoff.md §3 ("Web app
// queries"). Every address variable is lower-cased by the hooks: the indexer stores addresses lower-cased.

import type { ActivityRow, MinuteRow } from "./model";

export interface EventRow {
  id: string;
  chainId: number;
  address: string;
  name: string;
  sold: number;
  comps: number;
  checkedIn: number;
  listed: number;
  resales: number;
  primaryVolume: string | number;
  resaleVolume: string | number;
  resaleFees: string | number;
}

export interface FanRow {
  id: string;
  chainId: number;
  address: string;
  tickets: number;
  bought: number;
  checkIns: number;
  firstSeenAt: string | number;
  lastSeenAt: string | number;
}

export interface StatsRow {
  events: number;
  sold: number;
  comps: number;
  checkedIn: number;
  resales: number;
  fans: number;
  primaryVolume: string | number;
  resaleVolume: string | number;
  resaleFees: string | number;
  lastActivityAt: string | number;
  lastBlock: string | number;
}

export interface OrganiserBoardData {
  Event: EventRow[];
  Activity: ActivityRow[];
  EventMinute: MinuteRow[];
}

export const ORGANISER_BOARD = /* GraphQL */ `
query OrganiserLiveBoard($chainId: Int!, $address: String!) {
  Event(where: { chainId: { _eq: $chainId }, address: { _eq: $address } }, limit: 1) {
    id chainId address name sold comps checkedIn listed resales primaryVolume resaleVolume resaleFees
  }
  Activity(
    where: { chainId: { _eq: $chainId }, event: { address: { _eq: $address } } }
    order_by: [{ timestamp: desc }, { block: desc }]
    limit: 20
  ) {
    id kind actor counterparty amount timestamp txHash
    ticket { tokenId tier }
  }
  EventMinute(
    where: { chainId: { _eq: $chainId }, event: { address: { _eq: $address } } }
    order_by: { minute: desc }
    limit: 30
  ) {
    minute mints checkIns resales volume
  }
}`;

export interface PassportHistoryData {
  Fan: FanRow[];
  Activity: ActivityRow[];
}

export const PASSPORT_HISTORY = /* GraphQL */ `
query PassportHistory($chainId: Int!, $address: String!) {
  Fan(where: { chainId: { _eq: $chainId }, address: { _eq: $address } }, limit: 1) {
    id chainId address tickets bought checkIns firstSeenAt lastSeenAt
  }
  Activity(
    where: {
      chainId: { _eq: $chainId }
      _or: [{ actor: { _eq: $address } }, { counterparty: { _eq: $address }, kind: { _eq: "RESALE" } }]
    }
    order_by: [{ timestamp: desc }, { block: desc }]
    limit: 60
  ) {
    id kind actor counterparty amount timestamp txHash
    event { name address }
    ticket { tokenId }
  }
}`;

export interface CityPulseData {
  Stats: StatsRow[];
  Event: Array<
    Pick<EventRow, "id" | "address" | "name" | "sold" | "comps" | "checkedIn" | "listed" | "resales">
  >;
  Activity: ActivityRow[];
}

export const CITY_PULSE = /* GraphQL */ `
query CityPulse($chainId: Int!, $addresses: [String!]!) {
  Stats(where: { chainId: { _eq: $chainId } }, limit: 1) {
    events sold comps checkedIn resales fans primaryVolume resaleVolume resaleFees lastActivityAt lastBlock
  }
  Event(where: { chainId: { _eq: $chainId }, address: { _in: $addresses } }, order_by: { startsAt: asc }) {
    id address name sold comps checkedIn listed resales
  }
  Activity(where: { chainId: { _eq: $chainId } }, order_by: [{ timestamp: desc }, { block: desc }], limit: 6) {
    id kind actor counterparty amount timestamp txHash
    event { name address }
    ticket { tokenId }
  }
}`;

export interface HandoverRow {
  id: string;
  seller: string;
  buyer: string;
  price: string | number;
  fee: string | number;
  timestamp: string | number;
  txHash: string;
  event: { name: string; address: string };
  ticket: { tokenId: string | number; tier: number };
}

export interface PulseEventRow extends EventRow {
  startsAt: string | number;
  createdAt: string | number;
}

export interface PulseData {
  Stats: StatsRow[];
  Event: PulseEventRow[];
  feed: ActivityRow[];
  doors: ActivityRow[];
  Handover: HandoverRow[];
  EventMinute: MinuteRow[];
}

/**
 * The public pulse page: the whole chain in one round trip. Totals, the nights the indexer knows, the last
 * thirty things that happened, the door feed, resale handovers and per-minute throughput since `$since`
 * (unix seconds, a BigInt column so it travels as `numeric`).
 */
export const PULSE = /* GraphQL */ `
query Pulse($chainId: Int!, $since: numeric!) {
  Stats(where: { chainId: { _eq: $chainId } }, limit: 1) {
    events sold comps checkedIn resales fans primaryVolume resaleVolume resaleFees lastActivityAt lastBlock
  }
  Event(where: { chainId: { _eq: $chainId } }, order_by: { createdAt: desc }, limit: 12) {
    id chainId address name startsAt createdAt sold comps checkedIn listed resales
    primaryVolume resaleVolume resaleFees
  }
  feed: Activity(
    where: { chainId: { _eq: $chainId } }
    order_by: [{ timestamp: desc }, { block: desc }]
    limit: 30
  ) {
    id kind actor counterparty amount timestamp txHash
    event { name address }
    ticket { tokenId tier }
  }
  doors: Activity(
    where: { chainId: { _eq: $chainId }, kind: { _eq: "CHECKIN" } }
    order_by: [{ timestamp: desc }, { block: desc }]
    limit: 8
  ) {
    id kind actor counterparty amount timestamp txHash
    event { name address }
    ticket { tokenId tier }
  }
  Handover(
    where: { chainId: { _eq: $chainId } }
    order_by: [{ timestamp: desc }, { block: desc }]
    limit: 6
  ) {
    id seller buyer price fee timestamp txHash
    event { name address }
    ticket { tokenId tier }
  }
  EventMinute(
    where: { chainId: { _eq: $chainId }, minute: { _gte: $since } }
    order_by: { minute: desc }
    limit: 2000
  ) {
    minute mints checkIns resales volume
  }
}`;

export interface TicketProvenanceData {
  Activity: ActivityRow[];
}

export const TICKET_PROVENANCE = /* GraphQL */ `
query TicketProvenance($chainId: Int!, $eventAddress: String!, $tokenId: numeric!) {
  Activity(
    where: {
      chainId: { _eq: $chainId }
      ticket: { tokenId: { _eq: $tokenId }, event: { address: { _eq: $eventAddress } } }
    }
    order_by: [{ timestamp: asc }, { block: asc }]
  ) {
    id kind actor counterparty amount timestamp block txHash
    ticket { tokenId tier }
  }
}`;

export interface IndexerSyncData {
  chain_metadata: Array<{
    chain_id: number;
    block_height: number | string | null;
    latest_processed_block: number | string | null;
  }>;
}

/** Envio exposes its per-chain progress as the `chain_metadata` view; this is the freshness chip's source. */
export const INDEXER_SYNC = /* GraphQL */ `
query IndexerSync($chainId: Int!) {
  chain_metadata(where: { chain_id: { _eq: $chainId } }) {
    chain_id block_height latest_processed_block
  }
}`;
