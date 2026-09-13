// Seat → passkey → buy → bind, as one resumable flow the panels render from.
import type { QueryClient } from "@tanstack/react-query";
import type { Hex } from "viem";
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
  buyListingDirect,
  drip,
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
  tokenId: number | null;
  buyMs: number | null;
  bindMs: number | null;
  startedAt: number | null;

  start(eventAddress: string, seatId: number): void;
  cancel(): void;
  run(config: AppConfig, event: EventInfo, queryClient: QueryClient): Promise<void>;
  /** Re-run only the door-key binding (e.g. the fan skipped it or the ceremony was cancelled). */
  bindOnly(config: AppConfig, event: EventInfo, tokenId: number, queryClient: QueryClient): Promise<void>;
}

function explain(error: unknown): { code: string; message: string } {
  if (error instanceof ApiError) return { code: error.code, message: friendly(error.code, error.message) };
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  ) {
    const e = error as { code: string; message?: string };
    return { code: e.code, message: friendly(e.code, e.message ?? e.code) };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { code: "UNKNOWN", message: friendly("UNKNOWN", message) };
}

function friendly(code: string, fallback: string): string {
  switch (code) {
    case "SeatTaken":
      return "Someone took that seat a moment ago. Pick another.";
    case "SalesClosed":
      return "Sales for this event have closed.";
    case "SeatNotInAnyTier":
      return "That seat isn't on sale.";
    case "WrongPrice":
      return "The price changed under us — try again.";
    case "CEREMONY_FAILED":
      return "The passkey prompt was cancelled.";
    case "DIFFERENT_PASSKEY":
      return "That was a different passkey. Use the one you signed in with.";
    case "PRF_UNAVAILABLE":
      return "This passkey can't derive keys here. Try a phone or another browser.";
    case "INSUFFICIENT_FUNDS":
      return "Your account needs a little MON for a paid seat.";
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
      if (price === 0n && resale === null) {
        set({ step: "buying" });
        receipt = await relay(config, fan, event, "buy", buyData(seatId));
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
      set({ buyHash: receipt.hash, buyMs: receipt.ms, tokenId });
      void queryClient.invalidateQueries({ queryKey: seatMapQueryKey(event.address) });

      set({ step: "binding" });
      const door = await identity.ensureDoor(toEventRef(config.chainId, event.address));
      useTelemetry.getState().ceremony();
      const bound = await relay(config, fan, event, "bindDoorKey", bindData(tokenId, door.address));
      if (bound.status !== "success") throw { code: "REVERTED", message: "Binding the door key reverted." };
      set({ bindHash: bound.hash, bindMs: bound.ms, step: "done" });
      void queryClient.invalidateQueries({ queryKey: seatMapQueryKey(event.address) });
    } catch (error) {
      // A bought-but-unbound ticket is still a ticket: surface the error but keep the token.
      set({ step: "error", error: explain(error) });
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
      set({ bindHash: bound.hash, bindMs: bound.ms, step: "done" });
      void queryClient.invalidateQueries({ queryKey: seatMapQueryKey(event.address) });
    } catch (error) {
      set({ step: "error", error: explain(error) });
    }
  },
}));
