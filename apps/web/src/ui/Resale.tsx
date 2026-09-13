// Holder-side resale, rendered inside the ticket panel: list at or under the organiser's cap, or delist.
// Both calls are relayed (gasless); the buyer side lives in the seat card ("Buy resale").
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { formatEther, parseEther } from "viem";
import { useCheckout } from "../app/checkout";
import { type AppConfig, type EventInfo, tierForSeat, tierPrice } from "../chain/config";
import type { SeatState } from "../chain/seats";
import { formatMon } from "../lib/format";
import { Button, Spinner } from "./primitives";

interface ResaleProps {
  config: AppConfig;
  event: EventInfo;
  tokenId: number;
  state: SeatState;
}

const BPS = 10_000n;

/** True when the contract would still accept `list`: resale enabled, doors not open, not used yet. */
export function resaleOpen(event: EventInfo, state: SeatState | undefined, now = Date.now()): boolean {
  if (!state || event.resaleCapBps === 0) return false;
  if (now / 1000 >= event.startsAt) return false;
  return state.checkedInAt === 0;
}

export function ResaleControls({ config, event, tokenId, state }: ResaleProps) {
  const queryClient = useQueryClient();
  const resale = useCheckout((s) => s.resale);
  const list = useCheckout((s) => s.list);
  const delist = useCheckout((s) => s.delist);
  const [open, setOpen] = useState(false);
  const tier = tierForSeat(event, tokenId);
  const face = tier ? tierPrice(tier) : 0n;
  const cap = (face * BigInt(event.resaleCapBps)) / BPS;
  const [price, setPrice] = useState(() => (cap === 0n ? "0" : formatEther(cap)));
  const busy = resale.busy !== null;

  let priceWei: bigint | null = null;
  try {
    priceWei = parseEther(price.trim() === "" ? "0" : price.trim());
  } catch {
    priceWei = null;
  }
  const aboveCap = priceWei !== null && priceWei > cap;
  const fee = priceWei === null ? 0n : (priceWei * BigInt(event.resaleFeeBps)) / BPS;
  const net = priceWei === null ? 0n : priceWei - fee;

  if (state.listed) {
    return (
      <div className="w-full rounded-2xl border border-cyan/30 bg-cyan/10 p-4" data-testid="resale-listed">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm">Listed for {formatMon(state.listingPrice)}</div>
            <div className="mt-1 text-xs text-muted">
              It shows on the map as a resale seat. Your entry code keeps working until someone buys it;
              walking in cancels the listing.
            </div>
          </div>
          <Button
            onClick={() => void delist(config, event, tokenId, queryClient)}
            disabled={busy}
            data-testid="resale-delist"
          >
            {resale.busy === "delist" ? <Spinner /> : null} Delist
          </Button>
        </div>
        {resale.error ? <div className="mono mt-2 text-[11px] text-red">{resale.error.message}</div> : null}
      </div>
    );
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} data-testid="resale-open">
        {face === 0n ? "Pass this seat on" : "Sell this seat"}
      </Button>
    );
  }

  const submit = async () => {
    if (priceWei === null || aboveCap) return;
    const ok = await list(config, event, tokenId, priceWei, queryClient);
    if (ok) setOpen(false);
  };

  return (
    <div className="w-full rounded-2xl border border-line p-4" data-testid="resale-form">
      <div className="text-sm">{face === 0n ? "Pass this seat on" : "List for resale"}</div>
      {face === 0n ? (
        <div className="mt-1 text-xs text-muted">
          Free tickets pass on for free. Whoever takes it binds their own door key and yours stops working.
        </div>
      ) : (
        <>
          <div className="mt-1 text-xs text-muted">
            Cap {formatMon(cap)} ({event.resaleCapBps / 100}% of face). The organiser keeps{" "}
            {event.resaleFeeBps / 100}% of the sale; the rest lands in your account the moment it sells.
          </div>
          <label className="mt-3 flex items-center gap-3">
            <input
              className="field w-36"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              aria-label="Price in MON"
              data-testid="resale-price"
            />
            <span className={`mono text-xs ${aboveCap || priceWei === null ? "text-red" : "text-muted"}`}>
              {priceWei === null
                ? "Enter a number"
                : aboveCap
                  ? `Above the ${formatMon(cap)} cap`
                  : `MON · you receive ${formatMon(net)}`}
            </span>
          </label>
        </>
      )}
      {resale.error ? <div className="mono mt-2 text-[11px] text-red">{resale.error.message}</div> : null}
      <div className="mt-3 flex gap-2">
        <Button
          variant="primary"
          onClick={() => void submit()}
          disabled={busy || priceWei === null || aboveCap}
          data-testid="resale-list"
        >
          {resale.busy === "list" ? <Spinner /> : null} {face === 0n ? "Pass it on" : "List"}
        </Button>
        <Button onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
