import { useEffect } from "react";
import { useNavigate } from "react-router";
import type { AppConfig, EventInfo } from "../../chain/config";
import { tierPrice } from "../../chain/config";
import { formatDate, formatMon } from "../../lib/format";
import { useDirector } from "../../scene/director";
import { Kicker } from "../../ui/primitives";

export function Landing({ config }: { config: AppConfig | undefined }) {
  const showCity = useDirector((s) => s.showCity);
  const hoverBeacon = useDirector((s) => s.hoverBeacon);
  const hovered = useDirector((s) => s.hoveredBeacon);
  const navigate = useNavigate();
  useEffect(() => {
    showCity();
  }, [showCity]);

  const events = config?.events ?? [];
  return (
    <div className="overlay flex flex-col justify-end">
      <div className="scrim-bottom" aria-hidden />
      <div className="scrim-left" aria-hidden />
      <div className="relative flex flex-col gap-8 p-5 pb-8 sm:flex-row sm:items-end sm:justify-between sm:p-8">
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
              active={hovered === event.address}
              onHover={(on) => hoverBeacon(on ? event.address : null)}
              onEnter={() => navigate(`/e/${event.address}`)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function EventCard({
  event,
  active,
  onHover,
  onEnter,
}: {
  event: EventInfo;
  active: boolean;
  onHover: (on: boolean) => void;
  onEnter: () => void;
}) {
  const prices = event.tiers.map(tierPrice);
  const min = prices.reduce((a, b) => (a < b ? a : b), prices[0] ?? 0n);
  const left = event.capacity - event.sold;
  return (
    <button
      type="button"
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      onClick={onEnter}
      className={`glass group flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-colors ${active ? "border-amber/60" : "hover:border-paper/30"}`}
    >
      <div>
        <div className="text-base">{event.name}</div>
        <div className="mono mt-0.5 text-[11px] text-muted">
          {formatDate(event.startsAt)} · {left} of {event.capacity} left
        </div>
      </div>
      <div className="flex flex-col items-end">
        <span className="mono text-xs">{min === 0n ? "Free" : `from ${formatMon(min)}`}</span>
        <span className="mono text-[11px] text-amber opacity-0 transition-opacity group-hover:opacity-100">
          enter →
        </span>
      </div>
    </button>
  );
}
