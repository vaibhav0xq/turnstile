import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { type AppConfig, findEvent, tierPrice } from "../../chain/config";
import { mySeats, type SeatMap, seatStatus } from "../../chain/seats";
import { useIdentity } from "../../identity/store";
import { formatDate, formatMon } from "../../lib/format";
import { useDirector } from "../../scene/director";
import { Checkout } from "../../ui/Checkout";
import { Button, Kicker, StatusLegend } from "../../ui/primitives";
import { RouteLoading, UnknownRoute, unknownEvent } from "../../ui/RouteState";
import { SeatList } from "../../ui/SeatList";
import { buildLayout } from "../../venues/layout";
import { useCheckout } from "../checkout";
import { nextOpenSeat } from "../next-seat";
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
  const flat = useDirector((s) => s.flat);
  // The 2D list is the way in without a scene (no WebGL) and for keyboards; it opens itself in flat mode.
  const [listOpen, setListOpen] = useState(flat);
  const listToggle = useRef<HTMLButtonElement>(null);
  // Checkout must not open underneath the list (it does on phones); flat mode reopens the list afterwards.
  useEffect(() => {
    if (checkoutSeat != null) setListOpen(false);
    else if (flat) setListOpen(true);
  }, [checkoutSeat, flat]);
  const closeList = () => {
    setListOpen(false);
    listToggle.current?.focus();
  };
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

  // Escape backs out one layer at a time: the list, then checkout (never mid-transaction), then the seat
  // view, then the selection — the same order a pointer would close them in.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || tourActive) return;
      const d = useDirector.getState();
      const c = useCheckout.getState();
      const busy =
        c.step === "identity" || c.step === "funding" || c.step === "buying" || c.step === "binding";
      // in flat mode the list is the room, so Escape leaves it alone
      if (listOpen && !flat) closeList();
      else if (c.seatId != null) {
        if (!busy) c.cancel();
      } else if (d.viewMode !== "overview") d.viewOverview();
      else if (d.selectedSeat != null) d.selectSeat(null);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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
    const best = nextOpenSeat(event, layout, seatMap, tierIndex);
    if (best !== null) selectSeat(best);
  };

  return (
    <div className="overlay">
      <div className="scrim-top" aria-hidden />
      <div className="absolute left-4 right-4 top-16 max-w-md sm:left-6 sm:right-auto sm:top-24">
        <Kicker className="fade-up">{formatDate(event.startsAt)}</Kicker>
        <h1 className="display fade-up mt-1 text-3xl sm:text-5xl">{event.name}</h1>
        <p className="fade-up-late mt-1.5 text-[13px] text-paper/75 sm:mt-2 sm:text-sm">
          Pick a seat. No wallet. No app.{" "}
          {seatMap ? `${event.capacity - [...seatMap.values()].length} left.` : ""}
        </p>
        <div className="chips-compact fade-up-late mt-3 flex flex-wrap gap-2 sm:mt-4">
          {counts.map(({ tier, free }) => (
            <button
              type="button"
              key={tier.index}
              className="chip mono hover:bg-ink-2 disabled:opacity-50"
              disabled={!seatMap || free === 0}
              onClick={() => pickNext(tier.index)}
              data-tour={seatMap && tier.index === tourTier ? "pick" : undefined}
              title={
                seatMap && free === 0
                  ? "Every seat in this tier is taken"
                  : "Pick the next available seat in this tier"
              }
            >
              {tier.name} · {formatMon(tierPrice(tier))} ·{" "}
              {!seatMap ? "…" : free === 0 ? "sold out" : `${free} left`}
            </button>
          ))}
          <button
            ref={listToggle}
            type="button"
            className={`chip mono hover:bg-ink-2 ${listOpen ? "text-paper" : ""}`}
            aria-pressed={listOpen}
            aria-controls="seat-list"
            onClick={() => setListOpen((o) => !o)}
            title="Every seat as a list, for keyboards and machines without 3D"
          >
            {listOpen ? "Hide list" : "Seat list"}
          </button>
        </div>
        <div className="fade-up-late mt-2.5 sm:mt-3">
          <StatusLegend />
        </div>
      </div>

      {viewMode !== "overview" && !tourActive && !listOpen ? (
        <div className="absolute right-4 top-20 sm:right-6 sm:top-24">
          <Button onClick={viewOverview}>← Back to the room</Button>
        </div>
      ) : null}

      {listOpen ? (
        <div id="seat-list">
          <SeatList event={event} layout={layout} seatMap={seatMap} onClose={closeList} />
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
