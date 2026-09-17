import { useEffect, useRef } from "react";
import type { AppConfig } from "../../chain/config";
import { chainName } from "../../chain/config";
import { useDirector } from "../../scene/director";
import { Bill, useKeepOut } from "../../ui/Bill";
import { Kicker } from "../../ui/primitives";
import { useNightsOn } from "../use-nights-on";

/**
 * The city: pick a night. The 3D city is the interface here (a beacon per night, hover to light it, click
 * to dive) with the bill as the accessible twin. The guided run is developer tooling only: it starts from
 * `/city?tour=auto` (scripts/judge-run.mjs) and has no button in the product.
 */
export function City({ config }: { config: AppConfig | undefined }) {
  const showCity = useDirector((s) => s.showCity);
  const copy = useRef<HTMLDivElement>(null);
  useEffect(() => {
    showCity();
  }, [showCity]);
  useKeepOut(copy);
  const lit = useNightsOn(config).length;
  return (
    <div className="overlay flex flex-col overflow-y-auto overscroll-contain">
      <div className="scrim-bottom" aria-hidden />
      <div className="scrim-left" aria-hidden />
      {/* Pass-through block: the city takes the pointer wherever there is no copy or card, so a beacon can be
          hovered and clicked directly. `shrink-0` + min-height: see the landing for why. */}
      <div className="overlay-passthrough relative flex min-h-dvh shrink-0 flex-col justify-end gap-6 p-5 pb-8 pt-20 sm:flex-row sm:items-end sm:justify-between sm:p-8 sm:pt-24">
        <div ref={copy} className="max-w-md">
          <Kicker className="fade-up">
            {config ? chainName(config.chainId) : "connecting"} ·{" "}
            {lit === 0 ? (config ? "dark tonight" : "lighting the beacons…") : `${lit} lit`}
          </Kicker>
          <h1 className="display fade-up mt-2 text-5xl sm:text-6xl">Pick a night.</h1>
          <p className="fade-up-late mt-3 max-w-sm text-sm text-paper/75 sm:text-base">
            Pick a beacon or a card to open the room. Choose a seat and the passkey does the rest.
          </p>
        </div>
        <Bill config={config} tourTargets className="fade-up-late sm:w-80" />
      </div>
    </div>
  );
}
