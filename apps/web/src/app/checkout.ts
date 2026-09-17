// Seat → passkey → buy → bind, as one resumable flow the panels render from.
import type { QueryClient } from "@tanstack/react-query";
import { BaseError, ContractFunctionRevertedError, type Hex } from "viem";
import { create } from "zustand";
import { type AppConfig, type EventInfo, tierForSeat, tierPrice } from "../chain/config";
import { type SeatMap, seatMapQueryKey } from "../chain/seats";
import { toEventRef, useIdentity } from "../identity/store";
import { ApiError } from "../lib/api";
import { useTelemetry } from "../lib/telemetry";
import {
  balanceOf,
  bindData,
  buyData,
  buyDirect,
  buyListingData,
  buyListingDirect,
  delistData,
  drip,
  listData,
  mintedTokenId,
  relay,
} from "../relayer/client";

export type CheckoutStep = "idle" | "identity" | "funding" | "buying" | "binding" | "done" | "error";

interface CheckoutState {
  seatId: number | null;
  eventAddress: string | null;
  step: CheckoutStep;
  error: { code: string; message: string } | null;
  buyHash: Hex | null;
  bindHash: Hex | null;
  /** Block each receipt landed in: the plain proof beside the hash, for everyone, not only judge mode. */
  buyBlock: string | null;
  bindBlock: string | null;
  tokenId: number | null;
  buyMs: number | null;
  bindMs: number | null;
  startedAt: number | null;

  start(eventAddress: string, seatId: number): void;
  cancel(): void;
  run(config: AppConfig, event: EventInfo, queryClient: QueryClient): Promise<void>;
  /** Re-run only the door-key binding (e.g. the fan skipped it or the ceremony was cancelled). */
  bindOnly(config: AppConfig, event: EventInfo, tokenId: number, queryClient: QueryClient): Promise<void>;

  /** Holder-side resale: relayed `list` / `delist`, both gasless. Resolves true when the chain accepted it. */
  resale: {
    busy: "list" | "delist" | null;
    error: { code: string; message: string } | null;
    hash: Hex | null;
  };
  list(
    config: AppConfig,
    event: EventInfo,
    tokenId: number,
    priceWei: bigint,
    queryClient: QueryClient,
  ): Promise<boolean>;
  delist(config: AppConfig, event: EventInfo, tokenId: number, queryClient: QueryClient): Promise<boolean>;
}

export function explain(error: unknown): { code: string; message: string } {
  if (error instanceof ApiError) return { code: error.code, message: friendly(error.code, error.message) };
  if (error instanceof BaseError) {
    const revert = error.walk((e) => e instanceof ContractFunctionRevertedError);
    const name = revert instanceof ContractFunctionRevertedError ? revert.data?.errorName : undefined;
    if (name) return { code: name, message: friendly(name, `Reverted: ${name}`) };
    return { code: error.name, message: friendly(error.name, error.shortMessage) };
  }
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  ) {
    const e = error as { code: string; message?: string };
    return { code: e.code, message: friendly(e.code, e.message ?? e.code) };
  }
  // `fetch` rejects with a bare TypeError when the relayer is unreachable.
  if (error instanceof TypeError) return { code: "NETWORK", message: friendly("NETWORK", error.message) };
  const message = error instanceof Error ? error.message : String(error);
  return { code: "UNKNOWN", message: friendly("UNKNOWN", message) };
}

function friendly(code: string, fallback: string): string {
  switch (code) {
    case "SeatTaken":
      return "Someone took that seat a moment ago.";
    case "NotListed":
      return "That seat is no longer listed. Someone may have taken it.";
    case "SalesClosed":
      return "Sales for this event have closed.";
    case "SeatNotInAnyTier":
      return "That seat isn't on sale.";
    case "WrongPrice":
      return "The price changed. Try again.";
    case "CEREMONY_FAILED":
      return "The passkey prompt was cancelled.";
    case "DIFFERENT_PASSKEY":
      return "That was a different passkey. Use the one you signed in with.";
    case "PRF_UNAVAILABLE":
      return "This passkey can't derive keys here. Try a phone or another browser.";
    case "INSUFFICIENT_FUNDS":
      return "Your account needs a little MON for a paid seat.";
    case "PriceAboveCap":
      return "That's above the resale cap for this seat.";
    case "ResaleDisabled":
      return "The organiser turned resale off for this event.";
    case "ResaleClosed":
      return "Resale closed when doors opened.";
    case "AlreadyCheckedIn":
      return "This ticket has already been used at the door.";
    case "NotTicketHolder":
      return "Only the passkey that holds this ticket can do that.";
    case "SelfPurchase":
      return "That's already your seat.";
    case "InvalidConfig":
      return "The event settings were rejected on-chain: check the dates and the resale fee.";
    case "InvalidTiers":
      return "The tiers were rejected on-chain: every tier needs seats and they must not overlap.";
    case "INSUFFICIENT_FUNDS_CREATE":
      return "Your account needs a little MON to publish an event (the testnet drip is off here).";
    // Relayer / network failures. Nothing is charged until the transaction lands, so "try again" is safe.
    case "NETWORK":
    case "TypeError":
    case "HttpRequestError":
      return "Could not reach the relayer. Check your connection and try again. Nothing was charged.";
    case "RATE_LIMITED":
    case "BUSY":
      return "The relayer is busy right now. Wait a few seconds and try again.";
    // Spend safety (relayer spend-guard): these clear on their own or need the operator, not a retry.
    case "SPONSOR_PAUSED":
      return "Sponsored transactions are paused while the relayer wallet is topped up. Try again later.";
    case "BUDGET_EXHAUSTED":
      return "The relayer has hit its sponsorship budget for now. Try again in a while.";
    case "QUOTA_EXCEEDED":
      return "This account has used its sponsored actions for today.";
    case "INTERNAL_ERROR":
      return "The relayer hit an error. Try again in a moment; if it keeps happening the chain may be congested.";
    case "WaitForTransactionReceiptTimeoutError":
    case "TimeoutError":
      return "The chain is slow to confirm. Wait before retrying because your seat may still confirm.";
    case "BAD_FORWARD_REQUEST":
    case "BAD_DEADLINE":
      return "The signed request went stale before it was relayed. Try again.";
    case "UNKNOWN_EVENT":
      return "The relayer doesn't know this event yet. Refresh in a moment.";
    default:
      return fallback;
  }
}

export const useCheckout = create<CheckoutState>()((set, get) => ({
  seatId: null,
  eventAddress: null,
  step: "idle",
  error: null,
  buyHash: null,
  bindHash: null,
  buyBlock: null,
  bindBlock: null,
  tokenId: null,
  buyMs: null,
  bindMs: null,
  startedAt: null,

  start(eventAddress, seatId) {
    set({
      seatId,
      eventAddress,
      step: "idle",
      error: null,
      buyHash: null,
      bindHash: null,
      buyBlock: null,
      bindBlock: null,
      tokenId: null,
      buyMs: null,
      bindMs: null,
      startedAt: null,
    });
  },

  cancel() {
    set({ seatId: null, eventAddress: null, step: "idle", error: null });
  },

  async run(config, event, queryClient) {
    const { seatId } = get();
    if (seatId == null) return;
    const tier = tierForSeat(event, seatId);
    if (!tier) {
      set({ step: "error", error: { code: "SeatNotInAnyTier", message: friendly("SeatNotInAnyTier", "") } });
      return;
    }
    const listing = queryClient.getQueryData<SeatMap>(seatMapQueryKey(event.address))?.get(seatId);
    const resale = listing?.listed ? listing.listingPrice : null;
    const price = resale ?? tierPrice(tier);
    const identity = useIdentity.getState();
    set({ startedAt: performance.now(), error: null });
    try {
      set({ step: "identity" });
      const fan = await identity.ensureFan();
      useTelemetry.getState().ceremony();

      let receipt: Awaited<ReturnType<typeof relay>>;
      if (price === 0n) {
        // Free seat, primary or passed on: sponsored end to end, the fan never holds MON.
        set({ step: "buying" });
        receipt =
          resale === null
            ? await relay(config, fan, event, "buy", buyData(seatId))
            : await relay(config, fan, event, "buyListing", buyListingData(seatId));
      } else {
        // Paid seat: the fan's own account pays. On testnet the relayer tops up brand-new accounts.
        const needed = price + 200_000n * 120_000_000_000n; // price + generous gas at Monad testnet prices
        let balance = await balanceOf(config, fan.address);
        if (balance < needed) {
          if (!config.drip.enabled) throw { code: "INSUFFICIENT_FUNDS", message: "" };
          set({ step: "funding" });
          await drip(fan.address);
          for (let i = 0; i < 20 && balance < needed; i++) {
            await new Promise((r) => setTimeout(r, 600));
            balance = await balanceOf(config, fan.address);
          }
          if (balance < needed) throw { code: "INSUFFICIENT_FUNDS", message: "" };
        }
        set({ step: "buying" });
        receipt =
          resale !== null
            ? await buyListingDirect(config, fan, event, seatId, price)
            : await buyDirect(config, fan, event, seatId, price);
      }
      if (receipt.status !== "success")
        throw { code: "REVERTED", message: "The purchase reverted on-chain." };
      const tokenId = (await mintedTokenId(config, receipt.hash)) ?? seatId;
      useTelemetry.getState().confirmed();
      set({ buyHash: receipt.hash, buyBlock: receipt.blockNumber, buyMs: receipt.ms, tokenId });
      void queryClient.invalidateQueries({ queryKey: seatMapQueryKey(event.address) });

      set({ step: "binding" });
      const door = await identity.ensureDoor(toEventRef(config.chainId, event.address));
      useTelemetry.getState().ceremony();
      const bound = await relay(config, fan, event, "bindDoorKey", bindData(tokenId, door.address));
      if (bound.status !== "success") throw { code: "REVERTED", message: "Binding the door key reverted." };
      set({ bindHash: bound.hash, bindBlock: bound.blockNumber, bindMs: bound.ms, step: "done" });
      void queryClient.invalidateQueries({ queryKey: seatMapQueryKey(event.address) });
    } catch (error) {
      // A bought-but-unbound ticket is still a ticket: surface the error but keep the token.
      set({ step: "error", error: explain(error) });
    }
  },

  resale: { busy: null, error: null, hash: null },

  async list(config, event, tokenId, priceWei, queryClient) {
    set({ resale: { busy: "list", error: null, hash: null } });
    try {
      const fan = await useIdentity.getState().ensureFan();
      const receipt = await relay(config, fan, event, "list", listData(tokenId, priceWei));
      if (receipt.status !== "success") throw { code: "REVERTED", message: "Listing reverted on-chain." };
      set({ resale: { busy: null, error: null, hash: receipt.hash } });
      await queryClient.invalidateQueries({ queryKey: seatMapQueryKey(event.address) });
      return true;
    } catch (error) {
      set({ resale: { busy: null, error: explain(error), hash: null } });
      return false;
    }
  },

  async delist(config, event, tokenId, queryClient) {
    set({ resale: { busy: "delist", error: null, hash: null } });
    try {
      const fan = await useIdentity.getState().ensureFan();
      const receipt = await relay(config, fan, event, "delist", delistData(tokenId));
      if (receipt.status !== "success") throw { code: "REVERTED", message: "Delisting reverted on-chain." };
      set({ resale: { busy: null, error: null, hash: receipt.hash } });
      await queryClient.invalidateQueries({ queryKey: seatMapQueryKey(event.address) });
      return true;
    } catch (error) {
      set({ resale: { busy: null, error: explain(error), hash: null } });
      return false;
    }
  },

  async bindOnly(config, event, tokenId, queryClient) {
    const identity = useIdentity.getState();
    set({ step: "binding", error: null, tokenId });
    try {
      const fan = await identity.ensureFan();
      const door = await identity.ensureDoor(toEventRef(config.chainId, event.address));
      const bound = await relay(config, fan, event, "bindDoorKey", bindData(tokenId, door.address));
      if (bound.status !== "success") throw { code: "REVERTED", message: "Binding the door key reverted." };
      set({ bindHash: bound.hash, bindBlock: bound.blockNumber, bindMs: bound.ms, step: "done" });
      void queryClient.invalidateQueries({ queryKey: seatMapQueryKey(event.address) });
    } catch (error) {
      set({ step: "error", error: explain(error) });
    }
  },
}));
