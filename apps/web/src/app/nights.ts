import type { EventInfo } from "../chain/config";

/**
 * How long a night stays on the bill after doors. The city is "tonight", not an archive: a room whose doors
 * opened this evening is still on while people are inside, one from last week is not. Sales close at doors
 * on chain, so a night past this point has nothing left to take.
 */
export const NIGHT_LINGER_MS = 6 * 3_600_000;

/** The nights still on: everything the deployment knows, minus rooms whose doors are hours behind. */
export function nightsOn<T extends Pick<EventInfo, "startsAt">>(events: readonly T[], now: number): T[] {
  return events.filter((event) => event.startsAt * 1000 + NIGHT_LINGER_MS > now);
}

/** When the next of these nights goes off (ms since epoch), or null when none of them will. */
export function nextNightOff<T extends Pick<EventInfo, "startsAt">>(
  events: readonly T[],
  now: number,
): number | null {
  let next: number | null = null;
  for (const event of events) {
    const off = event.startsAt * 1000 + NIGHT_LINGER_MS;
    if (off > now && (next === null || off < next)) next = off;
  }
  return next;
}
