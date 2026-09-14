import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router";
import type { AppConfig, EventInfo } from "../../chain/config";
import { tierPrice } from "../../chain/config";
import { formatDate, formatMon } from "../../lib/format";
import { registerKeepOut } from "../../scene/anchor";
import { useDirector } from "../../scene/director";
import { CityPulse } from "../../ui/live/CityPulse";
import { Button, Kicker } from "../../ui/primitives";
import { SiteSections } from "../../ui/site/Sections";
import { useTour } from "../tour";
import { pickTourEvent } from "../tour-target";

export function Landing({ config }: { config: AppConfig | undefined }) {
  const showCity = useDirector((s) => s.showCity);
  const hoverBeacon = useDirector((s) => s.hoverBeacon);
  const hovered = useDirector((s) => s.hoveredBeacon);
  const startTour = useTour((s) => s.start);
  const tourActive = useTour((s) => s.active);
  const targetEvent = useTour((s) => s.targetEvent);
  const navigate = useNavigate();
  const overlay = useRef<HTMLDivElement>(null);
  const copy = useRef<HTMLDivElement>(null);
  const bill = useRef<HTMLDivElement>(null);
  useEffect(() => {
    showCity();
  }, [showCity]);
  // The beacon labels in the city stay clear of the hero copy and the bill (they hide where they would cross).
  useEffect(() => {
    const offCopy = registerKeepOut(copy.current);
    const offBill = registerKeepOut(bill.current);
    return () => {
      offCopy();
      offBill();
    };
  }, []);

  // The wheel over the bare city scrolls the page (the programme lives below the fold), not the camera:
  // the canvas is under the overlay, so its dolly would otherwise win wherever there is no DOM.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const el = overlay.current;
      if (!el || e.ctrlKey || (e.target instanceof Node && el.contains(e.target))) return;
      e.preventDefault();
      e.stopPropagation();
      el.scrollBy({ top: e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY });
    };
    window.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => window.removeEventListener("wheel", onWheel, { capture: true });
  }, []);

  const events = config?.events ?? [];
  // The tour takes `?event=` when given, else the newest night with a free door (see tour-target.ts).
  const tourEvent = pickTourEvent(events, targetEvent);
  const enterCity = () => {
    // Light the first night on the bill and hand it focus: Enter walks in, the beacon answers in the city.
    const first = bill.current?.querySelector<HTMLButtonElement>("button");
    first?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    first?.focus({ preventScroll: true });
  };
  return (
    <div ref={overlay} className="overlay flex flex-col overflow-y-auto overscroll-contain">
      <div className="scrim-bottom" aria-hidden />
      <div className="scrim-left" aria-hidden />
      {/* `justify-end` inside a min-height block: the hero sits on the fold and grows past it on a phone with
          several nights on the bill instead of clipping the headline off the top. `shrink-0` matters: an
          explicit min-height replaces the flex item's automatic content minimum, and without it a short
          viewport squeezes the block to one screen and the bill overflows up under the top bar. */}
      <div className="relative flex min-h-dvh shrink-0 flex-col justify-end gap-8 p-5 pb-8 pt-20 sm:flex-row sm:items-end sm:justify-between sm:p-8 sm:pt-24">
        <div ref={copy} className="max-w-xl">
          <Kicker className="fade-up">Identity-bound tickets · Monad</Kicker>
          <h1 className="display fade-up mt-3 text-[13vw] leading-[0.9] sm:text-7xl md:text-8xl">
            Access that
            <br />
            <em className="text-amber">follows you.</em>
          </h1>
          <p className="fade-up-late mt-5 max-w-md text-base text-paper/80 sm:text-lg">
            One passkey is your account, your door key and your private vault. Nothing to install, nothing to
            screenshot — the code on your phone is signed by a key derived for tonight's door alone.
          </p>
          {!tourActive ? (
            <div className="fade-up-late mt-5 flex flex-wrap items-center gap-2">
              {/* Nothing to walk into until the bill has loaded; disabled beats a silent no-op. */}
              <Button
                variant="primary"
                onClick={enterCity}
                disabled={events.length === 0}
                data-testid="enter-city"
              >
                {events.length === 0 && !config ? "Lighting the city…" : "Enter the city"}
              </Button>
              <button
                type="button"
                className="chip mono border-amber/50 text-amber hover:bg-ink-2"
                onClick={() => startTour()}
                data-testid="tour-start"
              >
                ▶ Judge mode · 2-minute tour
              </button>
              <a
                href="#programme"
                className="mono ml-auto text-[11px] uppercase tracking-[0.16em] text-muted hover:text-paper sm:ml-2"
              >
                Programme ↓
              </a>
            </div>
          ) : null}
        </div>

        <div ref={bill} className="fade-up-late flex w-full flex-col gap-2 sm:w-80">
          <Kicker>Tonight in the city</Kicker>
          {events.length === 0 ? (
            <div className="glass rounded-2xl p-4 text-sm text-muted">Lighting the beacons…</div>
          ) : null}
          {events.map((event) => (
            <EventCard
              key={event.address}
              event={event}
              tourTarget={event === tourEvent}
              active={hovered === event.address}
              onHover={(on) => hoverBeacon(on ? event.address : null)}
              onEnter={() => navigate(`/e/${event.address}`)}
            />
          ))}
          <CityPulse config={config} />
          <Link
            to="/organise"
            className="mono mt-1 self-end text-[11px] uppercase tracking-[0.16em] text-muted hover:text-paper"
          >
            Host your own night →
          </Link>
        </div>
      </div>
      <SiteSections config={config} />
    </div>
  );
}

function EventCard({
  event,
  tourTarget,
  active,
  onHover,
  onEnter,
}: {
  event: EventInfo;
  tourTarget: boolean;
  active: boolean;
  onHover: (on: boolean) => void;
  onEnter: () => void;
}) {
  const prices = event.tiers.map(tierPrice);
  const min = prices.reduce((a, b) => (a < b ? a : b), prices[0] ?? 0n);
  const mixed = min === 0n && prices.some((p) => p > 0n);
  const left = event.capacity - event.sold;
  return (
    <button
      type="button"
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      onClick={onEnter}
      data-tour={tourTarget ? "city" : undefined}
      className={`glass group flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-colors ${active ? "border-amber/60" : "hover:border-paper/30"}`}
    >
      <div>
        <div className="text-base">{event.name}</div>
        <div className="mono mt-0.5 text-[11px] text-muted">
          {formatDate(event.startsAt)} · {left} of {event.capacity} left
          {event.checkedIn > 0 ? (
            <>
              {" · "}
              <span className="text-green">{event.checkedIn}</span> inside
            </>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col items-end">
        <span className="mono text-xs">
          {min === 0n ? (mixed ? "from Free" : "Free") : `from ${formatMon(min)}`}
        </span>
        <span className="mono text-[11px] text-amber opacity-0 transition-opacity group-hover:opacity-100">
          enter →
        </span>
      </div>
    </button>
  );
}
