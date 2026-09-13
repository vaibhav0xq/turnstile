import type { SeatSpec, VenueLayout } from "./layout";

/**
 * Floor under every raised row: a ring sector per row, a riser down to the row in front, and for the
 * first row of a raised tier a short parapet with a lit lip. Derived from the seat positions, so any
 * layout (authored or generic) gets solid tiers without describing them twice.
 */
export interface RowArc {
  key: string;
  y: number;
  inner: number;
  outer: number;
  /** Cylinder-convention angles (x = r·sinθ, z = r·cosθ) around the layout centre. */
  thetaStart: number;
  thetaLength: number;
  /** Height of the vertical face at the row's front edge (0 → none). */
  riser: number;
  lip: boolean;
}

const PARAPET = 1.6;

export function rowArcs(layout: VenueLayout): RowArc[] {
  const { x: cx, z: cz } = layout.center;
  const out: RowArc[] = [];
  for (const section of layout.sections) {
    const rows = new Map<string, SeatSpec[]>();
    for (const id of section.seatIds) {
      const s = layout.byId.get(id);
      if (!s) continue;
      const list = rows.get(s.row) ?? [];
      list.push(s);
      rows.set(s.row, list);
    }
    const ordered = [...rows.values()]
      .map((seats) => {
        const first = seats[0] as SeatSpec;
        const r = Math.hypot(first.x - cx, first.z - cz);
        const angles = seats.map((s) => Math.atan2(s.x - cx, s.z - cz));
        return { seats, r, y: first.y, min: Math.min(...angles), max: Math.max(...angles) };
      })
      .sort((a, b) => a.r - b.r);
    ordered.forEach((row, i) => {
      if (row.y < 0.05) return; // flat on the house floor: nothing to build
      const prev = ordered[i - 1];
      const next = ordered[i + 1];
      const gap = next ? next.r - row.r : prev ? row.r - prev.r : 1.2;
      const n = row.seats.length;
      const pitch = n > 1 ? (row.max - row.min) / (n - 1) : 0.12;
      const margin = pitch * 0.55;
      const first = !prev || prev.y < 0.05;
      const riser = first ? Math.min(PARAPET, row.y) : Math.max(0, row.y - prev.y);
      out.push({
        key: `${section.tier}-${row.seats[0]?.row ?? i}`,
        y: row.y,
        inner: row.r - gap / 2,
        outer: row.r + gap / 2,
        thetaStart: row.min - margin,
        thetaLength: row.max - row.min + 2 * margin,
        riser,
        lip: first && row.y >= 1, // a balcony front, not the second step of a raked floor
      });
    });
  }
  return out;
}
