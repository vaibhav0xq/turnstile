import { useEffect, useMemo, useState } from "react";
import type { AppConfig, EventInfo } from "../chain/config";
import { nextNightOff, nightsOn } from "./nights";

const NONE: EventInfo[] = [];

/**
 * `nightsOn` for the city: the bill, the beacons, the lit count and the tour's pick all read this one list,
 * so a beacon index means the same night everywhere. Direct links (`findEvent`) still see every event —
 * an old room opens, it just no longer has a beacon. Rather than polling a clock, each consumer wakes at
 * the moment the next night goes off, so they all drop it together and the array keeps its identity in
 * between (the city does not rebuild its beacons for a ticking clock).
 */
export function useNightsOn(config: AppConfig | undefined): EventInfo[] {
  const events = config?.events ?? NONE;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const real = Date.now();
    // A night went off between renders (the tab slept, or the list changed): catch the clock up first.
    if (nextNightOff(events, now) !== nextNightOff(events, real)) {
      setNow(real);
      return;
    }
    const off = nextNightOff(events, real);
    if (off === null) return;
    // setTimeout saturates past 2^31 − 1 ms (~24.8 days); anything further waits for the next render.
    const id = setTimeout(() => setNow(Date.now()), Math.min(off - real + 50, 2 ** 31 - 1));
    return () => clearTimeout(id);
  }, [events, now]);
  return useMemo(() => nightsOn(events, now), [events, now]);
}
