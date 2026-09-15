import { useRef } from "react";
import type { AppConfig, EventInfo } from "../chain/config";
import { useNow } from "../live/hooks";
import { nightsOn } from "./nights";

/**
 * `nightsOn` for the city: the bill, the beacons, the lit count and the tour's pick all read this one list,
 * so a beacon index means the same night everywhere. Direct links (`findEvent`) still see every event —
 * an old room opens, it just no longer has a beacon. The array keeps its identity while its members do, so
 * the clock ticking does not rebuild the city.
 */
export function useNightsOn(config: AppConfig | undefined): EventInfo[] {
  const now = useNow(60_000);
  const on = nightsOn(config?.events ?? [], now);
  const kept = useRef<EventInfo[]>(on);
  if (kept.current.length !== on.length || kept.current.some((event, i) => event !== on[i]))
    kept.current = on;
  return kept.current;
}
