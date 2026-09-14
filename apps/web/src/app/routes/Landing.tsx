import { useEffect } from "react";
import { Link, useNavigate } from "react-router";
import type { AppConfig, EventInfo } from "../../chain/config";
import { tierPrice } from "../../chain/config";
import { formatDate, formatMon } from "../../lib/format";
import { useDirector } from "../../scene/director";
import { CityPulse } from "../../ui/live/CityPulse";
import { Kicker } from "../../ui/primitives";
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
  useEffect(() => {
    showCity();
  }, [showCity]);

  const events = config?.events ?? [];
  // The tour takes `?event=` when given, else the newest night with a free door (see tour-target.ts).
  const tourEvent = pickTourEvent(events, targetEvent);
  return (
    // `mt-auto` rather than `justify-end`: a phone with several nights on the bill overflows the viewport,
    // and end-aligned flex content would clip the headline off the top with no way to scroll to it.
    <div className="overlay scrollbar-none flex flex-col overflow-y-auto overscroll-contain">
      <div className="scrim-bottom" aria-hidden />
      <div className="scrim-left" aria-hidden />
      <div className="relative mt-auto flex flex-col gap-8 p-5 pb-8 pt-20 sm:flex-row sm:items-end sm:justify-between sm:p-8 sm:pt-24">
        <div className="max-w-xl">
          <Kicker className="fade-up">Identity-bound tickets · Monad</Kicker>
          <h1 className="display fade-up mt-3 text-[13vw] leading-[0.9] sm:text-7xl md:text-8xl">
            Access that
            <br />
            <em className="text-amber">follows you.</em>
          </h1>
          <p className="fade-up-late mt-5 max-w-md text-base text-paper/80 sm:text-lg">
            One passkey buys the seat, opens the door and keeps your history private. No wallet, no app, no
            screenshots — the code on your phone is signed by a key that only exists tonight.
          </p>
          {!tourActive ? (
            <div className="fade-up-late mt-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="chip mono border-amber/50 text-amber hover:bg-ink-2"
                onClick={() => startTour()}
                data-testid="tour-start"
              >
                ▶ Judge mode · 2-minute tour
              </button>
              <span className="text-xs text-muted">
                City → seat → passkey → door → lit seat. Guided, or on autopilot.
              </span>
            </div>
          ) : null}
        </div>

        <div className="fade-up-late flex w-full flex-col gap-2 sm:w-80">
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
