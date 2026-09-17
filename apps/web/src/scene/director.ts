// The director decides what the persistent canvas shows. Routes talk to it; the scene reads from it.
import { create } from "zustand";

export type Chapter = "city" | "venue" | "gate";
/** overview — the house waypoint · seat — sat in a seat · focus — a hero shot of one seat from behind. */
export type ViewMode = "overview" | "seat" | "focus";
/** high — bloom, noise, volumetrics · low — bloom only, DPR ≤ 1.5, half the city · min — no post at all. */
export type Quality = "high" | "low" | "min";

/**
 * The move from the city into a room: the camera dives into the beacon (`dive`), a warm flash hides the
 * scene swap at the bottom, then it comes down out of the light into the house (`descent`) while the seats
 * light up row by row. The camera rig drives both from `startedAt`. A `held` descent is parked at its top:
 * the room is still compiling behind the flash; `markWarm` restarts it.
 */
export type Transition =
  | { kind: "dive"; eventAddress: string; chapter: Chapter; startedAt: number }
  | { kind: "descent"; startedAt: number; held?: true };

export const DIVE_MS = 600;
export const DESCENT_MS = 800;
/** Longest the flash or the curtain waits for a scene to compile before it lifts regardless. */
export const WARM_MAX_MS = 4000;

interface DirectorState {
  chapter: Chapter;
  eventAddress: string | null;
  hoveredSeat: number | null;
  selectedSeat: number | null;
  /** Seats the current fan holds (drawn in cyan). */
  mine: ReadonlySet<number>;
  /** "View from here" (camera sits in the seat) or "focus" (camera looks at it). */
  viewMode: ViewMode;
  viewSeat: number | null;
  /** Full-black curtain used to cut between scenes that do not start in the city. */
  curtain: boolean;
  /** Warm full-frame flash at the bottom of the dive, covering the scene swap. */
  flash: boolean;
  transition: Transition | null;
  /** House-lights reveal, 0 → 1 after a scene enters (restarted when the scene is warm and on screen). */
  revealStartedAt: number;
  /**
   * The scene on the canvas has its programs compiled and is drawing. False from a swap until the compile
   * gate calls `markWarm`; the flash or the curtain stays up meanwhile (at most WARM_MAX_MS).
   */
  warm: boolean;
  /**
   * A cut has started and the next scene is not swapped in yet (the dive is under way, or the curtain is
   * on its way up). The scene still mounted may finish compiling in this window; its `markWarm` must not
   * drop the overlay that is about to cover the swap.
   */
  cutting: boolean;
  hoveredBeacon: string | null;
  quality: Quality;
  /** First frame rendered: the boot veil can lift. */
  ready: boolean;
  /** No WebGL (or the context died): the DOM carries the whole product, the canvas is gone. */
  flat: boolean;
  /** When the followspot found a seat / went out — the house lights follow (see `houseLevel`). */
  litAt: number | null;
  unlitAt: number | null;

  showCity(): void;
  showVenue(eventAddress: string): void;
  showGate(eventAddress: string): void;
  hoverSeat(id: number | null): void;
  selectSeat(id: number | null): void;
  setMine(ids: Iterable<number>): void;
  viewFromSeat(id: number): void;
  focusSeat(id: number): void;
  viewOverview(): void;
  hoverBeacon(address: string | null): void;
  setQuality(q: Quality): void;
  markReady(): void;
  /** The compile gate has the scene drawing: lift the overlay, start the reveal and the descent. */
  markWarm(): void;
  goFlat(): void;
  setLit(on: boolean): void;
  /** The rig has landed the descent: hand the camera back to the user. */
  endTransition(): void;
}

const TIERS: readonly Quality[] = ["high", "low", "min"];

/**
 * `?tier=high|low|min` pins the tier for the page's life: a recording or a review still must not step
 * down mid-take because one frame stuttered. Read once, when the director is created; nothing else uses it.
 */
export function pinnedQuality(search: string): Quality | null {
  const tier = new URLSearchParams(search).get("tier");
  return TIERS.find((t) => t === tier) ?? null;
}

/** What decides the starting tier; gathered once from the browser, pure for the tests. */
export interface DeviceHints {
  coarse: boolean;
  width: number;
  cores: number;
  /** `navigator.deviceMemory` in GiB where the browser exposes it. */
  memory: number | null;
  /** The renderer string of a WebGL context, "" when unknown. */
  gpu: string;
}

const SOFTWARE_GPU = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i;
const INTEGRATED_GPU =
  /intel|iris|uhd|hd graphics|mali|adreno|powervr|vega|radeon\(tm\) graphics|radeon graphics/i;

/**
 * Starting tier; the PerformanceMonitor only ever steps it down. Phones begin at `min`: no composer at all
 * (MSAA instead of SMAA, DPR ≤ 1.25), so a mobile GPU never compiles the post chain or a second variant
 * of every material for it — on a Redmi Note 11 that compile was the multi-second freeze, not the frame
 * rate. A software renderer is `min` too. Tablets, integrated GPUs and small-core or low-memory machines
 * begin at `low`: the monitor would take them there anyway, after seconds of jank and a second compile.
 */
export function classifyQuality(h: DeviceHints): Quality {
  if (h.coarse && h.width < 900) return "min";
  if (SOFTWARE_GPU.test(h.gpu)) return "min";
  if (h.coarse) return "low";
  if (INTEGRATED_GPU.test(h.gpu)) return "low";
  if (h.cores <= 4 || (h.memory !== null && h.memory <= 4)) return "low";
  return "high";
}

export function initialQuality(): Quality {
  if (typeof window === "undefined") return "high";
  return classifyQuality({
    coarse: window.matchMedia("(pointer: coarse)").matches,
    width: window.innerWidth,
    cores: navigator.hardwareConcurrency ?? 8,
    memory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
    gpu: gpuName(),
  });
}

/** The GPU behind the page, read from a throwaway context that is released at once; "" without WebGL. */
function gpuName(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return "";
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return name;
  } catch {
    return "";
  }
}

const PINNED = typeof window === "undefined" ? null : pinnedQuality(window.location.search);

/**
 * House-lights level, 0.3 → 1. Down over 400 ms once a followspot is on (the beat before it snaps on),
 * back up over 600 ms after it goes out. Read per frame by the room, the stage and the LED wall. After a
 * scene enters, the house comes up from a glow over 1.1 s, so the room is lit by the time the descent lands.
 */
export function houseLevel(now = performance.now()): number {
  const { litAt, unlitAt, revealStartedAt } = useDirector.getState();
  const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  const rise = 0.15 + 0.85 * ease((now - revealStartedAt) / 1100);
  if (litAt !== null) return (1 - 0.7 * ease((now - litAt) / 400)) * rise;
  if (unlitAt !== null) return (0.3 + 0.7 * ease((now - unlitAt) / 600)) * rise;
  return rise;
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? null)?.toLowerCase() === (b ?? null)?.toLowerCase();
}

const timers: Array<ReturnType<typeof setTimeout>> = [];

export const useDirector = create<DirectorState>()((set, get) => {
  const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));
  const clearTimers = () => {
    for (const t of timers.splice(0)) clearTimeout(t);
  };

  /**
   * Move to another scene. From the city into a room it is the dive → flash → descent; anywhere else
   * (room to door, room back to the city) a cut to black, the scene swapped behind it.
   */
  function cutTo(next: Partial<DirectorState> & { chapter: Chapter }) {
    const state = get();
    const same = next.chapter === state.chapter && sameAddress(next.eventAddress, state.eventAddress);
    if (same) {
      // Back to the scene on screen while a dive or a curtain cut is still pending: cancel it, or its
      // timers would swap the scene out from under the new route. A running descent is left to land.
      if (state.transition?.kind === "dive" || state.curtain) {
        clearTimers();
        if (state.warm) {
          set({ ...next, cutting: false, transition: null, flash: false, curtain: false });
        } else {
          // still compiling behind the curtain (swapped already, or the cut was cancelled before the
          // swap): leave it up, it lifts when warm
          set({ ...next, cutting: false });
          later(() => get().markWarm(), WARM_MAX_MS);
        }
      } else {
        set(next);
      }
      return;
    }
    const t = state.transition;
    if (t?.kind === "dive" && t.chapter === next.chapter && sameAddress(t.eventAddress, next.eventAddress)) {
      return; // already on the way there
    }
    clearTimers();
    // The new scene mounts behind the overlay and reports back through `markWarm` (the compile gate); the
    // reveal clock restarts then, once it is actually drawing.
    const swap = () => ({
      ...next,
      cutting: false,
      warm: false,
      revealStartedAt: performance.now(),
      hoveredSeat: null,
      hoveredBeacon: null,
    });
    const canDive =
      state.chapter === "city" &&
      next.chapter !== "city" &&
      typeof next.eventAddress === "string" &&
      state.ready &&
      !state.flat &&
      !reducedMotion() &&
      // the city has to be on screen to dive out of: a direct load into a room just cuts
      performance.now() - state.revealStartedAt > 1200;
    if (canDive) {
      const eventAddress = next.eventAddress as string;
      set({
        transition: { kind: "dive", eventAddress, chapter: next.chapter, startedAt: performance.now() },
        cutting: true,
        curtain: false,
        flash: false,
      });
      later(() => set({ flash: true }), DIVE_MS - 240);
      // the room swaps in under the flash with its descent parked; both go when the room is warm
      later(
        () => set({ ...swap(), transition: { kind: "descent", startedAt: performance.now(), held: true } }),
        DIVE_MS,
      );
      later(() => get().markWarm(), DIVE_MS + WARM_MAX_MS);
      return;
    }
    set({ cutting: true, curtain: true, flash: false, transition: null });
    later(() => set(swap()), 520);
    later(() => get().markWarm(), 520 + WARM_MAX_MS);
  }

  return {
    chapter: "city",
    eventAddress: null,
    hoveredSeat: null,
    selectedSeat: null,
    mine: new Set<number>(),
    viewMode: "overview",
    viewSeat: null,
    curtain: false,
    flash: false,
    transition: null,
    revealStartedAt: performance.now(),
    warm: false,
    cutting: false,
    hoveredBeacon: null,
    quality: PINNED ?? initialQuality(),
    ready: false,
    flat: false,
    litAt: null,
    unlitAt: null,

    showCity: () =>
      cutTo({
        chapter: "city",
        eventAddress: null,
        selectedSeat: null,
        viewMode: "overview",
        viewSeat: null,
      }),
    showVenue: (eventAddress) =>
      cutTo({ chapter: "venue", eventAddress, viewMode: "overview", viewSeat: null }),
    showGate: (eventAddress) =>
      cutTo({ chapter: "gate", eventAddress, selectedSeat: null, viewMode: "overview", viewSeat: null }),
    hoverSeat: (id) => {
      if (get().hoveredSeat !== id) set({ hoveredSeat: id });
    },
    selectSeat: (id) => set({ selectedSeat: id }),
    setMine: (ids) => set({ mine: new Set(ids) }),
    viewFromSeat: (id) => set({ viewMode: "seat", viewSeat: id }),
    focusSeat: (id) => set({ viewMode: "focus", viewSeat: id }),
    viewOverview: () => set({ viewMode: "overview", viewSeat: null }),
    hoverBeacon: (address) => {
      if (get().hoveredBeacon !== address) set({ hoveredBeacon: address });
    },
    setQuality: (quality) => {
      if (PINNED) return;
      if (get().quality !== quality) set({ quality });
    },
    markReady: () => {
      if (!get().ready) set({ ready: true });
    },
    markWarm: () => {
      const state = get();
      // A scene reporting warm while a cut away from it is pending is about to be swapped out; the
      // overlay stays for the scene that replaces it.
      if (state.warm || state.cutting) return;
      const now = performance.now();
      const held = state.transition?.kind === "descent";
      set({
        warm: true,
        revealStartedAt: now,
        flash: false,
        curtain: false,
        transition: held ? { kind: "descent", startedAt: now } : state.transition,
      });
      // safety net: if the rig never lands the descent (tab hidden, canvas gone), free the camera anyway
      if (held) {
        later(() => {
          if (get().transition?.kind === "descent") set({ transition: null });
        }, DESCENT_MS + 400);
      }
    },
    goFlat: () => {
      clearTimers();
      set({
        flat: true,
        ready: true,
        warm: true,
        cutting: false,
        curtain: false,
        flash: false,
        transition: null,
      });
    },
    setLit: (on) =>
      set(
        on
          ? { litAt: performance.now(), unlitAt: null }
          : get().litAt !== null
            ? { litAt: null, unlitAt: performance.now() }
            : {},
      ),
    endTransition: () => {
      if (get().transition?.kind === "descent") set({ transition: null });
    },
  };
});
