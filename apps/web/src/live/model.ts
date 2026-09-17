// Pure helpers for the Live layer (the Envio-indexed history). No DOM, no fetch — unit-tested.

export type ActivityKind = "MINT" | "BIND" | "UNBIND" | "LIST" | "DELIST" | "RESALE" | "CHECKIN";

/** Hasura serialises the indexer's BigInt (numeric) columns as strings; small Ints arrive as numbers. */
export function big(value: string | number | bigint | null | undefined): bigint {
  if (value === null || value === undefined || value === "") return 0n;
  if (typeof value === "bigint") return value;
  return BigInt(typeof value === "number" ? Math.trunc(value) : value.trim());
}

export function num(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  return typeof value === "number" ? value : Number(value);
}

export type FreshnessTone = "green" | "amber" | "red" | "muted";

export interface Freshness {
  tone: FreshnessTone;
  label: string;
  lag: number | null;
}

/** Monad's block cadence. The chip judges lag in seconds, so three blocks (≈1 s) never reads as "behind". */
export const MONAD_BLOCK_MS = 400;
/** Up to this much behind the relayer's head is "in sync": one poll's worth of ordinary indexing latency. */
export const IN_SYNC_MS = 5_000;
/** Beyond this the chip turns red: the indexer is stalled, not merely a few seconds behind. */
export const BEHIND_MS = 60_000;

/**
 * How far the indexer trails the chain the relayer sees. `head` comes from `/api/health` (the relayer's own
 * RPC); `indexed` is the indexer's latest processed block. Either may be unknown; say so instead of guessing.
 * The label names Envio: the chip is the one place every Live surface says where its rows come from. Tones
 * are set by time at `blockMs` per block; the label keeps the block count because that is what both sides
 * actually report.
 */
export function freshness(indexed: bigint | null, head: bigint | null, blockMs = MONAD_BLOCK_MS): Freshness {
  if (indexed === null) return { tone: "muted", label: "Envio · waiting", lag: null };
  if (head === null) return { tone: "muted", label: `Envio · #${indexed}`, lag: null };
  // the indexer can be a block ahead of the relayer's RPC node; that is sync, not negative lag
  const lag = Math.max(0, Number(head - indexed));
  const behindMs = lag * blockMs;
  if (behindMs <= IN_SYNC_MS) return { tone: "green", label: "Envio · in sync", lag };
  const label = `Envio · ${lag} blocks behind`;
  return { tone: behindMs <= BEHIND_MS ? "amber" : "red", label, lag };
}

/** "≈ 1.2 s" / "≈ 48 s" / "≈ 3 min" — the lag in time, for the chip's hover text. */
export function lagAsTime(lag: number, blockMs = MONAD_BLOCK_MS): string {
  const s = (lag * blockMs) / 1000;
  if (s < 10) return `≈ ${s.toFixed(1)} s`;
  if (s < 120) return `≈ ${Math.round(s)} s`;
  return `≈ ${Math.round(s / 60)} min`;
}

export const KIND_LABEL: Record<ActivityKind, string> = {
  MINT: "took the seat",
  BIND: "bound a door key",
  UNBIND: "cleared the door key",
  LIST: "listed for resale",
  DELIST: "took it off the market",
  RESALE: "changed hands",
  CHECKIN: "walked in",
};

export function kindLabel(kind: string): string {
  return (KIND_LABEL as Record<string, string>)[kind] ?? kind.toLowerCase();
}

export const KIND_TONE: Record<ActivityKind, "amber" | "cyan" | "green" | "muted"> = {
  MINT: "amber",
  BIND: "cyan",
  UNBIND: "muted",
  LIST: "cyan",
  DELIST: "muted",
  RESALE: "cyan",
  CHECKIN: "green",
};

export function kindTone(kind: string): "amber" | "cyan" | "green" | "muted" {
  return (KIND_TONE as Record<string, "amber" | "cyan" | "green" | "muted">)[kind] ?? "muted";
}

/** "just now", "4 min ago", "3 h ago", "2 d ago" — the feed never needs more than that. */
export function timeAgo(unixSeconds: number, nowMs: number): string {
  const s = Math.max(0, Math.floor(nowMs / 1000) - unixSeconds);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export interface MinuteRow {
  minute: string | number;
  mints: number;
  checkIns: number;
  resales: number;
}

export interface MinuteBucket {
  minute: number;
  mints: number;
  checkIns: number;
  resales: number;
}

/**
 * The last `count` minute buckets ending at the current minute, gaps filled with zeros, oldest first. Rows
 * that share a minute are summed: one event's board sees one row per minute, the chain-wide pulse sees one
 * per event.
 */
export function minuteSeries(rows: readonly MinuteRow[], nowMs: number, count = 30): MinuteBucket[] {
  const end = Math.floor(nowMs / 60_000) * 60;
  const byMinute = new Map<number, MinuteBucket>();
  for (const row of rows) {
    const minute = num(row.minute);
    const bucket = byMinute.get(minute) ?? { minute, mints: 0, checkIns: 0, resales: 0 };
    bucket.mints += num(row.mints);
    bucket.checkIns += num(row.checkIns);
    bucket.resales += num(row.resales);
    byMinute.set(minute, bucket);
  }
  const out: MinuteBucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const minute = end - i * 60;
    out.push(byMinute.get(minute) ?? { minute, mints: 0, checkIns: 0, resales: 0 });
  }
  return out;
}

export interface ActivityRow {
  id: string;
  kind: string;
  actor: string;
  counterparty?: string | null;
  amount: string | number;
  timestamp: string | number;
  txHash: string;
  event?: { name: string; address: string } | null;
  ticket?: { tokenId: string | number; tier?: number } | null;
}

/**
 * One line of the feed. `viewer` (lower-cased) turns "0x12…ab took the seat" into "You took the seat";
 * on a resale the actor is the seller and the counterparty the buyer, so the viewer can be either side.
 */
export function describeActivity(row: ActivityRow, viewer?: string | null): string {
  const me = viewer?.toLowerCase() ?? null;
  const who = (address: string) => (me && address.toLowerCase() === me ? "You" : short(address));
  const seat = row.ticket ? `seat ${row.ticket.tokenId}` : "a seat";
  if (row.kind === "RESALE") {
    const buyer = row.counterparty ?? "";
    if (me && buyer.toLowerCase() === me) return `You took over ${seat} from ${short(row.actor)}`;
    return `${who(row.actor)} handed ${seat} to ${buyer ? who(buyer) : "a new holder"}`;
  }
  if (row.kind === "CHECKIN") return `${who(row.actor)} walked in with ${seat}`;
  return `${who(row.actor)} ${kindLabel(row.kind)} · ${seat}`;
}

function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export interface ProvenanceSummary {
  minted: number | null; // unix seconds
  handovers: number;
  checkedIn: number | null;
  bound: boolean;
}

/** Roll a seat's activity (oldest first) into the one-line summary shown above the timeline. */
export function summariseProvenance(rows: readonly ActivityRow[]): ProvenanceSummary {
  let minted: number | null = null;
  let handovers = 0;
  let checkedIn: number | null = null;
  let bound = false;
  for (const row of rows) {
    const at = num(row.timestamp);
    if (row.kind === "MINT" && minted === null) minted = at;
    else if (row.kind === "RESALE") {
      handovers += 1;
      bound = false;
    } else if (row.kind === "CHECKIN") checkedIn = at;
    else if (row.kind === "BIND") bound = true;
    else if (row.kind === "UNBIND") bound = false;
  }
  return { minted, handovers, checkedIn, bound };
}
