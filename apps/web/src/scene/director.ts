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
 * light up row by row. The camera rig drives both from `startedAt`.
 */
export type Transition =
  | { kind: "dive"; eventAddress: string; chapter: Chapter; startedAt: number }
  | { kind: "descent"; startedAt: number };

export const DIVE_MS = 600;
export const DESCENT_MS = 800;

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
  /** House-lights reveal, 0 → 1 after a scene enters. */
  revealStartedAt: number;
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
  goFlat(): void;
  setLit(on: boolean): void;
  /** The rig has landed the descent: hand the camera back to the user. */
  endTransition(): void;
}

/** Starting tier: phones and small-core machines begin low; the PerformanceMonitor only steps it down. */
export function initialQuality(): Quality {
  if (typeof window === "undefined") return "high";
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency ?? 8;
  return (coarse && window.innerWidth < 900) || cores <= 4 ? "low" : "high";
}

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
        set({ ...next, transition: null, flash: false, curtain: false });
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
    const swap = () => ({
      ...next,
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
        curtain: false,
        flash: false,
      });
      later(() => set({ flash: true }), DIVE_MS - 240);
      later(() => set({ ...swap(), transition: { kind: "descent", startedAt: performance.now() } }), DIVE_MS);
      later(() => set({ flash: false }), DIVE_MS + 60);
      // safety net: if the rig never lands the descent (tab hidden, canvas gone), free the camera anyway
      later(
        () => {
          if (get().transition?.kind === "descent") set({ transition: null });
        },
        DIVE_MS + DESCENT_MS + 400,
      );
      return;
    }
    set({ curtain: true, flash: false, transition: null });
    later(() => set({ ...swap(), curtain: false }), 520);
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
    hoveredBeacon: null,
    quality: initialQuality(),
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
      if (get().quality !== quality) set({ quality });
    },
    markReady: () => {
      if (!get().ready) set({ ready: true });
    },
    goFlat: () => {
      clearTimers();
      set({ flat: true, ready: true, curtain: false, flash: false, transition: null });
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
