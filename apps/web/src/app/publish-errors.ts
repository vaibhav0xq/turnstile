import { BaseError } from "viem";

/**
 * The node's own words for "this account cannot pay for that": the top-up confirmed a block ago and the RPC
 * node that took the send has not seen it yet. Not a viem `InsufficientFundsError`, which never reaches the
 * node — the balance was checked before sending.
 */
export function isBalanceLag(error: unknown): boolean {
  if (!(error instanceof BaseError)) return false;
  return /insufficient (balance|funds)/i.test(`${error.details} ${error.shortMessage}`);
}

/** How long to keep retrying a send the node refuses for a balance it has not caught up with. */
export const BALANCE_LAG_RETRY_MS = 6_000;
