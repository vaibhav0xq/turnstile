import { mulberry } from "../lib/random.ts";

/**
 * The city's layout, as numbers: block grid, building masses (with their set-backs, podiums, spires and
 * roof plant), the far skyline and the point lights that outline it all. No three.js here, so the layout
 * can be tested under node; `City.tsx` turns it into instanced boxes and a point cloud.
 */

/** Downtown grid: 14 m blocks, 6 m streets, 24 × 24 blocks. */
export const BLOCK = 14;
export const STREET = 6;
export const PITCH = BLOCK + STREET;
export const HALF_BLOCKS = 12;
/** Half the width of downtown (the last street's centre line). */
export const TOWN_EXTENT = HALF_BLOCKS * PITCH;

/**
 * Where each event's beacon stands: on a street intersection, so the blocks around it make one plaza (see
 * `plazaRect`). The venue itself is rendered at the slot.
 */
export const BEACON_SLOTS: Array<[number, number]> = [
  [-40, -20],
  [40, 20],
  [-20, 60],
  [20, -60],
  [-60, 20],
  [60, -40],
];

export function beaconSlot(index: number): [number, number] {
  return BEACON_SLOTS[index % BEACON_SLOTS.length] ?? [0, 0];
}

/** Half the side of a plaza: the four blocks around the intersection plus the street between them. */
export const PLAZA_HALF = BLOCK + STREET / 2;

/** The venue's pavilion on its plaza, in the plaza's local metres: its width along the gate line, its height, its depth. */
export const PAVILION = { w: 20, h: 5.6, d: 12 } as const;
/** Where the turnstile line stands, local z, out in the forecourt; the lanes are `GATE_PITCH` apart. */
export const GATE_LINE_Z = 16;
export const GATE_PITCH = 1.7;
export const GATE_LANES = 4;
/** Lamp posts down both sides of a plaza, local x either side and local z: behind the pavilion, either side of the gate line, at the forecourt's end. */
export const PLAZA_LAMP_X = PLAZA_HALF - 4;
export const PLAZA_LAMP_Z: readonly [number, number, number, number] = [
  -(PLAZA_HALF - 4),
  GATE_LINE_Z - 5,
  GATE_LINE_Z + 5,
  PLAZA_HALF + PITCH - 4,
];

/**
 * A plaza's local frame. The pavilion faces along a street axis, away from downtown (local +z), so a camera
 * in the forecourt looks back through the gate line at the pavilion, the column and the towers behind.
 * `yaw` is the group's rotation about Y; `forward` is local +z in world XZ.
 */
export interface PlazaFrame {
  yaw: number;
  forward: [number, number];
}

export function plazaFrame(slot: readonly [number, number]): PlazaFrame {
  const [x, z] = slot;
  // the street axis that leads furthest from the origin; a beacon at the origin itself faces south
  const forward: [number, number] =
    Math.abs(x) >= Math.abs(z) && x !== 0 ? [Math.sign(x), 0] : [0, z === 0 ? 1 : Math.sign(z)];
  // rotation.y = yaw maps local (0, 0, 1) to world (sin yaw, 0, cos yaw)
  return { yaw: Math.atan2(forward[0], forward[1]), forward };
}

/** A point given in a plaza's local metres (x across the gate line, y up, z toward the doors), in world space. */
export function plazaToWorld(
  slot: readonly [number, number],
  local: readonly [number, number, number],
): [number, number, number] {
  const { forward } = plazaFrame(slot);
  // local +x is forward turned a quarter clockwise seen from above: (fz, -fx)
  const right: [number, number] = [forward[1], -forward[0]];
  return [
    slot[0] + right[0] * local[0] + forward[0] * local[2],
    local[1],
    slot[1] + right[1] * local[0] + forward[1] * local[2],
  ];
}

export interface Rect {
  min: [number, number];
  max: [number, number];
}

/**
 * The paved ground of a plaza: the four blocks around the beacon's intersection, plus the two in front of the
 * doors as a forecourt — six blocks, kerb to kerb.
 */
export function plazaRect(slot: readonly [number, number]): Rect {
  const { forward } = plazaFrame(slot);
  const min: [number, number] = [slot[0] - PLAZA_HALF, slot[1] - PLAZA_HALF];
  const max: [number, number] = [slot[0] + PLAZA_HALF, slot[1] + PLAZA_HALF];
  for (const axis of [0, 1] as const) {
    if (forward[axis] > 0) max[axis] += PITCH;
    if (forward[axis] < 0) min[axis] -= PITCH;
  }
  return { min, max };
}

export interface Building {
  x: number;
  z: number;
  w: number;
  d: number;
  /** height of this mass */
  h: number;
  /** where it starts: 0 on the ground, higher for a set-back tier, a spire or roof plant */
  y0: number;
  /** shared by every mass of one building, so they rise together in the reveal */
  seed: number;
}

export interface CityData {
  buildings: Building[];
  skyline: Building[];
  positions: Float32Array;
  scatter: Float32Array;
  seeds: Float32Array;
  sizes: Float32Array;
  warm: Float32Array;
}

interface Massing {
  masses: Building[];
  /** the top of the highest roof (where the aviation light sits) */
  top: number;
  /** the footprint that carries the roof-edge lights */
  roof: { x: number; z: number; w: number; d: number; y: number };
}

/**
 * One building from a footprint and a height: tall ones set back in two or three tiers or stand on a
 * podium, some carry a spire, the mid-rise ones roof plant. `rnd` is the layout stream.
 */
function massing(
  x: number,
  z: number,
  w: number,
  d: number,
  h: number,
  seed: number,
  rnd: () => number,
): Massing {
  const masses: Building[] = [];
  let roof = { x, z, w, d, y: h };
  let top = h;
  const tall = h > 34;
  const kind = rnd();
  if (tall && kind < 0.55) {
    // wedding-cake set-backs
    const base = h * 0.62;
    const second = h * 0.38;
    masses.push({ x, z, w, d, h: base, y0: 0, seed });
    masses.push({ x, z, w: w * 0.72, d: d * 0.72, h: second, y0: base, seed });
    roof = { x, z, w: w * 0.72, d: d * 0.72, y: h };
    if (rnd() < 0.5) {
      const crown = h * 0.15;
      masses.push({ x, z, w: w * 0.45, d: d * 0.45, h: crown, y0: h, seed });
      roof = { x, z, w: w * 0.45, d: d * 0.45, y: h + crown };
      top = h + crown;
    }
  } else if (tall && kind < 0.85) {
    // a tower on a podium that fills more of the block
    masses.push({
      x,
      z,
      w: Math.min(w * 1.3, BLOCK - 1),
      d: Math.min(d * 1.2, BLOCK - 1),
      h: 6 + rnd() * 3,
      y0: 0,
      seed,
    });
    masses.push({ x, z, w, d, h, y0: 0, seed });
  } else {
    masses.push({ x, z, w, d, h, y0: 0, seed });
  }
  if (h > 44 && rnd() < 0.45) {
    const spire = 6 + rnd() * 10;
    masses.push({ x, z, w: 0.9, d: 0.9, h: spire, y0: top, seed });
    top += spire;
  } else if (h > 12 && h <= 44 && rnd() < 0.6) {
    // roof plant: one or two boxes, kept off the parapet
    const n = 1 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) {
      const mw = 2 + rnd() * 2.5;
      const md = 2 + rnd() * 2;
      if (mw > w - 2 || md > d - 2) continue;
      masses.push({
        x: x + (rnd() - 0.5) * (w - mw - 1.5),
        z: z + (rnd() - 0.5) * (d - md - 1.5),
        w: mw,
        d: md,
        h: 1.5 + rnd() * 1.5,
        y0: h,
        seed,
      });
    }
  }
  return { masses, top, roof };
}

/**
 * The far skyline: clusters of tall slabs out in the haze, so the horizon is a city and not the edge of a
 * plane. Its own stream, so it never shifts the downtown generation.
 */
export function buildSkyline(): Building[] {
  const rnd = mulberry(4242);
  const towers: Building[] = [];
  const clusters = 15;
  for (let c = 0; c < clusters; c++) {
    const angle = ((c + rnd() * 0.6) / clusters) * Math.PI * 2;
    const radius = 300 + rnd() * 180;
    const tall = rnd() < 0.35;
    const n = 6 + Math.floor(rnd() * 10);
    for (let i = 0; i < n; i++) {
      const spread = 24 + rnd() * 70;
      const a = angle + (rnd() - 0.5) * 0.28;
      const r = radius + (rnd() - 0.5) * spread;
      const w = 10 + rnd() * 18;
      const d = 10 + rnd() * 18;
      const h = (tall ? 60 : 28) + rnd() * (tall ? 95 : 50);
      const seed = rnd();
      towers.push(...massing(Math.cos(a) * r, Math.sin(a) * r, w, d, h, seed, rnd).masses);
    }
  }
  // a low continuous belt between downtown and the clusters, so the ring never reads as islands
  for (let i = 0; i < 110; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 262 + rnd() * 70;
    towers.push({
      x: Math.cos(a) * r,
      z: Math.sin(a) * r,
      w: 9 + rnd() * 14,
      d: 9 + rnd() * 14,
      h: 14 + rnd() * 34,
      y0: 0,
      seed: rnd(),
    });
  }
  return towers;
}

/** Does the block with this centre face a plaza across a street (sharing an edge, not just a corner)? */
export function besidePlaza(
  cx: number,
  cz: number,
  beacons: ReadonlyArray<readonly [number, number]>,
): boolean {
  const reach = PITCH;
  return beacons.some((slot) => {
    const { min, max } = plazaRect(slot);
    const alongX = cx > min[0] && cx < max[0];
    const alongZ = cz > min[1] && cz < max[1];
    const nearX = cx > min[0] - reach && cx < max[0] + reach;
    const nearZ = cz > min[1] - reach && cz < max[1] + reach;
    return (alongX && nearZ) || (alongZ && nearX);
  });
}

/** Is the block with this centre part of a beacon's plaza (see `plazaRect`)? */
export function inPlaza(cx: number, cz: number, beacons: ReadonlyArray<readonly [number, number]>): boolean {
  return beacons.some((slot) => {
    const { min, max } = plazaRect(slot);
    return cx > min[0] && cx < max[0] && cz > min[1] && cz < max[1];
  });
}

/**
 * Deterministic downtown: blocks on a grid, towers near the centre, the plazas left open. The walls' windows
 * come from the mass material; the points here are what a shader on a box cannot draw — roof-edge lights,
 * aviation lights, street lamps, the suburbs and a sparkle on the far towers. `detail` thins the point mass
 * for the low tier; the buildings themselves stay.
 */
export function buildCity(beacons: ReadonlyArray<readonly [number, number]>, detail = 1): CityData {
  // Two streams: `rnd` shapes the buildings and must be consumed identically at every tier, `drnd` feeds the
  // point mass that `detail` thins — otherwise a tier change would regenerate a different city.
  const rnd = mulberry(1337);
  const drnd = mulberry(7331);
  const buildings: Building[] = [];
  const skyline = buildSkyline();
  const pos: number[] = [];
  const sca: number[] = [];
  const seed: number[] = [];
  const size: number[] = [];
  const warm: number[] = [];
  const push = (x: number, y: number, z: number, s: number, w: number) => {
    pos.push(x, y, z);
    const r = 260 + drnd() * 160;
    const th = drnd() * Math.PI * 2;
    const ph = Math.acos(2 * drnd() - 1);
    sca.push(r * Math.sin(ph) * Math.cos(th), 60 + r * Math.cos(ph) * 0.6, r * Math.sin(ph) * Math.sin(th));
    seed.push(drnd());
    size.push(s);
    warm.push(w);
  };
  for (let bx = -HALF_BLOCKS; bx < HALF_BLOCKS; bx++) {
    for (let bz = -HALF_BLOCKS; bz < HALF_BLOCKS; bz++) {
      const cx = bx * PITCH + PITCH / 2;
      const cz = bz * PITCH + PITCH / 2;
      if (inPlaza(cx, cz, beacons)) continue;
      const dist = Math.hypot(cx, cz);
      const downtown = Math.max(0, 1 - dist / 170);
      // the blocks that line a plaza stay low (shops, a hotel), so from the forecourt the towers behind
      // show over them; downtown proper rises from the next ring, under the light columns' height
      const cap = besidePlaza(cx, cz, beacons) ? 11 : 64;
      // 1–3 buildings per block
      const n = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < n; i++) {
        const w = 4 + rnd() * (BLOCK / n - 1.5);
        const d = 4 + rnd() * (BLOCK - 2);
        const h = Math.min(cap, 5 + rnd() * 14 + downtown * downtown * (30 + rnd() * 70));
        const ox = cx - BLOCK / 2 + w / 2 + (i * BLOCK) / n;
        const oz = cz - BLOCK / 2 + d / 2 + rnd() * Math.max(0, BLOCK - d);
        const { masses, top, roof } = massing(ox, oz, w, d, h, rnd(), rnd);
        buildings.push(...masses);
        // roof edge lights on the taller blocks define the skyline
        if (roof.y > 26) {
          const step = 2.6;
          for (let s = -roof.w / 2; s <= roof.w / 2; s += step) {
            push(roof.x + s, roof.y + 0.15, roof.z - roof.d / 2, 1.1, 0.2);
            push(roof.x + s, roof.y + 0.15, roof.z + roof.d / 2, 1.1, 0.2);
          }
          for (let s = -roof.d / 2 + step; s < roof.d / 2; s += step) {
            push(roof.x - roof.w / 2, roof.y + 0.15, roof.z + s, 1.1, 0.2);
            push(roof.x + roof.w / 2, roof.y + 0.15, roof.z + s, 1.1, 0.2);
          }
        }
        // aviation light on the tallest towers
        if (top > 56) push(ox, top + 0.6, oz, 3.4, 2);
      }
    }
  }
  // suburbs: loose scatter of low lights out to the haze, thinning with distance
  for (let i = 0; i < 26000 * detail; i++) {
    const r = 250 + drnd() ** 0.6 * 650;
    const th = drnd() * Math.PI * 2;
    if (drnd() < (r - 250) / 900) continue;
    const warmth = drnd() < 0.8 ? 0.7 + drnd() * 0.3 : drnd() * 0.3;
    push(Math.cos(th) * r, 0.6 + drnd() * drnd() * 14, Math.sin(th) * r, 1.4 + drnd() * 1.6, warmth);
  }
  // street lamps at the kerbs, staggered along both sides
  const lampStep = 12 / detail;
  for (let i = -HALF_BLOCKS; i <= HALF_BLOCKS; i++) {
    const line = i * PITCH;
    let side = 1;
    for (let t = -TOWN_EXTENT; t <= TOWN_EXTENT; t += lampStep) {
      push(line + side * 2.7, 3.6, t, 1.8, 0.95);
      push(t, 3.6, line - side * 2.7, 1.8, 0.95);
      side = -side;
    }
  }
  // the far towers carry a sparse sparkle and a red top, so the silhouette reads as inhabited
  for (const t of skyline) {
    if (t.y0 > 0) continue;
    const n = Math.floor((t.h / 9) * detail);
    for (let i = 0; i < n; i++) {
      const side = drnd() < 0.5 ? -1 : 1;
      const alongX = drnd() < 0.5;
      const u = drnd() - 0.5;
      push(
        t.x + (alongX ? u * t.w : (side * t.w) / 2),
        2 + drnd() * (t.h - 3),
        t.z + (alongX ? (side * t.d) / 2 : u * t.d),
        1.6 + drnd() * 1.2,
        drnd() < 0.75 ? 0.8 + drnd() * 0.2 : drnd() * 0.3,
      );
    }
    if (t.h > 90) push(t.x, t.h + 0.8, t.z, 3.8, 2);
  }
  return {
    buildings,
    skyline,
    positions: new Float32Array(pos),
    scatter: new Float32Array(sca),
    seeds: new Float32Array(seed),
    sizes: new Float32Array(size),
    warm: new Float32Array(warm),
  };
}
