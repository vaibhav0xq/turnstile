import { type RefObject, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router";
import { useTour } from "../app/tour";
import { pickTourEvent } from "../app/tour-target";
import { useNightsOn } from "../app/use-nights-on";
import type { AppConfig, EventInfo } from "../chain/config";
import { tierPrice } from "../chain/config";
import { formatDate, formatMon } from "../lib/format";
import { registerKeepOut } from "../scene/anchor";
import { useDirector } from "../scene/director";
import { CityPulse } from "./live/CityPulse";
import { Kicker } from "./primitives";

/**
 * Tonight's bill: one card per night, the live pulse and the organiser's way in. Hovering a card lights its
 * beacon in the city; entering dives into the room. Shared by the picker (`/city`) and the landing's last
 * section, so the same night reads the same in both places. Beacon labels keep clear of it.
 */
export function Bill({
  config,
  kicker = "Tonight in the city",
  tourTargets = false,
  className = "",
}: {
  config: AppConfig | undefined;
  kicker?: string | null;
  /** Mark the tour's night with `data-tour="city"` (only where judge mode can start: the picker). */
  tourTargets?: boolean;
  className?: string;
}) {
  const navigate = useNavigate();
  const hoverBeacon = useDirector((s) => s.hoverBeacon);
  const hovered = useDirector((s) => s.hoveredBeacon);
  const targetEvent = useTour((s) => s.targetEvent);
  const ref = useRef<HTMLDivElement>(null);
  useKeepOut(ref);
  const events = useNightsOn(config);
  // The tour takes `?event=` when given, else the newest night with a free door (see tour-target.ts).
  const tourEvent = tourTargets ? pickTourEvent(events, targetEvent) : undefined;
  return (
    <div ref={ref} className={`flex w-full flex-col gap-2 ${className}`} data-testid="bill">
      {kicker ? <Kicker>{kicker}</Kicker> : null}
      {events.length === 0 ? (
        <div className="glass rounded-2xl p-4 text-sm text-muted">
          {config ? "No nights on the bill yet." : "Lighting the beacons…"}
        </div>
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
  );
}

/** Registers an element with the beacon labels' keep-out set for as long as it is mounted. */
export function useKeepOut(ref: RefObject<HTMLElement | null>) {
  useEffect(() => registerKeepOut(ref.current), [ref]);
}

export function EventCard({
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
