import { create } from "zustand";
import { beaconSlot, plazaToWorld } from "./city-gen.ts";

/**
 * The landing's night flight: a camera path over the city that the page scroll drives. Each key belongs to
 * one story section — the camera is exactly at key `i` when section `i`'s top meets the top of the viewport —
 * and the last key is the city pose the picker (`/city`) uses, so leaving the landing needs no cut.
 *
 * Pure numbers here (no three.js) so the path can be tested under node; the rig turns samples into a
 * `setLookAt`.
 */

export type Vec3 = readonly [number, number, number];

export interface FlightKey {
  /** camera position */
  p: Vec3;
  /** look-at target */
  t: Vec3;
  /** vertical field of view, degrees */
  fov: number;
}

/** The picker's pose: where `/city` sits and where the flight lands. */
export const CITY_POSE: FlightKey = { p: [0, 78, 236], t: [0, 18, 0], fov: 42 };

/** A point in a beacon's plaza (see `plazaToWorld`), by the event's slot index. */
const at = (slot: number, local: readonly [number, number, number]): Vec3 =>
  plazaToWorld(beaconSlot(slot), local);

/**
 * Landscape keys — the door, then the city. The hero stands at the first venue's turnstile line at eye
 * level, looking through the gates at the pavilion, its column and the towers behind → I: a step to the
 * side, still on the plaza → II: up over the same plaza, the ring on the roof and the streets around it →
 * III: across town, over the second venue → the city pose. The plaza keys are given in each plaza's local
 * metres (x across the gate line, z toward the doors), so moving a beacon moves its shots with it.
 */
export const FLIGHT_KEYS: readonly FlightKey[] = [
  { p: at(0, [-1, 2.6, 26]), t: at(0, [-2.5, 3.2, 6]), fov: 36 },
  { p: at(0, [-14, 4.2, 30]), t: at(0, [1, 3, 6]), fov: 40 },
  { p: at(0, [-26, 46, 44]), t: at(0, [-4, 6, 4]), fov: 40 },
  { p: at(1, [24, 30, 42]), t: at(1, [4, 5, 4]), fov: 40 },
  CITY_POSE,
];

/**
 * The keys on a plaza stand at eye level; from II on the flight is airborne. Nothing on a plaza is taller
 * than the pavilion (7) except the column, and the masses around a beacon top out at 22.
 */
export const FLIGHT_FLOOR_PLAZA = 1.5;
export const FLIGHT_FLOOR_AIR = 24;
/** The first airborne key; the path is above the roofs from here to the landing. */
export const FIRST_AIR_KEY = 2;

/**
 * Where the camera is along the flight, written by the rig every frame; `inFlight` while the rig holds the
 * camera (through the landing on the picker's pose, after the page has let go). The beacon labels read it.
 */
export const flightPose = { u: 0, inFlight: false };

/** The picker's labels and leader lines stay off until the flight has nearly landed (they are its UI). */
export const LABELS_FROM = 3.6;

/**
 * The city's haze, one value for the whole night: the far ring sits in it from the street and from the air
 * alike, and the masses add their own ground haze with distance. (A ramp that thinned it for the hero made
 * the landing look like a different evening from the picker.)
 */
export const CITY_FOG_DENSITY = 0.0019;

/**
 * Portrait keys: a phone's narrow frame needs a wider lens to hold the same subject. The hero steps back to
 * the end of the forecourt and squares up, so the whole marquee fits the narrow frame above the copy; the
 * other plaza key keeps its footing (backing off would put it inside the block behind) and aims a little
 * higher, since the copy sits at the foot of the screen; in the air the keys back off from the target by a
 * quarter. The last key stays the city pose (the picker's own portrait handling takes over there).
 */
export const PORTRAIT_KEYS: readonly FlightKey[] = FLIGHT_KEYS.map((k, i) => {
  if (i === FLIGHT_KEYS.length - 1) return k;
  if (i === 0) return { p: at(0, [0, 2.8, 35]), t: at(0, [0, 1.2, 4]), fov: 48 };
  if (i < FIRST_AIR_KEY) return { p: k.p, t: [k.t[0], k.t[1] + 2.2, k.t[2]], fov: 48 };
  return {
    p: [
      k.t[0] + (k.p[0] - k.t[0]) * 1.25,
      Math.max(FLIGHT_FLOOR_AIR, k.t[1] + (k.p[1] - k.t[1]) * 1.25),
      k.t[2] + (k.p[2] - k.t[2]) * 1.25,
    ],
    t: k.t,
    fov: 48,
  };
});

/** How fast the camera follows the scroll (per second, exponential): a flick settles in about half a second. */
export const FLIGHT_DAMPING = 6;

export interface FlightSample {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

/**
 * Centripetal Catmull-Rom through the keys, `u` in key units (0 = first key, n-1 = last). Centripetal
 * parametrisation keeps the path from looping or overshooting where the keys are unevenly spaced, which
 * matters when a 270-unit drop is followed by a 100-unit hop. Ends are clamped.
 */
export function sampleFlight(keys: readonly FlightKey[], u: number, out: FlightSample): FlightSample {
  const n = keys.length;
  if (n === 0) throw new Error("flight needs at least one key");
  if (n === 1) {
    const k = keys[0] as FlightKey;
    out.position = [...k.p];
    out.target = [...k.t];
    out.fov = k.fov;
    return out;
  }
  const clamped = Math.min(Math.max(u, 0), n - 1);
  const i = Math.min(Math.floor(clamped), n - 2);
  const w = clamped - i;
  const k0 = keys[Math.max(i - 1, 0)] as FlightKey;
  const k1 = keys[i] as FlightKey;
  const k2 = keys[i + 1] as FlightKey;
  const k3 = keys[Math.min(i + 2, n - 1)] as FlightKey;
  if (w === 0 || w === 1) {
    // exactly on a key: hand back the key itself, so the landing's last sample *is* the city pose
    const k = w === 0 ? k1 : k2;
    out.position = [...k.p];
    out.target = [...k.t];
    out.fov = k.fov;
    return out;
  }
  out.position = catmullRom(k0.p, k1.p, k2.p, k3.p, w);
  out.target = catmullRom(k0.t, k1.t, k2.t, k3.t, w);
  // the lens eases between keys so a fov change never reads as a snap at a section boundary
  const s = w * w * (3 - 2 * w);
  out.fov = k1.fov + (k2.fov - k1.fov) * s;
  return out;
}

function catmullRom(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, w: number): [number, number, number] {
  // Barry–Goldman with alpha = 0.5; duplicated end keys collapse to a straight segment.
  const t0 = 0;
  const t1 = t0 + knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  if (t2 === t1) return [p1[0], p1[1], p1[2]];
  const t = t1 + (t2 - t1) * w;
  const out: [number, number, number] = [0, 0, 0];
  for (let axis = 0; axis < 3; axis++) {
    const a1 = lerpKnot(p0[axis] as number, p1[axis] as number, t0, t1, t);
    const a2 = lerpKnot(p1[axis] as number, p2[axis] as number, t1, t2, t);
    const a3 = lerpKnot(p2[axis] as number, p3[axis] as number, t2, t3, t);
    const b1 = lerpKnot(a1, a2, t0, t2, t);
    const b2 = lerpKnot(a2, a3, t1, t3, t);
    out[axis] = lerpKnot(b1, b2, t1, t2, t);
  }
  return out;
}

function knot(a: Vec3, b: Vec3): number {
  const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  // a repeated key would give a zero knot span; a floor keeps the divisions finite
  return Math.max(Math.sqrt(d), 1e-3);
}

function lerpKnot(a: number, b: number, ta: number, tb: number, t: number): number {
  if (tb === ta) return a;
  return ((tb - t) / (tb - ta)) * a + ((t - ta) / (tb - ta)) * b;
}

/**
 * Scroll position → key units. `tops` are the story sections' offsets inside the scroll container (one per
 * key, ascending, the first normally 0). Between two tops the progress is linear; past the last it holds.
 */
export function flightProgress(scrollTop: number, tops: readonly number[]): number {
  const n = tops.length;
  if (n === 0) return 0;
  if (n === 1 || scrollTop <= (tops[0] as number)) return 0;
  for (let i = 0; i < n - 1; i++) {
    const a = tops[i] as number;
    const b = tops[i + 1] as number;
    if (scrollTop < b) return b > a ? i + (scrollTop - a) / (b - a) : i;
  }
  return n - 1;
}

/** Exponential approach, frame-rate independent. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return target + (current - target) * Math.exp(-lambda * dt);
}

interface FlightState {
  /** the landing is mounted and the camera belongs to the scroll */
  active: boolean;
  /** key units the scroll asks for (written by the page; the rig eases toward it every frame) */
  target: number;
  /** true once the hero has scrolled away (the header's "Enter the city" and the phone's pill key off it) */
  scrolled: boolean;
  setActive: (active: boolean) => void;
  setTarget: (target: number) => void;
}

/** Tiny store: the landing writes `target`, the rig reads it in its frame loop (never through React). */
export const useFlight = create<FlightState>((set, get) => ({
  active: false,
  target: 0,
  scrolled: false,
  setActive: (active) => set(active ? { active, target: 0, scrolled: false } : { active, scrolled: false }),
  setTarget: (target) => {
    const scrolled = target > 0.4;
    if (get().target === target && get().scrolled === scrolled) return;
    set({ target, scrolled });
  },
}));
