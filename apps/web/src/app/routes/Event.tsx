import { useEffect, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { type AppConfig, findEvent, tierPrice } from "../../chain/config";
import { mySeats, type SeatMap, seatStatus } from "../../chain/seats";
import { useIdentity } from "../../identity/store";
import { formatDate, formatMon } from "../../lib/format";
import { useDirector } from "../../scene/director";
import { Checkout } from "../../ui/Checkout";
import { Button, Kicker, StatusLegend } from "../../ui/primitives";
import { RouteLoading, UnknownRoute, unknownEvent } from "../../ui/RouteState";
import { buildLayout } from "../../venues/layout";
import { useCheckout } from "../checkout";
import { useTour } from "../tour";

export function Event({ config, seatMap }: { config: AppConfig | undefined; seatMap: SeatMap | undefined }) {
  const { address } = useParams();
  const navigate = useNavigate();
  const event = findEvent(config, address);
  const showVenue = useDirector((s) => s.showVenue);
  const selectSeat = useDirector((s) => s.selectSeat);
  const setMine = useDirector((s) => s.setMine);
  const viewMode = useDirector((s) => s.viewMode);
  const viewOverview = useDirector((s) => s.viewOverview);
  const fan = useIdentity((s) => s.fan);
  const checkoutSeat = useCheckout((s) => s.seatId);
  const cancelCheckout = useCheckout((s) => s.cancel);
  const tourActive = useTour((s) => s.active);
  const layout = useMemo(() => (event ? buildLayout(event) : null), [event]);

  useEffect(() => {
    if (address) showVenue(address);
  }, [address, showVenue]);

  useEffect(() => {
    setMine(mySeats(seatMap, fan?.address).map((s) => s.id));
  }, [seatMap, fan?.address, setMine]);

  // Arriving from an unsold seat's ticket page (`<Link state={{ seat }}>`) pre-selects that seat once the
  // map confirms it is still open. The state is consumed by replacing it, not by a ref: StrictMode re-runs
  // effects after the unmount cleanup above has cleared the selection, and a ref guard would skip the redo.
  const { pathname, state: navState } = useLocation() as {
    pathname: string;
    state: { seat?: unknown } | null;
  };
  useEffect(() => {
    if (!seatMap) return;
    const seat = navState?.seat;
    if (typeof seat !== "number" || !Number.isInteger(seat)) return;
    if (seatStatus(seatMap.get(seat)) === "available") selectSeat(seat);
    void navigate(pathname, { replace: true, state: null });
  }, [navState, seatMap, selectSeat, navigate, pathname]);

  useEffect(
    () => () => {
      selectSeat(null);
      cancelCheckout();
    },
    [selectSeat, cancelCheckout],
  );

  if (!config) return <RouteLoading />;
  if (!event || !layout) return <UnknownRoute {...unknownEvent} />;

  const counts = event.tiers.map((tier) => {
    let free = 0;
    for (let id = tier.firstSeat; id < tier.firstSeat + tier.seatCount; id++) {
      if (seatStatus(seatMap?.get(id)) === "available") free++;
    }
    return { tier, free };
  });

  // The tour highlights the cheapest tier that still has seats.
  const tourTier = counts
    .filter((c) => c.free > 0)
    .sort((a, b) =>
      tierPrice(a.tier) < tierPrice(b.tier) ? -1 : tierPrice(a.tier) > tierPrice(b.tier) ? 1 : 0,
    )[0]?.tier.index;

  const pickNext = (tierIndex: number) => {
    const tier = event.tiers[tierIndex];
    if (!tier || !seatMap) return; // before the map arrives every seat would look open
    // Front-most row with an open seat (ids run front to back), then the open seat nearest the centre
    // line of that row: the best seat left, and a hero shot with the stage in the middle.
    let best: { id: number; off: number } | null = null;
    let row: string | undefined;
    for (let id = tier.firstSeat; id < tier.firstSeat + tier.seatCount; id++) {
      if (seatStatus(seatMap.get(id)) !== "available") continue;
      const spec = layout.byId.get(id);
      if (!spec) continue;
      if (row === undefined) row = spec.row;
      if (spec.row !== row) break;
      const off = Math.abs(spec.x - layout.center.x);
      if (!best || off < best.off) best = { id, off };
    }
    if (best) selectSeat(best.id);
  };

  return (
    <div className="overlay">
      <div className="scrim-top" aria-hidden />
      <div className="absolute left-4 top-20 max-w-md sm:left-6 sm:top-24">
        <Kicker className="fade-up">{formatDate(event.startsAt)}</Kicker>
        <h1 className="display fade-up mt-1 text-4xl sm:text-5xl">{event.name}</h1>
        <p className="fade-up-late mt-2 text-sm text-paper/75">
          Pick a seat. No wallet. No app.{" "}
          {seatMap ? `${event.capacity - [...seatMap.values()].length} left.` : ""}
        </p>
        <div className="fade-up-late mt-4 flex flex-wrap gap-2">
          {counts.map(({ tier, free }) => (
            <button
              type="button"
              key={tier.index}
              className="chip mono hover:bg-ink-2 disabled:opacity-50"
              disabled={!seatMap || free === 0}
              onClick={() => pickNext(tier.index)}
              data-tour={seatMap && tier.index === tourTier ? "pick" : undefined}
              title="Pick the next available seat in this tier"
            >
              {tier.name} · {formatMon(tierPrice(tier))} · {free} left
            </button>
          ))}
        </div>
        <div className="fade-up-late mt-3">
          <StatusLegend />
        </div>
      </div>

      {viewMode !== "overview" && !tourActive ? (
        <div className="absolute right-4 top-20 sm:right-6 sm:top-24">
          <Button onClick={viewOverview}>← Back to the room</Button>
        </div>
      ) : null}

      <div className="absolute inset-x-4 bottom-4 flex justify-start sm:inset-x-6 sm:bottom-6">
        {checkoutSeat != null ? (
          <Checkout config={config} event={event} layout={layout} seatMap={seatMap} />
        ) : null}
      </div>
    </div>
  );
}
