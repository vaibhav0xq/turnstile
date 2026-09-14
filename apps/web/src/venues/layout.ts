// Procedural venues. A layout maps every seat id an event sells to a place in the room, so the picker,
// the ticket ("your view") and the gate all share one geometry. Two authored houses match the demo events
// by their on-chain `venue` id; anything else gets a clean fan-shaped generic room sized from its tiers.
import { keccak256, stringToBytes } from "viem";
import type { EventInfo, TierInfo } from "../chain/config";

export type VenueKind = "club" | "theatre" | "generic";

export interface SeatSpec {
  id: number;
  tier: number;
  x: number;
  y: number;
  z: number;
  /** Yaw so the seat faces the stage. */
  rotY: number;
  section: string;
  row: string;
  number: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Waypoint {
  position: Vec3;
  target: Vec3;
}

export interface SectionSpec {
  tier: number;
  name: string;
  /** Instanced body shape. */
  shape: "spot" | "booth" | "chair";
  accent: string;
  body: string;
  seatIds: number[];
}

export interface VenueLayout {
  kind: VenueKind;
  seats: SeatSpec[];
  byId: Map<number, SeatSpec>;
  sections: SectionSpec[];
  stage: { z: number; width: number; depth: number; height: number };
  /** Centre the seat rows fan out from (the tiers are arcs around it; the stage sits just behind it). */
  center: Vec3;
  /** Radius of the room shell. */
  radius: number;
  camera: { overview: Waypoint; entrance: Waypoint; stageFocus: Vec3 };
}

export const VENUE_IDS = {
  club: keccak256(stringToBytes("venue:metropolis-club:v1")),
  theatre: keccak256(stringToBytes("venue:metropolis-theatre:v1")),
} as const;

export function venueKind(event: Pick<EventInfo, "venue" | "tiers">): VenueKind {
  const v = event.venue.toLowerCase();
  if (v === VENUE_IDS.club) return "club";
  if (v === VENUE_IDS.theatre) return "theatre";
  return "generic";
}

const ROWS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

interface ArcOptions {
  center: Vec3;
  radius: number;
  spanDeg: number;
  y: number;
  count: number;
}

/** Points along an arc facing the centre (stage), left to right. */
function arc({ center, radius, spanDeg, y, count }: ArcOptions): Array<Vec3 & { rotY: number }> {
  const out: Array<Vec3 & { rotY: number }> = [];
  const span = (spanDeg * Math.PI) / 180;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const theta = -span / 2 + t * span;
    const x = center.x + radius * Math.sin(theta);
    const z = center.z + radius * Math.cos(theta);
    out.push({ x, y, z, rotY: Math.atan2(center.x - x, center.z - z) });
  }
  return out;
}

interface RowsOptions {
  tier: TierInfo;
  section: string;
  center: Vec3;
  firstRadius: number;
  rowGap: number;
  spanDeg: number;
  perRow: number;
  baseY: number;
  rake: number;
  /** Rows can widen a little as they move back. */
  spanGrowthDeg?: number;
}

/** Fills a tier's seat ids across concentric rows, front to back. */
function rows(o: RowsOptions): SeatSpec[] {
  const seats: SeatSpec[] = [];
  const total = o.tier.seatCount;
  const rowCount = Math.ceil(total / o.perRow);
  let id = o.tier.firstSeat;
  for (let r = 0; r < rowCount && id < o.tier.firstSeat + total; r++) {
    const count = Math.min(o.perRow, o.tier.firstSeat + total - id);
    const pts = arc({
      center: o.center,
      radius: o.firstRadius + r * o.rowGap,
      spanDeg: o.spanDeg + (o.spanGrowthDeg ?? 0) * r,
      y: o.baseY + r * o.rake,
      count,
    });
    pts.forEach((p, i) => {
      seats.push({
        id,
        tier: o.tier.index,
        x: p.x,
        y: p.y,
        z: p.z,
        rotY: p.rotY,
        section: o.section,
        row: ROWS[r % ROWS.length] ?? String(r + 1),
        number: i + 1,
      });
      id++;
    });
  }
  return seats;
}

function finish(
  kind: VenueKind,
  sectionsIn: Array<Omit<SectionSpec, "seatIds"> & { seats: SeatSpec[] }>,
  stage: VenueLayout["stage"],
  center: Vec3,
  radius: number,
  camera: VenueLayout["camera"],
): VenueLayout {
  const seats = sectionsIn.flatMap((s) => s.seats).sort((a, b) => a.id - b.id);
  const byId = new Map(seats.map((s) => [s.id, s]));
  const sections: SectionSpec[] = sectionsIn.map(({ seats: ss, ...rest }) => ({
    ...rest,
    seatIds: ss.map((s) => s.id),
  }));
  return { kind, seats, byId, sections, stage, center, radius, camera };
}

const AMBER = "#ffb457";
const ROSE = "#ff7a9e";
const GOLD = "#e8c27a";
const IVORY = "#f3efe7";
const CORAL = "#ff9d6b";

function clubLayout(event: EventInfo): VenueLayout {
  const stage = { z: -17, width: 14, depth: 5, height: 0.9 };
  const center: Vec3 = { x: 0, y: 0, z: stage.z + 1 };
  const [floor, booth, ...rest] = event.tiers;
  const sections: Array<Omit<SectionSpec, "seatIds"> & { seats: SeatSpec[] }> = [];
  if (floor) {
    sections.push({
      tier: floor.index,
      name: floor.name,
      shape: "spot",
      accent: AMBER,
      body: "#1a1611",
      seats: rows({
        tier: floor,
        section: floor.name,
        center,
        firstRadius: 8,
        rowGap: 1.0,
        spanDeg: 150,
        perRow: 30,
        baseY: 0,
        rake: 0,
        spanGrowthDeg: 0.4,
      }),
    });
  }
  if (booth) {
    sections.push({
      tier: booth.index,
      name: booth.name,
      shape: "booth",
      accent: ROSE,
      body: "#221018",
      seats: rows({
        tier: booth,
        section: booth.name,
        center,
        firstRadius: 21.2,
        rowGap: 2.4,
        spanDeg: 132,
        perRow: 12,
        baseY: 2.6,
        rake: 0.4,
      }),
    });
  }
  rest.forEach((tier, i) => {
    sections.push({
      tier: tier.index,
      name: tier.name,
      shape: "chair",
      accent: GOLD,
      body: "#1c1a16",
      seats: rows({
        tier,
        section: tier.name,
        center,
        firstRadius: 25 + i * 3,
        rowGap: 1.2,
        spanDeg: 120,
        perRow: 28,
        baseY: 4.2 + i * 1.5,
        rake: 0.35,
      }),
    });
  });
  return finish("club", sections, stage, center, 30, {
    overview: { position: { x: 0, y: 15, z: 24 }, target: { x: 0, y: 0.8, z: -5 } },
    // The door opens onto the mezzanine: eye height on the slab, looking down over the floor.
    entrance: { position: { x: 0, y: 6.2, z: 9.4 }, target: { x: 0, y: 0.6, z: -8 } },
    stageFocus: { x: 0, y: 2.2, z: stage.z - 1.5 },
  });
}

function theatreLayout(event: EventInfo): VenueLayout {
  const stage = { z: -15, width: 16, depth: 7, height: 1.1 };
  const center: Vec3 = { x: 0, y: 0, z: stage.z + 2 };
  const [stalls, circle, balcony, ...rest] = event.tiers;
  const sections: Array<Omit<SectionSpec, "seatIds"> & { seats: SeatSpec[] }> = [];
  if (stalls) {
    sections.push({
      tier: stalls.index,
      name: stalls.name,
      shape: "chair",
      accent: GOLD,
      body: "#3a1519",
      seats: rows({
        tier: stalls,
        section: stalls.name,
        center,
        firstRadius: 9,
        rowGap: 1.15,
        spanDeg: 74,
        perRow: 20,
        baseY: 0,
        rake: 0.16,
        spanGrowthDeg: 0.8,
      }),
    });
  }
  if (circle) {
    sections.push({
      tier: circle.index,
      name: circle.name,
      shape: "chair",
      accent: IVORY,
      body: "#3a1519",
      seats: rows({
        tier: circle,
        section: circle.name,
        center,
        firstRadius: 18,
        rowGap: 1.15,
        spanDeg: 84,
        perRow: 20,
        baseY: 4.6,
        rake: 0.42,
        spanGrowthDeg: 0.6,
      }),
    });
  }
  if (balcony) {
    sections.push({
      tier: balcony.index,
      name: balcony.name,
      shape: "chair",
      accent: CORAL,
      body: "#3a1519",
      seats: rows({
        tier: balcony,
        section: balcony.name,
        center,
        firstRadius: 22.6,
        rowGap: 1.15,
        spanDeg: 90,
        perRow: 20,
        baseY: 8.8,
        rake: 0.5,
        spanGrowthDeg: 0.6,
      }),
    });
  }
  rest.forEach((tier, i) => {
    sections.push({
      tier: tier.index,
      name: tier.name,
      shape: "chair",
      accent: AMBER,
      body: "#3a1519",
      seats: rows({
        tier,
        section: tier.name,
        center,
        firstRadius: 26 + i * 2,
        rowGap: 1.15,
        spanDeg: 90,
        perRow: 20,
        baseY: 12.5 + i * 2,
        rake: 0.5,
      }),
    });
  });
  return finish("theatre", sections, stage, center, 31, {
    // From a high side box: straight from the back the balcony overhang hides the tiers below it, from
    // the side all three stack up in one frame with the proscenium at the left.
    overview: { position: { x: -23, y: 17, z: 12 }, target: { x: 3, y: 2.5, z: -4 } },
    // The door looks back at the house from the front-left corner, the way the ushers see it: stalls,
    // circle and balcony stacked in one frame. From behind the stalls the circle overhang hides all of it.
    entrance: { position: { x: -13, y: 5.5, z: -4 }, target: { x: 4, y: 5, z: 12 } },
    stageFocus: { x: 0, y: 2.6, z: stage.z - 1 },
  });
}

function genericLayout(event: EventInfo): VenueLayout {
  const stage = { z: -15, width: 14, depth: 5, height: 0.9 };
  const center: Vec3 = { x: 0, y: 0, z: stage.z + 1 };
  const accents = [AMBER, ROSE, GOLD, IVORY, CORAL];
  let radius = 6;
  let y = 0;
  const sections = event.tiers.map((tier, i) => {
    const perRow = 24;
    const seats = rows({
      tier,
      section: tier.name,
      center,
      firstRadius: radius,
      rowGap: 1.2,
      spanDeg: 110,
      perRow,
      baseY: y,
      rake: 0.18,
      spanGrowthDeg: 0.5,
    });
    const rowCount = Math.ceil(tier.seatCount / perRow);
    radius += rowCount * 1.2 + 1.6;
    y += rowCount * 0.18 + 1.2;
    return {
      tier: tier.index,
      name: tier.name,
      shape: "chair" as const,
      accent: accents[i % accents.length] ?? AMBER,
      body: "#1c1a16",
      seats,
    };
  });
  return finish("generic", sections, stage, center, Math.max(26, radius + 4), {
    overview: { position: { x: 0, y: 14, z: radius + 8 }, target: { x: 0, y: 1.5, z: -5 } },
    entrance: { position: { x: 0, y: 2.4, z: radius + 6 }, target: { x: 0, y: 1.6, z: -8 } },
    stageFocus: { x: 0, y: 2.2, z: stage.z - 1.5 },
  });
}

const cache = new Map<string, VenueLayout>();

export function buildLayout(event: EventInfo): VenueLayout {
  const key = `${event.address.toLowerCase()}:${event.tiers.map((t) => `${t.firstSeat}-${t.seatCount}`).join(",")}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const kind = venueKind(event);
  const layout =
    kind === "club" ? clubLayout(event) : kind === "theatre" ? theatreLayout(event) : genericLayout(event);
  cache.set(key, layout);
  return layout;
}

/** Camera placement for "the view from seat N". */
export function seatViewpoint(layout: VenueLayout, seat: SeatSpec): Waypoint {
  const eye = layout.kind === "club" && seat.tier === 0 ? 1.65 : 1.15;
  const back = 0.55;
  const dx = Math.sin(seat.rotY);
  const dz = Math.cos(seat.rotY);
  return {
    position: { x: seat.x - dx * back, y: seat.y + eye, z: seat.z - dz * back },
    target: layout.camera.stageFocus,
  };
}

/**
 * A hero shot of one seat: a few metres behind and above it, on the line from the stage, so the seat sits
 * in the lower third with the stage lit behind it.
 */
export function seatFocus(layout: VenueLayout, seat: SeatSpec): Waypoint {
  const dx = Math.sin(seat.rotY);
  const dz = Math.cos(seat.rotY);
  const spot = layout.kind === "club" && seat.tier === 0;
  const back = spot ? 6.5 : 7;
  const up = spot ? 3.2 : 3.6;
  // Aim past and a little above the seat: it sits in the lower third, the followspot has room to rise
  // through the frame, and the stage stays in the middle.
  const ahead = spot ? 2.5 : 3;
  return {
    position: { x: seat.x - dx * back, y: seat.y + up, z: seat.z - dz * back },
    target: { x: seat.x + dx * ahead, y: seat.y + (spot ? 1.1 : 1.4), z: seat.z + dz * ahead },
  };
}

export function seatLabel(seat: SeatSpec): string {
  return `${seat.section} · Row ${seat.row} · ${seat.number}`;
}
