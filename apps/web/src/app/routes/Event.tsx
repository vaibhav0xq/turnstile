import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { type AppConfig, findEvent, tierPrice } from "../../chain/config";
import { mySeats, type SeatMap, seatStatus } from "../../chain/seats";
import { useIdentity } from "../../identity/store";
import { formatDate, formatMon } from "../../lib/format";
import { useDirector } from "../../scene/director";
import { Checkout } from "../../ui/Checkout";
import { Button, Kicker, StatusLegend } from "../../ui/primitives";
import { buildLayout } from "../../venues/layout";
import { useCheckout } from "../checkout";

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
  const layout = useMemo(() => (event ? buildLayout(event) : null), [event]);

  useEffect(() => {
    if (address) showVenue(address);
  }, [address, showVenue]);

  useEffect(() => {
    setMine(mySeats(seatMap, fan?.address).map((s) => s.id));
  }, [seatMap, fan?.address, setMine]);

  useEffect(
    () => () => {
      selectSeat(null);
      cancelCheckout();
    },
    [selectSeat, cancelCheckout],
  );

  if (config && address && !event) {
    return (
      <div className="overlay grid place-items-center">
        <div className="glass rounded-2xl p-6 text-center">
          <div className="text-lg">No event at this address</div>
          <Button className="mt-4" onClick={() => navigate("/")}>
            Back to the city
          </Button>
        </div>
      </div>
    );
  }
  if (!event || !layout || !config) return null;

  const counts = event.tiers.map((tier) => {
    let free = 0;
    for (let id = tier.firstSeat; id < tier.firstSeat + tier.seatCount; id++) {
      if (seatStatus(seatMap?.get(id)) === "available") free++;
    }
    return { tier, free };
  });

  const pickNext = (tierIndex: number) => {
    const tier = event.tiers[tierIndex];
    if (!tier) return;
    // Front-most available seat in that tier (ids are laid out front to back).
    for (let id = tier.firstSeat; id < tier.firstSeat + tier.seatCount; id++) {
      if (seatStatus(seatMap?.get(id)) === "available") {
        selectSeat(id);
        return;
      }
    }
  };

  return (
    <div className="overlay">
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
              disabled={free === 0}
              onClick={() => pickNext(tier.index)}
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

      {viewMode === "seat" ? (
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
