// The next open seat in a tier, for the tier chips ("pick") and for checkout when the chosen seat was
// taken under us: the front-most row with an open seat (ids run front to back), then the open seat nearest
// that row's centre line — the best seat left, and a hero shot with the stage in the middle.
import type { EventInfo } from "../chain/config.ts";
import { type SeatMap, seatStatus } from "../chain/seats.ts";
import type { VenueLayout } from "../venues/layout.ts";

export function nextOpenSeat(
  event: EventInfo,
  layout: VenueLayout,
  seatMap: SeatMap | undefined,
  tierIndex: number,
  /** A seat the map has not caught up with yet (the one that just failed as taken). */
  exclude: number | null = null,
): number | null {
  const tier = event.tiers[tierIndex];
  if (!tier || !seatMap) return null; // before the map arrives every seat would look open
  let best: { id: number; off: number } | null = null;
  let row: string | undefined;
  for (let id = tier.firstSeat; id < tier.firstSeat + tier.seatCount; id++) {
    if (id === exclude || seatStatus(seatMap.get(id)) !== "available") continue;
    const spec = layout.byId.get(id);
    if (!spec) continue;
    if (row === undefined) row = spec.row;
    if (spec.row !== row) break;
    const off = Math.abs(spec.x - layout.center.x);
    if (!best || off < best.off) best = { id, off };
  }
  return best?.id ?? null;
}
