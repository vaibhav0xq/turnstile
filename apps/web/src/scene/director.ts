// The director decides what the persistent canvas shows. Routes talk to it; the scene reads from it.
import { create } from "zustand";

export type Chapter = "city" | "venue" | "gate";
/** overview — the house waypoint · seat — sat in a seat · focus — a hero shot of one seat from behind. */
export type ViewMode = "overview" | "seat" | "focus";
/** high — bloom, noise, volumetrics · low — bloom only, DPR ≤ 1.5, half the city · min — no post at all. */
export type Quality = "high" | "low" | "min";

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
  /** Full-black curtain used to cut between scenes. */
  curtain: boolean;
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
 * back up over 600 ms after it goes out. Read per frame by the room, the stage and the LED wall.
 */
export function houseLevel(now = performance.now()): number {
  const { litAt, unlitAt } = useDirector.getState();
  const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
  if (litAt !== null) return 1 - 0.7 * ease((now - litAt) / 400);
  if (unlitAt !== null) return 0.3 + 0.7 * ease((now - unlitAt) / 600);
  return 1;
}

let cutTimer: ReturnType<typeof setTimeout> | null = null;

export const useDirector = create<DirectorState>()((set, get) => {
  /** Cut to black, swap the scene, then let the lights come up. */
  function cutTo(next: Partial<DirectorState>) {
    if (cutTimer) clearTimeout(cutTimer);
    const same =
      next.chapter === get().chapter &&
      (next.eventAddress ?? null)?.toLowerCase() === get().eventAddress?.toLowerCase();
    if (same) {
      set(next);
      return;
    }
    set({ curtain: true });
    cutTimer = setTimeout(() => {
      set({
        ...next,
        curtain: false,
        revealStartedAt: performance.now(),
        hoveredSeat: null,
        hoveredBeacon: null,
      });
      cutTimer = null;
    }, 520);
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
    goFlat: () => set({ flat: true, ready: true, curtain: false }),
    setLit: (on) =>
      set(
        on
          ? { litAt: performance.now(), unlitAt: null }
          : get().litAt !== null
            ? { litAt: null, unlitAt: performance.now() }
            : {},
      ),
  };
});
