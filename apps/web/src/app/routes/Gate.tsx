import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { type AppConfig, findEvent } from "../../chain/config";
import { type SeatMap, seatMapQueryKey } from "../../chain/seats";
import { useDirector } from "../../scene/director";
import { GateScanner } from "../../ui/GateScanner";
import { Kicker, Stat } from "../../ui/primitives";

export function Gate({ config, seatMap }: { config: AppConfig | undefined; seatMap: SeatMap | undefined }) {
  const { address } = useParams();
  const event = findEvent(config, address);
  const showGate = useDirector((s) => s.showGate);
  const queryClient = useQueryClient();
  // `/gate/<event>#code=…` is the ticket's "walk up to the door" link: read once, then drop it from the URL so a
  // refresh or a share does not carry a (short-lived) entry code around.
  const [handed] = useState(() => {
    const code = new URLSearchParams(window.location.hash.slice(1)).get("code");
    if (code) window.history.replaceState(null, "", window.location.pathname + window.location.search);
    return code ?? undefined;
  });
  useEffect(() => {
    if (address) showGate(address);
  }, [address, showGate]);
  if (!config || !event) return null;
  const inside = seatMap ? [...seatMap.values()].filter((s) => s.checkedInAt > 0).length : event.checkedIn;
  const sold = seatMap ? seatMap.size : event.sold;
  return (
    <div className="overlay">
      <div className="absolute left-4 top-20 sm:left-6 sm:top-24">
        <Kicker className="fade-up">Gate</Kicker>
        <h1 className="display fade-up mt-1 text-4xl sm:text-5xl">{event.name}</h1>
        <div className="fade-up-late mt-4 flex gap-6">
          <Stat label="Inside" value={inside} tone="green" />
          <Stat label="Sold" value={sold} />
          <Stat label="Capacity" value={event.capacity} />
        </div>
        <p className="fade-up-late mt-3 max-w-xs text-xs text-muted">
          The relayer recovers the signer from the code, checks it against the bound door key on-chain, then
          submits <span className="mono">checkIn</span> from the gate wallet.
        </p>
      </div>
      <div className="absolute inset-x-4 bottom-4 flex justify-end sm:inset-x-6 sm:bottom-6">
        <GateScanner
          event={event}
          initialCode={handed}
          onAdmitted={() => void queryClient.invalidateQueries({ queryKey: seatMapQueryKey(event.address) })}
        />
      </div>
    </div>
  );
}
