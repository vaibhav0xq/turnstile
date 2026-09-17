import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { type CheckoutStep, useCheckout } from "../app/checkout";
import { nextOpenSeat } from "../app/next-seat";
import { type AppConfig, type EventInfo, explorerTx, tierForSeat, tierPrice } from "../chain/config";
import type { SeatMap } from "../chain/seats";
import { useIdentity } from "../identity/store";
import { formatMon, formatMs } from "../lib/format";
import { useDirector } from "../scene/director";
import { seatLabel, type VenueLayout } from "../venues/layout";
import { Button, Dot, Kicker, Panel, Spinner } from "./primitives";

interface CheckoutProps {
  config: AppConfig;
  event: EventInfo;
  layout: VenueLayout;
  seatMap: SeatMap | undefined;
}

const STEPS: Array<{ key: CheckoutStep; label: string; detail: string }> = [
  { key: "identity", label: "Passkey", detail: "Your passkey is the account." },
  { key: "buying", label: "Seat", detail: "Minted to your account on Monad." },
  { key: "binding", label: "Door key", detail: "Derived separately for this event." },
];

function rank(step: CheckoutStep): number {
  if (step === "idle") return 0;
  if (step === "identity") return 1;
  if (step === "funding" || step === "buying") return 2;
  if (step === "binding") return 3;
  return 4;
}

export function Checkout({ config, event, layout, seatMap }: CheckoutProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const seatId = useCheckout((s) => s.seatId);
  const step = useCheckout((s) => s.step);
  const error = useCheckout((s) => s.error);
  const buyHash = useCheckout((s) => s.buyHash);
  const bindHash = useCheckout((s) => s.bindHash);
  const buyBlock = useCheckout((s) => s.buyBlock);
  const bindBlock = useCheckout((s) => s.bindBlock);
  const buyMs = useCheckout((s) => s.buyMs);
  const bindMs = useCheckout((s) => s.bindMs);
  const tokenId = useCheckout((s) => s.tokenId);
  const startedAt = useCheckout((s) => s.startedAt);
  const run = useCheckout((s) => s.run);
  const bindOnly = useCheckout((s) => s.bindOnly);
  const cancel = useCheckout((s) => s.cancel);
  const start = useCheckout((s) => s.start);
  const fan = useIdentity((s) => s.fan);
  const knownAddress = useIdentity((s) => s.knownAddress);
  const devSeed = useIdentity((s) => s.devSeed);
  const selectSeat = useDirector((s) => s.selectSeat);

  useEffect(() => {
    if (seatId != null) selectSeat(seatId);
  }, [seatId, selectSeat]);

  // A busy relayer (429) is momentary: retry once per seat on the fan's behalf after a short, visible
  // countdown — and only while the session is still live, so the retry can never raise a passkey prompt
  // nobody asked for. A second 429, or a lapsed session, waits for a tap.
  const throttled = step === "error" && (error?.code === "RATE_LIMITED" || error?.code === "BUSY");
  const retryKey = seatId == null ? null : `${event.address}:${seatId}`;
  const [retryIn, setRetryIn] = useState<number | null>(null);
  const autoRetried = useRef(new Set<string>());
  useEffect(() => {
    if (!throttled || retryKey === null || autoRetried.current.has(retryKey)) {
      setRetryIn(null);
      return;
    }
    let left = 5;
    setRetryIn(left);
    const id = setInterval(() => {
      left -= 1;
      setRetryIn(left);
      if (left > 0) return;
      clearInterval(id);
      autoRetried.current.add(retryKey);
      const c = useCheckout.getState();
      const same =
        c.eventAddress === event.address &&
        c.seatId === seatId &&
        c.step === "error" &&
        c.error?.code === "RATE_LIMITED";
      if (!same || !useIdentity.getState().liveFan()) return;
      if (c.buyHash && c.tokenId != null) void bindOnly(config, event, c.tokenId, queryClient);
      else void run(config, event, queryClient);
    }, 1000);
    return () => clearInterval(id);
  }, [throttled, retryKey, seatId, config, event, queryClient, run, bindOnly]);

  if (seatId == null) return null;
  const seat = layout.byId.get(seatId);
  const tier = tierForSeat(event, seatId);
  if (!seat || !tier) return null;
  const listing = seatMap?.get(seatId);
  const price = listing?.listed ? listing.listingPrice : tierPrice(tier);
  const live = fan && fan.expiresAt > Date.now();
  const busy = step === "identity" || step === "funding" || step === "buying" || step === "binding";
  const total = startedAt ? (buyMs ?? 0) + (bindMs ?? 0) : 0;
  // The seat went under us (or the listing did): the next best seat in the same tier is one tap away,
  // picked as the tier chip would — skipping this seat, which the map may still show as open.
  const gone = step === "error" && !buyHash && (error?.code === "SeatTaken" || error?.code === "NotListed");
  const nextSeat = gone ? nextOpenSeat(event, layout, seatMap, tier.index, seatId) : null;
  const nextSpec = nextSeat !== null ? layout.byId.get(nextSeat) : undefined;
  const takeNext = () => {
    if (nextSeat === null) return;
    start(event.address, nextSeat);
    void run(config, event, queryClient);
  };

  return (
    <Panel className="fade-up w-full max-w-md p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Kicker>{listing?.listed ? "Resale" : tier.name}</Kicker>
          <div className="display mt-1 text-3xl">{seatLabel(seat)}</div>
          <div className="mono mt-1 text-sm text-muted">
            {formatMon(price)}
            {price === 0n ? " · gas sponsored" : " · paid from your account"}
          </div>
        </div>
        {!busy ? (
          <button type="button" className="text-muted hover:text-paper" onClick={cancel} aria-label="Close">
            ×
          </button>
        ) : null}
      </div>

      <ol className="mt-5 flex flex-col gap-3">
        {STEPS.map((s, i) => {
          const r = rank(step);
          const state = r > i + 1 ? "done" : r === i + 1 ? "active" : "todo";
          return (
            <li key={s.key} className="flex items-start gap-3">
              <span className="mt-1 grid h-5 w-5 place-items-center">
                {state === "done" ? (
                  <Dot tone={i === 2 ? "green" : "cyan"} />
                ) : state === "active" && busy ? (
                  <Spinner />
                ) : (
                  <span className="mono text-[11px] text-muted">{i + 1}</span>
                )}
              </span>
              <div className="flex-1">
                <div className={`text-sm ${state === "todo" ? "text-muted" : ""}`}>
                  {s.label}
                  {s.key === "buying" && buyMs !== null ? (
                    <span className="mono ml-2 text-xs text-cyan">{formatMs(buyMs)}</span>
                  ) : null}
                  {s.key === "binding" && bindMs !== null ? (
                    <span className="mono ml-2 text-xs text-green">{formatMs(bindMs)}</span>
                  ) : null}
                  {s.key === "identity" && step === "identity" ? (
                    <span className="ml-2 text-xs text-muted">
                      {devSeed ? "dev identity" : "check your device"}
                    </span>
                  ) : null}
                  {s.key === "buying" && step === "funding" ? (
                    <span className="ml-2 text-xs text-muted">topping up test MON</span>
                  ) : null}
                </div>
                <div className="text-xs text-muted">{s.detail}</div>
              </div>
            </li>
          );
        })}
      </ol>

      {error ? (
        <div className="mt-4 rounded-xl border border-red/30 bg-red/10 px-3 py-2 text-sm">
          {error.message}
          {retryIn !== null && retryIn > 0 ? ` Retrying in ${retryIn} s…` : ""}
          <Kicker className="mt-1">{error.code}</Kicker>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {gone && nextSpec ? (
          <Button variant="amber" className="flex-1" onClick={takeNext} data-testid="checkout-next-seat">
            Take {seatLabel(nextSpec)} instead
          </Button>
        ) : gone ? (
          <div className="text-sm text-muted">{tier.name} is sold out. Choose another tier.</div>
        ) : step === "idle" || (step === "error" && !buyHash) ? (
          <Button
            variant="amber"
            className="flex-1"
            onClick={() => void run(config, event, queryClient)}
            data-tour="checkout"
          >
            {step === "error"
              ? "Try again"
              : live
                ? "Confirm seat"
                : knownAddress
                  ? "Sign in and take seat"
                  : "Create passkey and take seat"}
          </Button>
        ) : null}
        {step === "error" && buyHash && tokenId != null && !bindHash ? (
          <Button
            variant="amber"
            className="flex-1"
            onClick={() => void bindOnly(config, event, tokenId, queryClient)}
          >
            Retry door key
          </Button>
        ) : null}
        {(step === "done" || (step === "error" && buyHash)) && tokenId != null ? (
          <Button
            variant="primary"
            className="flex-1"
            onClick={() => navigate(`/t/${event.address}/${tokenId}`)}
            data-tour="checkout-open"
          >
            Open your ticket
          </Button>
        ) : null}
        {busy ? (
          <div className="mono flex items-center gap-2 text-xs text-muted">
            <Spinner /> working…
          </div>
        ) : null}
      </div>

      {buyHash ? (
        <div className="mono mt-4 flex flex-col gap-1 text-[11px] text-muted">
          <TxLine label="mint" hash={buyHash} block={buyBlock} config={config} />
          {bindHash ? <TxLine label="bind" hash={bindHash} block={bindBlock} config={config} /> : null}
          {step === "done" ? (
            <span className="text-green">yours after {formatMs(total)} on-chain</span>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

function TxLine({
  label,
  hash,
  block,
  config,
}: {
  label: string;
  hash: string;
  block: string | null;
  config: AppConfig;
}) {
  const url = explorerTx(config, hash);
  const short = `${hash.slice(0, 10)}…${hash.slice(-6)}`;
  return (
    <span>
      {label} ·{" "}
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="underline decoration-line hover:text-paper">
          {short}
        </a>
      ) : (
        short
      )}
      {block ? ` · block ${Number(block).toLocaleString("en-US")}` : ""}
    </span>
  );
}
