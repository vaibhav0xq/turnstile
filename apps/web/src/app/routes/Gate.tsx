import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { type AppConfig, findEvent } from "../../chain/config";
import { type SeatMap, seatMapQueryKey } from "../../chain/seats";
import { useDirector } from "../../scene/director";
import { GateScanner } from "../../ui/GateScanner";
import { Kicker, Stat } from "../../ui/primitives";
import { RouteLoading, UnknownRoute, unknownEvent } from "../../ui/RouteState";
import { consumeGateFragment, storeGateToken } from "../gate-token";
import { useTour } from "../tour";

export function Gate({ config, seatMap }: { config: AppConfig | undefined; seatMap: SeatMap | undefined }) {
  const { address } = useParams();
  const event = findEvent(config, address);
  const showGate = useDirector((s) => s.showGate);
  const queryClient = useQueryClient();
  // `/gate/<event>#code=…` is the ticket's "walk up to the door" link and `#token=…` hands a protected door its
  // operator token: both are read once, then dropped from the URL so a refresh or a share carries neither.
  const [handed] = useState(() => consumeGateFragment());
  const [token, setToken] = useState<string | null>(handed.token);
  useEffect(() => {
    if (address) showGate(address);
  }, [address, showGate]);
  if (!config) return <RouteLoading label="Finding the door…" />;
  if (!event) return <UnknownRoute {...unknownEvent} />;
  const inside = seatMap ? [...seatMap.values()].filter((s) => s.checkedInAt > 0).length : event.checkedIn;
  const sold = seatMap ? seatMap.size : event.sold;
  return (
    <div className="overlay">
      <div className="scrim-top" aria-hidden />
      <div className="absolute left-4 top-20 sm:left-6 sm:top-24">
        <Kicker className="fade-up">Gate</Kicker>
        <h1 className="display fade-up mt-1 text-4xl sm:text-5xl">{event.name}</h1>
        <div className="fade-up-late mt-4 flex gap-6">
          <Stat label="Inside" value={inside} tone="green" />
          <Stat label="Sold" value={sold} />
          <Stat label="Capacity" value={event.capacity} />
        </div>
        <p className="fade-up-late mt-3 max-w-xs text-xs text-muted">
          The relayer verifies the signed code and bound door key then submits{" "}
          <span className="mono">checkIn</span>.
        </p>
        {!config.gateProtected ? (
          <div
            className="fade-up-late mt-3 flex max-w-xs items-start gap-2 text-xs text-muted"
            data-testid="gate-demo"
          >
            <span className="chip mono shrink-0 text-amber">open door · demo</span>
            <span>This link operates the demo door. Production doors require an operator token.</span>
          </div>
        ) : null}
      </div>
      <div className="absolute inset-x-4 bottom-4 flex justify-end sm:inset-x-6 sm:bottom-6">
        <GateScanner
          event={event}
          initialCode={handed.code}
          token={token}
          tokenRequired={config.gateProtected}
          onToken={(value) => {
            storeGateToken(value);
            setToken(value);
          }}
          onAdmitted={(result) => {
            useTour.getState().note({ admitHash: result.hash ?? null, admitMs: result.ms ?? null });
            void queryClient.invalidateQueries({ queryKey: seatMapQueryKey(event.address) });
          }}
        />
      </div>
    </div>
  );
}
