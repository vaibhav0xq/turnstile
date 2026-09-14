import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { useCheckout } from "../app/checkout";
import { consumeTourParams, TOUR_STEPS, type TourStep, useTour } from "../app/tour";
import { type AppConfig, explorerTx } from "../chain/config";
import type { SeatMap } from "../chain/seats";
import { useIdentity } from "../identity/store";
import { formatMs } from "../lib/format";
import { useTelemetry } from "../lib/telemetry";
import { useDirector } from "../scene/director";
import { Button, Kicker } from "./primitives";

const ROUTE = /^\/(e|t|gate)\/(0x[0-9a-fA-F]{40})(?:\/(\d+))?/;

const COPY: Record<TourStep, { title: string; line: string }> = {
  city: {
    title: "The city",
    line: "Every beacon is an event contract on Monad. Take the free one — no wallet, no app, one passkey.",
  },
  pick: {
    title: "Pick a seat",
    line: "Amber is open, cyan is yours, green is inside. The highlighted tier picks the front-most open seat.",
  },
  checkout: {
    title: "One passkey",
    line: "The passkey is the account: it signs the seat (free seats are relayed; a paid one is sent from your own account), and a second prompt binds a door key derived for tonight's door alone.",
  },
  ticket: {
    title: "Your ticket",
    line: "The code re-signs itself every 30 seconds with the door key, so a copy goes stale within a minute and a seat admits once. Walk up to the door.",
  },
  door: {
    title: "The door",
    line: "The gate recovers the signer from the code, checks it against the door key bound on-chain, and submits the check-in from its own wallet.",
  },
  lit: {
    title: "You're in",
    line: "Seat lit from chain state. Everything above was one identity, two passkey prompts and three transactions.",
  },
};

interface Target {
  key: string;
  el: HTMLElement | null;
  dwell: number;
  /** A real passkey prompt is behind this control; autopilot never presses those. */
  touch: boolean;
  /** Press again after this long if the step has not moved on — only for controls that are safe to repeat. */
  retryAfter?: number;
}

const q = (sel: string): HTMLElement | null => {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el || (el as HTMLButtonElement).disabled) return null;
  return el;
};

/** A press on the judge's behalf still counts as a tap — the readout stays honest on autopilot runs. */
function press(target: Target) {
  useTelemetry.getState().tap();
  target.el?.click();
}

/** What the autopilot would press next for the current step, or null while there is nothing to press yet. */
function nextTarget(step: TourStep, devIdentity: boolean): Target | null {
  const touch = !devIdentity;
  switch (step) {
    case "city": {
      const el = q('[data-tour="city"]');
      return el ? { key: "city", el, dwell: 2600, touch: false } : null;
    }
    case "pick": {
      const take = q('[data-tour="pick-take"]');
      if (take) return { key: "pick-take", el: take, dwell: 1400, touch: false };
      // The chip picks the front-most open seat from the live map; pressing it again is harmless, and it is
      // the one control that can need a second go (a seat can sell between the press and the card).
      const chip = q('[data-tour="pick"]');
      return chip ? { key: "pick", el: chip, dwell: 2200, touch: false, retryAfter: 4000 } : null;
    }
    case "checkout": {
      const open = q('[data-tour="checkout-open"]');
      if (open) return { key: "checkout-open", el: open, dwell: 3200, touch: false };
      const confirm = q('[data-tour="checkout"]');
      return confirm ? { key: "checkout", el: confirm, dwell: 1800, touch } : null;
    }
    case "ticket": {
      const door = q('[data-tour="ticket-door"]');
      if (door) return { key: "ticket-door", el: door, dwell: 6500, touch: false };
      const unlock = q('[data-tour="ticket-open"]') ?? q('[data-tour="ticket-bind"]');
      return unlock ? { key: "ticket-unlock", el: unlock, dwell: 1500, touch } : null;
    }
    case "door": {
      const admit = q('[data-tour="door"]');
      return admit ? { key: "door", el: admit, dwell: 2400, touch: false } : null;
    }
    case "lit":
      return null;
  }
}

/**
 * Observes the app (route, checkout, seat map) to move the tour along, drives the autopilot, and shows
 * the bar. Mounted once in the frame; renders nothing while judge mode is off.
 */
export function Tour({ config, seatMap }: { config: AppConfig | undefined; seatMap: SeatMap | undefined }) {
  const active = useTour((s) => s.active);
  const step = useTour((s) => s.step);
  const autoplay = useTour((s) => s.autoplay);
  const eventAddress = useTour((s) => s.eventAddress);
  const tokenId = useTour((s) => s.tokenId);
  const location = useLocation();
  const navigate = useNavigate();
  const checkoutSeat = useCheckout((s) => s.seatId);
  const buyHash = useCheckout((s) => s.buyHash);
  const bindHash = useCheckout((s) => s.bindHash);
  const buyMs = useCheckout((s) => s.buyMs);
  const bindMs = useCheckout((s) => s.bindMs);
  const devSeed = useIdentity((s) => s.devSeed);
  const checkedIn = tokenId != null && (seatMap?.get(tokenId)?.checkedInAt ?? 0) > 0;

  // `?tour=1` / `?tour=auto` / `?event=<address>`
  useEffect(() => {
    const { tour, event } = consumeTourParams();
    if (event) useTour.getState().setTargetEvent(event);
    if (tour) useTour.getState().start({ autoplay: tour === "auto" });
  }, []);

  // Route → step. Chain truth (the seat's check-in) is the only way to reach the finale.
  useEffect(() => {
    if (!active || step === "lit") return;
    const { go, setEvent, setToken } = useTour.getState();
    if (location.pathname === "/city") {
      go("city");
      return;
    }
    const m = ROUTE.exec(location.pathname);
    if (!m) return;
    const [, kind, address, id] = m;
    setEvent(address ?? null);
    if (kind === "e") go(checkoutSeat != null ? "checkout" : "pick");
    else if (kind === "t") {
      setToken(Number(id));
      go("ticket");
    } else if (kind === "gate") go(checkedIn ? "lit" : "door");
  }, [active, step, location.pathname, checkoutSeat, checkedIn]);

  // Receipts for the summary (the checkout store is reset when the venue route unmounts).
  useEffect(() => {
    if (!active) return;
    useTour.getState().note({ buyHash, bindHash, buyMs, bindMs });
  }, [active, buyHash, bindHash, buyMs, bindMs]);

  // Finale: back to the room, then a hero shot of the seat that just went green.
  useEffect(() => {
    if (!active || step !== "lit" || !eventAddress || tokenId == null) return;
    const toRoom = setTimeout(() => navigate(`/e/${eventAddress}`), 2200);
    const focus = setTimeout(() => {
      const d = useDirector.getState();
      d.selectSeat(tokenId);
      d.focusSeat(tokenId);
    }, 3300);
    return () => {
      clearTimeout(toRoom);
      clearTimeout(focus);
    };
  }, [active, step, eventAddress, tokenId, navigate]);

  // Autopilot: press the highlighted control once it has been on screen for its dwell time.
  const armed = useRef<{ key: string; at: number; firedAt: number | null } | null>(null);
  useEffect(() => {
    if (!active || !autoplay) {
      armed.current = null;
      return;
    }
    const id = setInterval(() => {
      const t = useTour.getState();
      const target = nextTarget(t.step, devSeed !== null);
      if (!target) {
        armed.current = null;
        t.setWaitingForTouch(false);
        return;
      }
      if (target.touch) {
        t.setWaitingForTouch(true);
        return;
      }
      const now = performance.now();
      if (armed.current?.key !== target.key) armed.current = { key: target.key, at: now, firedAt: null };
      const a = armed.current;
      if (a.firedAt !== null) {
        if (target.retryAfter === undefined || now - a.firedAt < target.retryAfter) return; // fired once
        a.at = now;
        a.firedAt = null;
        return;
      }
      if (now - a.at < target.dwell) return;
      a.firedAt = now;
      press(target);
    }, 300);
    return () => clearInterval(id);
  }, [active, autoplay, devSeed]);

  if (!active) return null;
  return <TourBar config={config} devIdentity={devSeed !== null} />;
}

function TourBar({ config, devIdentity }: { config: AppConfig | undefined; devIdentity: boolean }) {
  const step = useTour((s) => s.step);
  const autoplay = useTour((s) => s.autoplay);
  const waiting = useTour((s) => s.waitingForTouch);
  const startedAt = useTour((s) => s.startedAt);
  const finishedAt = useTour((s) => s.finishedAt);
  const receipt = useTour((s) => s.receipt);
  const taps = useTelemetry((s) => s.taps);
  const ceremonies = useTelemetry((s) => s.ceremonies);
  const navigate = useNavigate();
  const [, tick] = useState(0);
  useEffect(() => {
    if (finishedAt !== null) return;
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [finishedAt]);

  const index = TOUR_STEPS.indexOf(step);
  const elapsed = startedAt === null ? 0 : (finishedAt ?? performance.now()) - startedAt;
  const copy = COPY[step];
  const canPress = step !== "lit";
  // On a phone the bar sits over the ticket, so it starts folded: dots, title, the one button that matters.
  const [expanded, setExpanded] = useState(() => !window.matchMedia("(max-width: 639px)").matches);
  const compact = !expanded && step !== "lit";

  const pressNow = () => {
    const target = nextTarget(step, devIdentity);
    if (!target || target.touch) return;
    press(target);
  };

  const restart = () => {
    const tour = useTour.getState();
    const keepAutoplay = tour.autoplay;
    useCheckout.getState().cancel();
    useDirector.getState().viewOverview();
    useTelemetry.getState().reset();
    const identity = useIdentity.getState();
    // A cold start each run: a fresh dev identity here, a signed-out (but kept) passkey in production.
    if (import.meta.env.DEV && identity.devSeed) identity.setDevSeed(Math.random().toString(36).slice(2, 8));
    else identity.endSessions();
    navigate("/city");
    tour.start({ autoplay: keepAutoplay });
  };

  const exit = () => {
    useTour.getState().exit();
    useDirector.getState().viewOverview();
  };

  // The door's scanner owns the right edge of the gate view (its "Go in." lands there), so the card moves
  // to the free bottom-left corner on that route; phones keep the single top slot and fold instead.
  const { pathname } = useLocation();
  const atDoor = pathname.startsWith("/gate/");
  const slot = atDoor ? "sm:bottom-6 sm:left-6 sm:right-auto sm:top-auto" : "sm:right-6";
  return (
    <aside
      className={`glass fade-up fixed right-4 top-[4.5rem] z-30 w-[min(22rem,calc(100vw-2rem))] rounded-2xl p-4 ${slot}`}
      aria-label="Judge mode"
      data-testid="tour-bar"
      data-step={step}
      data-waiting={waiting && autoplay ? "1" : "0"}
      data-elapsed={formatMs(elapsed)}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5" aria-hidden>
          {TOUR_STEPS.map((s, i) => (
            <span
              key={s}
              className={`h-1.5 rounded-full transition-all ${
                i < index ? "w-1.5 bg-green" : i === index ? "w-5 bg-amber" : "w-1.5 bg-paper/25"
              }`}
            />
          ))}
        </div>
        <span className="mono text-[11px] text-muted">
          {index + 1}/{TOUR_STEPS.length} · {formatMs(elapsed)}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <Kicker>Judge mode</Kicker>
        <span className="display text-xl">{copy.title}</span>
      </div>
      {compact ? null : (
        <p className="mt-1 text-xs leading-relaxed text-paper/80" aria-live="polite">
          {copy.line}
        </p>
      )}

      {step === "checkout" && (receipt.buyMs !== null || receipt.bindMs !== null) ? (
        <div className="mono mt-2 flex gap-3 text-[11px]">
          {receipt.buyMs !== null ? <span className="text-cyan">mint {formatMs(receipt.buyMs)}</span> : null}
          {receipt.bindMs !== null ? (
            <span className="text-green">bind {formatMs(receipt.bindMs)}</span>
          ) : null}
        </div>
      ) : null}

      {step === "lit" ? (
        <Summary elapsed={elapsed} taps={taps} ceremonies={ceremonies} config={config} />
      ) : null}

      {waiting && autoplay ? (
        <div className="mt-2 rounded-xl border border-amber/30 bg-amber/10 px-3 py-2 text-xs">
          Tap the highlighted button yourself — a passkey prompt needs a real touch.
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {step === "lit" ? (
          <>
            <Button
              variant="amber"
              className="!min-h-8 px-3 text-xs"
              onClick={restart}
              data-testid="tour-again"
            >
              Run it again
            </Button>
            <Button className="!min-h-8 px-3 text-xs" onClick={exit}>
              Explore the room
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="amber"
              className="!min-h-8 px-3 text-xs"
              onClick={pressNow}
              disabled={!canPress}
              data-testid="tour-do-it"
            >
              Do it for me
            </Button>
            <button
              type="button"
              className={`chip mono hover:bg-ink-2 ${autoplay ? "border-amber/60 text-amber" : ""}`}
              onClick={() => useTour.getState().setAutoplay(!autoplay)}
              aria-pressed={autoplay}
              data-testid="tour-autoplay"
            >
              autoplay {autoplay ? "on" : "off"}
            </button>
            {compact ? null : (
              <>
                <button type="button" className="chip mono hover:bg-ink-2" onClick={restart}>
                  restart
                </button>
                <button
                  type="button"
                  className="chip mono hover:bg-ink-2"
                  onClick={exit}
                  data-testid="tour-exit"
                >
                  exit
                </button>
              </>
            )}
            <button
              type="button"
              className="chip mono ml-auto hover:bg-ink-2 sm:hidden"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={!compact}
              data-testid="tour-fold"
            >
              {compact ? "more" : "less"}
            </button>
          </>
        )}
      </div>
    </aside>
  );
}

function Summary({
  elapsed,
  taps,
  ceremonies,
  config,
}: {
  elapsed: number;
  taps: number;
  ceremonies: number;
  config: AppConfig | undefined;
}) {
  const receipt = useTour((s) => s.receipt);
  const rows: Array<{ label: string; hash: string | null; ms: number | null }> = [
    { label: "mint", hash: receipt.buyHash, ms: receipt.buyMs },
    { label: "bind", hash: receipt.bindHash, ms: receipt.bindMs },
    { label: "admit", hash: receipt.admitHash, ms: receipt.admitMs },
  ];
  return (
    <div className="mt-3 rounded-xl border border-green/30 bg-green/10 p-3" data-testid="tour-summary">
      <div className="mono flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        <span className="text-green">{formatMs(elapsed)}</span>
        <span>{taps} taps</span>
        <span>{ceremonies} passkey prompts</span>
      </div>
      <ul className="mono mt-2 flex flex-col gap-0.5 text-[11px] text-muted">
        {rows.map((r) => (
          <li key={r.label} className="flex justify-between gap-3">
            <span>
              {r.label}
              {r.ms !== null ? <span className="ml-2 text-paper/70">{formatMs(r.ms)}</span> : null}
            </span>
            <TxRef hash={r.hash} config={config} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function TxRef({ hash, config }: { hash: string | null; config: AppConfig | undefined }) {
  if (!hash) return <span>—</span>;
  const short = `${hash.slice(0, 8)}…${hash.slice(-4)}`;
  const url = config ? explorerTx(config, hash) : null;
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="underline hover:text-paper">
      {short}
    </a>
  ) : (
    <span>{short}</span>
  );
}
