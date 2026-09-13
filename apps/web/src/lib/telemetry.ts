// The number the judges see: taps and seconds from landing to the first confirmed ticket.
import { create } from "zustand";

interface Telemetry {
  landedAt: number;
  taps: number;
  firstConfirmedAt: number | null;
  firstConfirmedTaps: number | null;
  ceremonies: number;
  tap(): void;
  confirmed(): void;
  ceremony(): void;
  reset(): void;
}

export const useTelemetry = create<Telemetry>()((set, get) => ({
  landedAt: performance.now(),
  taps: 0,
  firstConfirmedAt: null,
  firstConfirmedTaps: null,
  ceremonies: 0,
  tap: () => set((s) => ({ taps: s.taps + 1 })),
  confirmed: () => {
    if (get().firstConfirmedAt !== null) return;
    set((s) => ({ firstConfirmedAt: performance.now(), firstConfirmedTaps: s.taps }));
  },
  ceremony: () => set((s) => ({ ceremonies: s.ceremonies + 1 })),
  reset: () =>
    set({
      landedAt: performance.now(),
      taps: 0,
      firstConfirmedAt: null,
      firstConfirmedTaps: null,
      ceremonies: 0,
    }),
}));

let installed = false;
export function installTapCounter() {
  if (installed) return;
  installed = true;
  window.addEventListener(
    "pointerdown",
    (e) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("button, a, input, [role=button], canvas")) useTelemetry.getState().tap();
    },
    { capture: true, passive: true },
  );
}
