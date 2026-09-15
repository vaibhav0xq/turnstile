// `?perf=1` readout: frame timing, program and draw counts, tier and DPR, the last compile. Read once at
// load like `?tier=`, so it survives in-app navigation; the sampler in the canvas writes it twice a second.
import { create } from "zustand";

export interface PerfSample {
  fps: number;
  /** Mean and worst frame time in the window, ms. */
  ms: number;
  worst: number;
  /** Frames over 50 ms in the window. */
  long: number;
  /** Draw calls and triangles of the last render pass (the whole scene when no composer runs). */
  calls: number;
  triangles: number;
  programs: number;
  dpr: number;
  width: number;
  height: number;
}

interface PerfState {
  enabled: boolean;
  sample: PerfSample | null;
  /** The last chapter compile: how many programs it linked, how long the gate held, and how. */
  compile: { chapter: string; programs: number; ms: number; parallel: boolean } | null;
  setSample(sample: PerfSample): void;
  noteCompile(compile: NonNullable<PerfState["compile"]>): void;
}

export function perfRequested(search: string): boolean {
  return new URLSearchParams(search).get("perf") === "1";
}

export const usePerf = create<PerfState>()((set) => ({
  enabled: typeof window !== "undefined" && perfRequested(window.location.search),
  sample: null,
  compile: null,
  setSample: (sample) => set({ sample }),
  noteCompile: (compile) => set({ compile }),
}));
