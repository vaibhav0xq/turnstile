import { SLOT_MS } from "@turnstile/identity";
import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { usePassport } from "../app/passport";
import { noteKey } from "../app/passport-model";
import { type AppConfig, type EventInfo, tierForSeat, tierPrice } from "../chain/config";
import type { SeatState } from "../chain/seats";
import { type DoorKeySession, toEventRef, useIdentity } from "../identity/store";
import { formatDate, formatMon, shortAddress } from "../lib/format";
import { useDirector } from "../scene/director";
import { seatLabel, type VenueLayout } from "../venues/layout";
import { Button, Dot, Kicker, Panel, Spinner } from "./primitives";
import { ResaleControls, resaleOpen } from "./Resale";

interface TicketPanelProps {
  config: AppConfig;
  event: EventInfo;
  layout: VenueLayout;
  tokenId: number;
  state: SeatState | undefined;
  /** False while the seat map is still loading — an undefined `state` then means "unknown", not "unsold". */
  loaded: boolean;
  onBind: () => void;
  binding: boolean;
}

/**
 * The code as vector art: an SVG data URL scales to any screen density with every module square-edged, where
 * a downscaled bitmap goes grey at the edges. ECC M and a two-module quiet zone; the base45 form is ≈ 152
 * alphanumeric characters, so this is a version 6 symbol (41×41) — see SPEC §4.3.
 */
export async function renderQr(text: string): Promise<string> {
  const svg = await QRCode.toString(text, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 2,
    color: { dark: "#07080a", light: "#f3efe7" },
  });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Live entry code: a new EIP-712 signature every 30-second slot, from the per-event door key. */
export function useEntryCode(event: EventInfo, tokenId: number, door: DoorKeySession | null) {
  const [code, setCode] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [slotEndsAt, setSlotEndsAt] = useState<number>(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    if (!door) return;
    const now = Date.now();
    const slotStart = Math.floor(now / SLOT_MS) * SLOT_MS;
    setSlotEndsAt(slotStart + SLOT_MS);
    const text = await door.code({ eventId: BigInt(event.eventId), tokenId: BigInt(tokenId) });
    setCode(text);
    setQr(await renderQr(text));
    timer.current = setTimeout(() => void refresh(), slotStart + SLOT_MS - Date.now() + 20);
  }, [door, event.eventId, tokenId]);

  useEffect(() => {
    void refresh();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [refresh]);

  return { code, qr, slotEndsAt };
}

export function TicketPanel({
  config,
  event,
  layout,
  tokenId,
  state,
  loaded,
  onBind,
  binding,
}: TicketPanelProps) {
  const fan = useIdentity((s) => s.fan);
  const ensureFan = useIdentity((s) => s.ensureFan);
  const ensureDoor = useIdentity((s) => s.ensureDoor);
  const liveDoor = useIdentity((s) => s.liveDoor);
  const busy = useIdentity((s) => s.busy);
  const [door, setDoor] = useState<DoorKeySession | null>(null);
  const viewMode = useDirector((s) => s.viewMode);
  const viewFromSeat = useDirector((s) => s.viewFromSeat);
  const viewOverview = useDirector((s) => s.viewOverview);
  const [big, setBig] = useState(false);
  const ref = useMemo(() => toEventRef(config.chainId, event.address), [config.chainId, event.address]);
  // The private line from the passport, only while the vault is open on this device (never fetched here).
  const note = usePassport((s) => s.data?.notes[noteKey(config.chainId, event.address, tokenId)]?.text);

  useEffect(() => {
    setDoor(liveDoor(ref));
  }, [liveDoor, ref]);

  const seat = layout.byId.get(tokenId);
  const tier = tierForSeat(event, tokenId);
  const bound = state && state.doorKey !== "0x0000000000000000000000000000000000000000";
  const doorMatches = door && state && door.address.toLowerCase() === state.doorKey.toLowerCase();
  const checkedIn = state ? state.checkedInAt > 0 : false;
  const { code, qr, slotEndsAt } = useEntryCode(event, tokenId, doorMatches ? door : null);
  const mineLive = fan && state && fan.address.toLowerCase() === state.holder.toLowerCase();

  const openDoorKey = async () => {
    const d = await ensureDoor(ref);
    setDoor(d);
  };

  return (
    <Panel className="fade-up max-h-[calc(100dvh-5.5rem)] w-full max-w-md overflow-y-auto">
      <div className="flex items-start justify-between gap-4 p-5 pb-3">
        <div>
          <Kicker>{event.name}</Kicker>
          <div className="display mt-1 text-3xl">{seat ? seatLabel(seat) : `Seat ${tokenId}`}</div>
          <div className="mono mt-1 text-xs text-muted">
            {tier?.name} · {formatDate(event.startsAt)}
          </div>
          {note ? (
            <div className="mt-2 text-sm italic text-paper/80" data-testid="ticket-note">
              “{note}”<span className="mono ml-2 text-[10px] not-italic text-muted">private</span>
            </div>
          ) : null}
        </div>
        <Dot tone={checkedIn ? "green" : bound ? "cyan" : "amber"} />
      </div>

      <div className="px-5">
        {state && checkedIn ? (
          <div className="rounded-2xl border border-green/30 bg-green/10 p-5 text-center">
            <div className="display text-3xl text-green">You're in.</div>
            <div className="mono mt-1 text-xs text-muted">
              checked in at {new Date(state.checkedInAt * 1000).toLocaleTimeString()}
            </div>
          </div>
        ) : !state && !loaded ? (
          <div className="flex items-center gap-3 py-6 text-sm text-muted">
            <Spinner /> reading the ticket…
          </div>
        ) : !state ? (
          <div className="rounded-2xl border border-line p-4 text-sm">
            <div>Seat {tokenId} hasn't been taken yet.</div>
            <div className="mt-1 text-xs text-muted">
              {tier ? `${tier.name} · ${formatMon(tierPrice(tier))} — ` : ""}pick it in the room to make it
              yours.
            </div>
            <Link
              to={`/e/${event.address}`}
              state={{ seat: tokenId }}
              className="btn btn-amber mt-3"
              data-testid="ticket-unsold-room"
            >
              Take this seat
            </Link>
          </div>
        ) : !mineLive ? (
          <div className="rounded-2xl border border-line p-4 text-sm">
            <div>
              Seat {tokenId} is held by <span className="mono">{shortAddress(state.holder)}</span>
              {checkedIn
                ? " and has been used at the door."
                : state.listed
                  ? " and is listed for resale."
                  : "."}
            </div>
            <div className="mt-1 text-xs text-muted">
              {fan
                ? "Entry codes only appear for the passkey that holds the seat. If this is your ticket, sign in with the passkey that bought it."
                : "Entry codes only appear for the passkey that holds the seat. Sign in to show yours."}
            </div>
            {!fan ? (
              <Button
                className="mt-3"
                onClick={() => void ensureFan().catch(() => undefined)}
                disabled={busy !== null}
              >
                {busy ? "…" : "Sign in"}
              </Button>
            ) : null}
            {state.listed && !checkedIn ? (
              <div className="mono mt-2 text-[11px] text-muted">
                Pick it from the room to buy it — the listing is filled from the seat map.
              </div>
            ) : null}
          </div>
        ) : !bound ? (
          <div className="rounded-2xl border border-amber/30 bg-amber/10 p-4">
            <div className="text-sm">Bind your door key</div>
            <div className="mt-1 text-xs text-muted">
              One more passkey prompt derives a key that only exists for this event. It never leaves the
              device.
            </div>
            <Button
              variant="amber"
              className="mt-3"
              onClick={onBind}
              disabled={binding}
              data-tour="ticket-bind"
            >
              {binding ? <Spinner /> : null} Bind door key
            </Button>
          </div>
        ) : !doorMatches ? (
          <div className="rounded-2xl border border-line p-4">
            <div className="text-sm">Show your entry code</div>
            <div className="mt-1 text-xs text-muted">
              A passkey prompt re-derives the door key for this event. Codes rotate every 30 seconds.
            </div>
            <Button
              variant="primary"
              className="mt-3"
              onClick={() => void openDoorKey()}
              disabled={busy !== null}
              data-tour="ticket-open"
            >
              {busy === "door" ? <Spinner /> : null} Open entry code
            </Button>
            {door && !doorMatches ? (
              <div className="mono mt-2 text-[11px] text-red">
                This device derives a different door key than the one bound. Re-bind from the passkey that
                bought it.
              </div>
            ) : null}
          </div>
        ) : (
          <CodeView
            code={code}
            qr={qr}
            slotEndsAt={slotEndsAt}
            big={big}
            eventAddress={event.address}
            onToggle={() => setBig((b) => !b)}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 p-5 pt-4">
        {viewMode === "seat" ? (
          <Button onClick={viewOverview}>Back to the room</Button>
        ) : (
          <Button onClick={() => viewFromSeat(tokenId)}>View from your seat</Button>
        )}
        {mineLive && state && resaleOpen(event, state) ? (
          <ResaleControls config={config} event={event} tokenId={tokenId} state={state} />
        ) : null}
        {state ? (
          <span className="mono ml-auto text-[11px] text-muted">
            holder {shortAddress(state.holder)}
            {bound ? ` · door ${shortAddress(state.doorKey)}` : ""}
          </span>
        ) : null}
      </div>
    </Panel>
  );
}

function CodeView({
  code,
  qr,
  slotEndsAt,
  big,
  eventAddress,
  onToggle,
}: {
  code: string | null;
  qr: string | null;
  slotEndsAt: number;
  big: boolean;
  eventAddress: string;
  onToggle: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setCopied(false);
  }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const remaining = Math.max(0, slotEndsAt - now);
  const frac = remaining / SLOT_MS;
  const r = 15;
  const c = 2 * Math.PI * r;
  return (
    <div className={big ? "fixed inset-0 z-50 flex flex-col items-center justify-center bg-paper p-6" : ""}>
      <button
        type="button"
        onClick={onToggle}
        className={`relative block overflow-hidden rounded-2xl bg-paper ${big ? "w-[min(86vw,86vh)]" : "w-full"}`}
        aria-label={big ? "Shrink code" : "Show fullscreen"}
      >
        {qr ? (
          <img src={qr} alt="Entry code" className="block aspect-square h-auto w-full" draggable={false} />
        ) : (
          <div className="grid aspect-square place-items-center text-ink">
            <Spinner className="border-ink/30 border-t-ink" />
          </div>
        )}
      </button>
      {/* The countdown lives beside the symbol, not on it: nothing may cover a finder pattern. */}
      <div className={`mt-3 flex items-center gap-2 text-xs ${big ? "text-ink/70" : "text-muted"}`}>
        <span className="relative grid h-10 w-10 shrink-0 place-items-center" data-testid="slot-countdown">
          <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden>
            <circle
              cx="20"
              cy="20"
              r={r}
              fill="none"
              stroke={big ? "rgba(7,8,10,0.15)" : "currentColor"}
              strokeOpacity={big ? 1 : 0.25}
              strokeWidth="3"
            />
            <circle
              cx="20"
              cy="20"
              r={r}
              fill="none"
              stroke={big ? "#07080a" : "currentColor"}
              strokeWidth="3"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - frac)}
              strokeLinecap="round"
              transform="rotate(-90 20 20)"
            />
          </svg>
          <span className={`mono absolute text-[10px] ${big ? "text-ink" : ""}`}>
            {Math.ceil(remaining / 1000)}
          </span>
        </span>
        <span>Rotates every 30 s. A screenshot dies with the slot; a forward can't sign the next one.</span>
      </div>
      <div
        className={`mono mt-2 break-all text-[10px] leading-relaxed ${big ? "max-w-[86vw] text-ink/70" : "text-muted"}`}
      >
        {code ? `${code.slice(0, 48)}…` : ""}
      </div>
      {!big && code ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link
            to={`/gate/${eventAddress}#code=${encodeURIComponent(code)}`}
            className="btn btn-amber !min-h-9 px-3 text-xs"
            data-testid="walk-to-door"
            data-tour="ticket-door"
          >
            Walk up to the door →
          </Link>
          <Button
            className="!min-h-9 px-3 text-xs"
            onClick={() => {
              void navigator.clipboard?.writeText(code).then(
                () => setCopied(true),
                () => setCopied(false),
              );
            }}
          >
            {copied ? "Copied" : "Copy code"}
          </Button>
          <span className="text-[11px] text-muted">One device? The door view opens with this code.</span>
        </div>
      ) : null}
      {big ? (
        <Button variant="ghost" className="mt-6 !border-ink/20 !text-ink" onClick={onToggle}>
          Done
        </Button>
      ) : null}
    </div>
  );
}
