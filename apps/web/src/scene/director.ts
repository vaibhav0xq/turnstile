// The director decides what the persistent canvas shows. Routes talk to it; the scene reads from it.
import { create } from "zustand";

export type Chapter = "city" | "venue" | "gate";
/** overview — the house waypoint · seat — sat in a seat · focus — a hero shot of one seat from behind. */
export type ViewMode = "overview" | "seat" | "focus";
export type Quality = "high" | "low";

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
    quality: "high",

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
    setQuality: (quality) => set({ quality }),
  };
});
