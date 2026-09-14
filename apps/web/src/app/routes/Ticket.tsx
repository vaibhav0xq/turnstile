import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useParams } from "react-router";
import { type AppConfig, findEvent, tierForSeat } from "../../chain/config";
import { mySeats, type SeatMap } from "../../chain/seats";
import { useIdentity } from "../../identity/store";
import { useDirector } from "../../scene/director";
import { RouteLoading, UnknownRoute, unknownEvent } from "../../ui/RouteState";
import { TicketPanel } from "../../ui/TicketPanel";
import { buildLayout } from "../../venues/layout";
import { useCheckout } from "../checkout";

export function Ticket({ config, seatMap }: { config: AppConfig | undefined; seatMap: SeatMap | undefined }) {
  const { address, tokenId: tokenParam } = useParams();
  const tokenId = Number(tokenParam);
  const event = findEvent(config, address);
  const queryClient = useQueryClient();
  const showVenue = useDirector((s) => s.showVenue);
  const selectSeat = useDirector((s) => s.selectSeat);
  const viewFromSeat = useDirector((s) => s.viewFromSeat);
  const setMine = useDirector((s) => s.setMine);
  const fan = useIdentity((s) => s.fan);
  const step = useCheckout((s) => s.step);
  const bindOnly = useCheckout((s) => s.bindOnly);
  const layout = useMemo(() => (event ? buildLayout(event) : null), [event]);

  useEffect(() => {
    if (address) showVenue(address);
  }, [address, showVenue]);

  useEffect(() => {
    if (!Number.isFinite(tokenId)) return;
    selectSeat(tokenId);
    const t = setTimeout(() => viewFromSeat(tokenId), 1400);
    return () => {
      clearTimeout(t);
      selectSeat(null);
    };
  }, [tokenId, selectSeat, viewFromSeat]);

  useEffect(() => {
    setMine(mySeats(seatMap, fan?.address).map((s) => s.id));
  }, [seatMap, fan?.address, setMine]);

  if (!config) return <RouteLoading label="Finding your seat…" />;
  if (!event || !layout) return <UnknownRoute {...unknownEvent} />;
  if (!Number.isInteger(tokenId) || !tierForSeat(event, tokenId)) {
    const ranges = event.tiers.map((t) => `${t.name} ${t.firstSeat}–${t.firstSeat + t.seatCount - 1}`);
    return (
      <UnknownRoute
        title="No such seat"
        detail={`${event.name} seats: ${ranges.join(", ")}. "${tokenParam ?? ""}" isn't one of them.`}
      />
    );
  }
  return (
    <div className="overlay">
      <div className="scrim-top" aria-hidden />
      <div className="absolute inset-x-4 bottom-4 flex justify-start sm:inset-x-6 sm:bottom-6">
        <TicketPanel
          config={config}
          event={event}
          layout={layout}
          tokenId={tokenId}
          state={seatMap?.get(tokenId)}
          loaded={seatMap !== undefined}
          binding={step === "binding"}
          onBind={() => void bindOnly(config, event, tokenId, queryClient)}
        />
      </div>
    </div>
  );
}
