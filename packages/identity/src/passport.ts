// Passport sync (SPEC §4.6): the encrypted blob of §4.4 travels to a store the fan cannot be locked out of
// (the relayer's `/api/passport/:address`). The store never sees a key; it accepts a write only when the
// account key signs for it, and it keeps the newest `issuedAt` so an older capture cannot be replayed.

import { keccak256, stringToHex } from "viem";

export const PASSPORT_SYNC_PREFIX = "turnstile/passport-sync/v1";
/** Upper bound on a stored blob; a passport is names and notes, not a photo album. */
export const PASSPORT_MAX_BYTES = 16 * 1024;
/** How far `issuedAt` may sit from the store's clock. */
export const PASSPORT_MAX_SKEW_MS = 5 * 60_000;

const BLOB_SHAPE = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$/;

/** The EIP-191 message the account key signs to write `blob` for `address` (blob `""` clears). */
export function passportSyncMessage(address: string, blob: string, issuedAt: number): string {
  return `${PASSPORT_SYNC_PREFIX}\n${address.toLowerCase()}\n${keccak256(stringToHex(blob))}\n${issuedAt}`;
}

/** Cheap shape check a store can run before touching a signature. `""` is the clear marker. */
export function isPassportBlobShape(blob: unknown): blob is string {
  return (
    typeof blob === "string" && (blob === "" || (blob.length <= PASSPORT_MAX_BYTES && BLOB_SHAPE.test(blob)))
  );
}
