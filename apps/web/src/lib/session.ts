import { SLOT_MS } from "@turnstile/identity";

/** A door key session with less than this left shows a renew line, so the code does not die at the door. */
export const DOOR_WARN_MS = 5 * 60_000;

export type SessionPhase = "live" | "ending" | "expired";

/** Where a session (account or door key) stands at `now`. */
export function sessionPhase(now: number, expiresAt: number, warnMs = DOOR_WARN_MS): SessionPhase {
  if (now >= expiresAt) return "expired";
  return expiresAt - now <= warnMs ? "ending" : "live";
}

/**
 * The gate accepts the current slot and the one before it (identity `isSlotAcceptable`), so a code stays
 * good for one slot after its own ends. Past that it is stale: a tab that slept through the rotation is
 * still showing a code the door will refuse.
 */
export function codeStale(now: number, slotEndsAt: number): boolean {
  return slotEndsAt > 0 && now >= slotEndsAt + SLOT_MS;
}
