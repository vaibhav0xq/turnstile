// Organiser form → `TurnstileFactory.createEvent` arguments. Pure, so the rules (seat numbering, caps,
// symbol derivation, timing) are unit-tested without a browser or a chain.
import { type Address, type Hex, parseEther } from "viem";

export type VenueChoice = "club" | "theatre";

export interface TierDraft {
  /** Stable React key for the form row; not part of the on-chain tier. */
  key: number;
  name: string;
  /** Face value in MON, decimal text as typed ("0", "0.05"). */
  priceMon: string;
  seatCount: number;
}

export interface EventDraft {
  name: string;
  venue: VenueChoice;
  /** Doors open, unix seconds. Resale closes here. */
  startsAt: number;
  /** Primary sale closes, unix seconds; 0 → doors. */
  salesEndAt: number;
  /** Resale ceiling as a percentage of face (110 = 110 %). 0 disables resale. */
  resaleCapPct: number;
  /** Organiser's cut of every resale, percent. */
  resaleFeePct: number;
  tiers: TierDraft[];
}

export interface EventConfigArg {
  name: string;
  symbol: string;
  venue: Hex;
  startsAt: bigint;
  salesEndAt: bigint;
  resaleCapBps: number;
  resaleFeeBps: number;
  baseURI: string;
}

export interface TierArg {
  name: string;
  price: bigint;
  firstSeat: number;
  seatCount: number;
}

export interface CreateEventArgs {
  config: EventConfigArg;
  tiers: TierArg[];
  gates: Address[];
}

/** Each tier gets its own thousand: 1…, 1001…, 2001… — matches the demo events and reads well on tickets. */
export const TIER_STRIDE = 1000;
export const MAX_TIERS = 6;
export const MAX_SEATS_PER_TIER = 999;

export function defaultDraft(now = Date.now()): EventDraft {
  const doors = new Date(now + 3 * 86_400_000);
  doors.setMinutes(0, 0, 0);
  return {
    name: "",
    venue: "club",
    startsAt: Math.floor(doors.getTime() / 1000),
    salesEndAt: 0,
    resaleCapPct: 110,
    resaleFeePct: 5,
    tiers: [{ key: 1, name: "General Admission", priceMon: "0", seatCount: 200 }],
  };
}

/** "Neon Night at Metropolis" → "NNAM"; falls back to "TSTL" when nothing usable is left. */
export function deriveSymbol(name: string): string {
  const letters = name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 6);
  return letters.length >= 2 ? letters : "TSTL";
}

export interface DraftIssue {
  field: "name" | "startsAt" | "salesEndAt" | "resale" | `tier.${number}`;
  message: string;
}

export function validateDraft(draft: EventDraft, now = Date.now()): DraftIssue[] {
  const issues: DraftIssue[] = [];
  const name = draft.name.trim();
  if (name.length < 3) issues.push({ field: "name", message: "Give the night a name (3+ characters)." });
  if (name.length > 64) issues.push({ field: "name", message: "Keep the name under 64 characters." });
  if (draft.startsAt * 1000 <= now + 10 * 60_000)
    issues.push({ field: "startsAt", message: "Doors must open at least ten minutes from now." });
  if (draft.salesEndAt !== 0 && draft.salesEndAt > draft.startsAt)
    issues.push({ field: "salesEndAt", message: "Sales can't close after doors open." });
  if (draft.resaleCapPct < 0 || draft.resaleCapPct > 1000)
    issues.push({ field: "resale", message: "Resale cap must be between 0 % (off) and 1000 %." });
  if (draft.resaleFeePct < 0 || draft.resaleFeePct > 100)
    issues.push({ field: "resale", message: "Resale fee must be between 0 % and 100 %." });
  if (draft.tiers.length === 0) issues.push({ field: "tier.0", message: "Add at least one tier." });
  if (draft.tiers.length > MAX_TIERS)
    issues.push({ field: `tier.${MAX_TIERS}`, message: `At most ${MAX_TIERS} tiers.` });
  draft.tiers.forEach((tier, index) => {
    const field = `tier.${index}` as const;
    if (tier.name.trim().length === 0) issues.push({ field, message: "Every tier needs a name." });
    if (!Number.isInteger(tier.seatCount) || tier.seatCount < 1 || tier.seatCount > MAX_SEATS_PER_TIER)
      issues.push({ field, message: `Seats per tier: 1 to ${MAX_SEATS_PER_TIER}.` });
    if (parseMon(tier.priceMon) === null)
      issues.push({ field, message: "Price must be a MON amount like 0 or 0.05." });
  });
  return issues;
}

/** Decimal MON text → wei, or null when it is not a non-negative amount that fits a uint96. */
export function parseMon(text: string): bigint | null {
  const trimmed = text.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(trimmed)) return null;
  const wei = parseEther(trimmed);
  return wei < 2n ** 96n ? wei : null;
}

export interface BuildOptions {
  venueIds: Record<VenueChoice, Hex>;
  /** Gate signer(s) that may check people in from day one — the relayer's gate key on this deployment. */
  gates: Address[];
  /** `tokenURI` prefix; the token id is appended in decimal. */
  baseURI: string;
}

/** Throws on an invalid draft; call `validateDraft` first to show issues inline. */
export function buildCreateEventArgs(
  draft: EventDraft,
  options: BuildOptions,
  now = Date.now(),
): CreateEventArgs {
  const issues = validateDraft(draft, now);
  if (issues.length > 0) throw new Error(issues[0]?.message ?? "Invalid event");
  const tiers: TierArg[] = draft.tiers.map((tier, index) => ({
    name: tier.name.trim(),
    price: parseMon(tier.priceMon) ?? 0n,
    firstSeat: index * TIER_STRIDE + 1,
    seatCount: tier.seatCount,
  }));
  const name = draft.name.trim();
  return {
    config: {
      name,
      symbol: deriveSymbol(name),
      venue: options.venueIds[draft.venue],
      startsAt: BigInt(draft.startsAt),
      salesEndAt: BigInt(draft.salesEndAt),
      resaleCapBps: Math.round(draft.resaleCapPct * 100),
      resaleFeeBps: Math.round(draft.resaleFeePct * 100),
      baseURI: options.baseURI,
    },
    tiers,
    gates: options.gates,
  };
}

/** Fallback gas for `createEvent` when the node will not estimate: clone + initialize + tiers + gate. */
export function createEventGas(draft: EventDraft): bigint {
  return 650_000n + BigInt(draft.tiers.length) * 120_000n;
}

/** Where a new event's metadata will live: `<api>/api/events/<eventId>/tickets/<tokenId>`. */
export function metadataBaseURI(apiOrigin: string, eventId: bigint): string {
  return `${apiOrigin.replace(/\/$/, "")}/api/events/${eventId}/tickets/`;
}
