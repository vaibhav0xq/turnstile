import { useLocation, useNavigate } from "react-router";
import { useCheckout } from "../app/checkout";
import type { EventInfo } from "../chain/config";
import { tierForSeat, tierPrice } from "../chain/config";
import { type SeatMap, seatStatus } from "../chain/seats";
import { formatMon } from "../lib/format";
import { seatAnchor } from "../scene/anchor";
import { useDirector } from "../scene/director";
import { type SeatSpec, seatLabel, type VenueLayout } from "../venues/layout";
import { Dot } from "./primitives";

interface SeatCardProps {
  event: EventInfo;
  seat: SeatSpec;
  seatMap: SeatMap | undefined;
}

/**
 * Floats above a seat in the room. Hover shows it; a click pins it and offers the action.
 * Lives in the DOM overlay; the scene moves `SeatCardLayer`'s anchor to the seat every frame.
 */
export function SeatCard({ event, seat, seatMap }: SeatCardProps) {
  const selected = useDirector((s) => s.selectedSeat === seat.id);
  const mine = useDirector((s) => s.mine.has(seat.id));
  const viewFromSeat = useDirector((s) => s.viewFromSeat);
  const start = useCheckout((s) => s.start);
  const navigate = useNavigate();
  const tier = tierForSeat(event, seat.id);
  const state = seatMap?.get(seat.id);
  const status = seatStatus(state);
  const price = tier ? tierPrice(tier) : 0n;
  const listed = status === "listed" && state ? state.listingPrice : null;

  const tone = mine ? "cyan" : status === "available" ? "amber" : status === "checkedIn" ? "green" : "muted";
  const line = mine
    ? status === "checkedIn"
      ? "Yours · inside"
      : status === "listed"
        ? `Yours · listed ${formatMon(listed ?? 0n)}`
        : "Yours"
    : status === "available"
      ? formatMon(price)
      : status === "listed"
        ? listed === 0n
          ? "Passed on · Free"
          : `Resale · ${formatMon(listed ?? 0n)}`
        : status === "checkedIn"
          ? "Inside"
          : "Taken";

  return (
    <div className="seat-card glass">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm">{seatLabel(seat)}</div>
        <Dot tone={tone} />
      </div>
      <div className="mono mt-0.5 text-xs text-muted">{line}</div>
      {selected ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {status === "available" ? (
            <button
              type="button"
              className="btn btn-amber !min-h-9 px-3 text-xs"
              onClick={() => start(event.address, seat.id)}
            >
              Take this seat
            </button>
          ) : null}
          {mine ? (
            <button
              type="button"
              className="btn btn-primary !min-h-9 px-3 text-xs"
              onClick={() => navigate(`/t/${event.address}/${seat.id}`)}
            >
              Open ticket
            </button>
          ) : null}
          {status === "listed" && !mine ? (
            <button
              type="button"
              className={`btn ${listed === 0n ? "btn-amber" : "btn-ghost"} !min-h-9 px-3 text-xs`}
              onClick={() => start(event.address, seat.id)}
            >
              {listed === 0n ? "Take this seat" : "Buy resale"}
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost !min-h-9 px-3 text-xs"
            onClick={() => viewFromSeat(seat.id)}
          >
            View from here
          </button>
        </div>
      ) : null}
    </div>
  );
}

interface SeatCardLayerProps {
  event: EventInfo | undefined;
  layout: VenueLayout | undefined;
  seatMap: SeatMap | undefined;
}

/** Screen-space host for the card: positioned by the scene through `seatAnchor` (scene/anchor.ts). */
export function SeatCardLayer({ event, layout, seatMap }: SeatCardLayerProps) {
  const chapter = useDirector((s) => s.chapter);
  const hovered = useDirector((s) => s.hoveredSeat);
  const selected = useDirector((s) => s.selectedSeat);
  const { pathname } = useLocation();
  const id = selected ?? hovered;
  const seat = id != null ? layout?.byId.get(id) : undefined;
  // The ticket view already is the card for its seat; the spatial one would only cover the panel.
  if (chapter !== "venue" || !event || !seat || pathname.startsWith("/t/")) return null;
  return (
    <div
      key={seat.id}
      ref={(el) => {
        seatAnchor.el = el;
      }}
      className="seat-anchor"
      style={{ visibility: "hidden" }}
    >
      <SeatCard event={event} seat={seat} seatMap={seatMap} />
    </div>
  );
}
