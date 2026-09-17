import { isIdentityError, SLOT_MS } from "@turnstile/identity";
import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { usePassport } from "../app/passport";
import { noteKey } from "../app/passport-model";
import { type AppConfig, type EventInfo, tierForSeat, tierPrice } from "../chain/config";
import type { SeatState } from "../chain/seats";
import { type DoorKeySession, toEventRef, useIdentity } from "../identity/store";
import { formatCountdown, formatDate, formatMon, shortAddress } from "../lib/format";
import { codeStale, sessionPhase } from "../lib/session";
import { useDirector } from "../scene/director";
import { seatLabel, type VenueLayout } from "../venues/layout";
import { Provenance } from "./live/Provenance";
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

export type EntryCodeStatus = "live" | "renewing" | "stale" | "expired";

/**
 * Live entry code: a new EIP-712 signature every 30-second slot, from the per-event door key. The slot timer
 * does the rotation; a slow tick and the page's wake events catch a phone that slept through it, so a stale
 * code is replaced or, when the door key session has run out, declared instead of shown.
 */
export function useEntryCode(event: EventInfo, tokenId: number, door: DoorKeySession | null) {
  const [code, setCode] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [slotEndsAt, setSlotEndsAt] = useState<number>(0);
  const [status, setStatus] = useState<EntryCodeStatus>("renewing");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const slotRef = useRef(0);
  const statusRef = useRef<EntryCodeStatus>("renewing");
  // Bumped whenever the door, event or seat changes and on unmount, so a signature that finishes late
  // cannot publish the previous door's code or re-arm the rotation for it.
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    if (!door || inFlight.current) return;
    if (timer.current) clearTimeout(timer.current);
    if (sessionPhase(Date.now(), door.expiresAt) === "expired") {
      statusRef.current = "expired";
      setStatus("expired");
      return;
    }
    const mine = generation.current;
    inFlight.current = true;
    try {
      const slotStart = Math.floor(Date.now() / SLOT_MS) * SLOT_MS;
      const text = await door.code({ eventId: BigInt(event.eventId), tokenId: BigInt(tokenId) });
      const image = await renderQr(text);
      if (generation.current !== mine) return;
      setCode(text);
      setQr(image);
      slotRef.current = slotStart + SLOT_MS;
      setSlotEndsAt(slotStart + SLOT_MS);
      statusRef.current = "live";
      setStatus("live");
      timer.current = setTimeout(() => void refresh(), slotStart + SLOT_MS - Date.now() + 20);
    } catch (error) {
      if (generation.current !== mine) return;
      const expired = isIdentityError(error) && error.code === "SESSION_EXPIRED";
      statusRef.current = expired ? "expired" : "stale";
      setStatus(statusRef.current);
    } finally {
      if (generation.current === mine) inFlight.current = false;
    }
  }, [door, event.eventId, tokenId]);

  useEffect(() => {
    generation.current += 1;
    inFlight.current = false;
    slotRef.current = 0;
    statusRef.current = "renewing";
    setStatus("renewing");
    void refresh();
    // A live code whose slot has passed means the timer did not fire (a locked phone, a throttled tab).
    const catchUp = () => {
      if (statusRef.current !== "live") return;
      if (Date.now() >= slotRef.current) void refresh();
    };
    const wake = () => {
      if (document.visibilityState === "visible") catchUp();
    };
    const tick = setInterval(catchUp, 1_000);
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    return () => {
      generation.current += 1;
      if (timer.current) clearTimeout(timer.current);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, [refresh]);

  return { code, qr, slotEndsAt, status, refresh };
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
  const knownAddress = useIdentity((s) => s.knownAddress);
  const ensureFan = useIdentity((s) => s.ensureFan);
  const ensureDoor = useIdentity((s) => s.ensureDoor);
  const renewDoor = useIdentity((s) => s.renewDoor);
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
  const { code, qr, slotEndsAt, status, refresh } = useEntryCode(event, tokenId, doorMatches ? door : null);
  // Ownership follows the address this device remembers: the account session (15 min) is usually over while
  // the door key (60 min) or its renewal still shows the code. Every signature still goes through ensureFan.
  const owner = fan?.address ?? knownAddress;
  const mine = owner && state && owner.toLowerCase() === state.holder.toLowerCase();

  const openDoorKey = async () => {
    const d = await ensureDoor(ref);
    setDoor(d);
  };
  // A fresh door key session: one passkey prompt, then the code rotates again for an hour.
  const renewDoorKey = async () => {
    const d = await renewDoor(ref).catch(() => null);
    if (d) setDoor(d);
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
              {tier ? `${tier.name} · ${formatMon(tierPrice(tier))}. ` : ""}Choose it from the room.
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
        ) : !mine ? (
          <div className="rounded-2xl border border-line p-4 text-sm">
            <div>
              Seat {tokenId} is held by <span className="mono">{shortAddress(state.holder)}</span>
              {checkedIn
                ? ` and was checked in at ${new Date(state.checkedInAt * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
                : state.listed
                  ? " and is listed for resale."
                  : "."}
            </div>
            <div className="mt-1 text-xs text-muted">
              {fan
                ? "Use the passkey that bought this ticket."
                : "Sign in with the passkey holding this ticket."}
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
              <div className="mono mt-2 text-[11px] text-muted">Buy this listing from the room.</div>
            ) : null}
          </div>
        ) : !bound ? (
          <div className="rounded-2xl border border-amber/30 bg-amber/10 p-4">
            <div className="text-sm">Bind your door key</div>
            <div className="mt-1 text-xs text-muted">Your passkey derives a separate key for this event.</div>
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
              Re-derive this event's door key. Codes rotate every 30 seconds.
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
                Different door key. Use the passkey that bought this ticket.
              </div>
            ) : null}
          </div>
        ) : (
          <CodeView
            code={code}
            qr={qr}
            slotEndsAt={slotEndsAt}
            status={status}
            doorEndsAt={door?.expiresAt ?? 0}
            renewing={busy === "door"}
            big={big}
            eventAddress={event.address}
            gateOpen={!config.gateProtected}
            onToggle={() => setBig((b) => !b)}
            onRefresh={() => void refresh()}
            onRenew={() => void renewDoorKey()}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 p-5 pt-4">
        {viewMode === "seat" ? (
          <Button onClick={viewOverview}>Back to the room</Button>
        ) : (
          <Button onClick={() => viewFromSeat(tokenId)}>View from your seat</Button>
        )}
        {mine && state && resaleOpen(event, state) ? (
          <ResaleControls config={config} event={event} tokenId={tokenId} state={state} />
        ) : null}
        {state ? (
          <span className="mono ml-auto text-[11px] text-muted">
            holder {shortAddress(state.holder)}
            {bound ? ` · door ${shortAddress(state.doorKey)}` : ""}
          </span>
        ) : null}
      </div>
      {state ? <Provenance config={config} event={event} tokenId={tokenId} viewer={owner} /> : null}
    </Panel>
  );
}

function CodeView({
  code,
  qr,
  slotEndsAt,
  status,
  doorEndsAt,
  renewing,
  big,
  eventAddress,
  gateOpen,
  onToggle,
  onRefresh,
  onRenew,
}: {
  code: string | null;
  qr: string | null;
  slotEndsAt: number;
  status: EntryCodeStatus;
  /** When this event's door key session ends; past it the code cannot be renewed without a prompt. */
  doorEndsAt: number;
  /** A door key ceremony is in progress. */
  renewing: boolean;
  big: boolean;
  eventAddress: string;
  /** This deployment's door takes anyone (demo): offer to walk up to it. A tokened door is the operator's. */
  gateOpen: boolean;
  onToggle: () => void;
  /** Re-sign the current slot with the live door key. No prompt. */
  onRefresh: () => void;
  /** Derive the door key again. One passkey prompt. */
  onRenew: () => void;
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
  const phase = sessionPhase(now, doorEndsAt);
  const expired = status === "expired" || phase === "expired";
  const stale = !expired && (status === "stale" || (status === "live" && codeStale(now, slotEndsAt)));
  const usable = Boolean(code) && !expired && !stale && status !== "renewing";

  if (expired) {
    return (
      <div
        className={
          big
            ? "fixed inset-0 z-50 flex flex-col items-center justify-center bg-paper p-6 text-ink"
            : "rounded-2xl border border-amber/30 bg-amber/10 p-5 text-center"
        }
        data-testid="code-expired"
      >
        <div className="display text-2xl">Code expired.</div>
        <div className={`mt-1 text-xs ${big ? "text-ink/70" : "text-muted"}`}>
          Generate a fresh door code. One passkey prompt.
        </div>
        <Button
          variant="amber"
          className="mt-3"
          onClick={onRenew}
          disabled={renewing}
          data-testid="code-renew"
        >
          {renewing ? <Spinner /> : null} Generate a fresh door code
        </Button>
        {big ? (
          <Button variant="ghost" className="mt-4 !border-ink/20 !text-ink" onClick={onToggle}>
            Done
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={big ? "fixed inset-0 z-50 flex flex-col items-center justify-center bg-paper p-6" : ""}>
      <div className={`relative ${big ? "w-[min(86vw,86vh)]" : "w-full"}`}>
        <button
          type="button"
          onClick={onToggle}
          className={`relative block w-full overflow-hidden rounded-2xl bg-paper ${stale ? "opacity-20" : ""}`}
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
        {stale ? (
          <div className="absolute inset-0 flex items-center justify-center p-4" data-testid="code-stale">
            <div className="flex flex-col items-center gap-2 rounded-2xl bg-paper px-5 py-4 text-center text-ink shadow-lg">
              <div className="text-sm">This code is stale.</div>
              <Button variant="amber" className="!min-h-9 px-3 text-xs" onClick={onRefresh}>
                Open a fresh door code
              </Button>
            </div>
          </div>
        ) : null}
      </div>
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
              strokeDashoffset={c * (1 - (usable ? frac : 0))}
              strokeLinecap="round"
              transform="rotate(-90 20 20)"
            />
          </svg>
          <span className={`mono absolute text-[10px] ${big ? "text-ink" : ""}`}>
            {usable ? Math.ceil(remaining / 1000) : "·"}
          </span>
        </span>
        <span>
          {status === "renewing"
            ? "Renewing the code…"
            : stale
              ? "The door will refuse this code."
              : "Rotates every 30 seconds. Valid for about a minute."}
        </span>
      </div>
      {phase === "ending" ? (
        <div
          className={`mt-2 flex flex-wrap items-center gap-2 text-xs ${big ? "text-ink/70" : "text-amber"}`}
          data-testid="door-ending"
        >
          <span>Door key ends in {formatCountdown(doorEndsAt - now)}.</span>
          <button
            type="button"
            className={`chip mono ${big ? "!border-ink/20 !text-ink" : "hover:bg-ink-2"}`}
            onClick={onRenew}
            disabled={renewing}
          >
            {renewing ? "…" : "Renew door key"}
          </button>
        </div>
      ) : null}
      <div
        className={`mono mt-2 break-all text-[10px] leading-relaxed ${big ? "max-w-[86vw] text-ink/70" : "text-muted"}`}
      >
        {code && usable ? `${code.slice(0, 48)}…` : ""}
      </div>
      {!big && code && usable ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {gateOpen ? (
            <Link
              to={`/gate/${eventAddress}#code=${encodeURIComponent(code)}`}
              className="btn btn-amber !min-h-9 px-3 text-xs"
              data-testid="walk-to-door"
              data-tour="ticket-door"
            >
              Walk up to the door →
            </Link>
          ) : null}
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
          <span className="text-[11px] text-muted">
            {gateOpen ? "The door view opens with this code." : "Show this code to the scanner."}
          </span>
        </div>
      ) : null}
      {big ? (
        <>
          <div className="mt-4 text-center text-sm text-ink/70">
            Show this at the door. The code renews while open.
          </div>
          <Button variant="ghost" className="mt-4 !border-ink/20 !text-ink" onClick={onToggle}>
            Done
          </Button>
        </>
      ) : null}
    </div>
  );
}
