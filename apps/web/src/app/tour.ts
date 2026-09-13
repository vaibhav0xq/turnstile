// Judge mode: a guided two-minute path from the city to a lit seat. The tour never fakes a step — it
// watches the same stores the app runs on (route, checkout, seat map) and only advances on chain truth.
import { create } from "zustand";

export type TourStep = "city" | "pick" | "checkout" | "ticket" | "door" | "lit";

export const TOUR_STEPS: readonly TourStep[] = ["city", "pick", "checkout", "ticket", "door", "lit"];

export interface TourReceipt {
  buyHash: string | null;
  bindHash: string | null;
  buyMs: number | null;
  bindMs: number | null;
  admitHash: string | null;
  admitMs: number | null;
}

const EMPTY_RECEIPT: TourReceipt = {
  buyHash: null,
  bindHash: null,
  buyMs: null,
  bindMs: null,
  admitHash: null,
  admitMs: null,
};

interface TourState {
  active: boolean;
  step: TourStep;
  /** Autopilot presses the highlighted control after a short dwell; off = the judge drives. */
  autoplay: boolean;
  /** Autopilot cannot press this one (passkeys need a real touch) — shown as a hint. */
  waitingForTouch: boolean;
  eventAddress: string | null;
  tokenId: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  receipt: TourReceipt;

  start(opts?: { autoplay?: boolean }): void;
  exit(): void;
  go(step: TourStep): void;
  setAutoplay(on: boolean): void;
  setWaitingForTouch(on: boolean): void;
  setEvent(address: string | null): void;
  setToken(id: number | null): void;
  note(receipt: Partial<TourReceipt>): void;
}

function markHot(step: TourStep | null) {
  if (step) document.documentElement.setAttribute("data-tour-hot", step);
  else document.documentElement.removeAttribute("data-tour-hot");
}

export const useTour = create<TourState>()((set, get) => ({
  active: false,
  step: "city",
  autoplay: false,
  waitingForTouch: false,
  eventAddress: null,
  tokenId: null,
  startedAt: null,
  finishedAt: null,
  receipt: EMPTY_RECEIPT,

  start(opts) {
    markHot("city");
    set({
      active: true,
      step: "city",
      autoplay: opts?.autoplay ?? get().autoplay,
      waitingForTouch: false,
      eventAddress: null,
      tokenId: null,
      startedAt: performance.now(),
      finishedAt: null,
      receipt: EMPTY_RECEIPT,
    });
  },
  exit() {
    markHot(null);
    set({ active: false, autoplay: false, waitingForTouch: false });
  },
  go(step) {
    if (!get().active || get().step === step) return;
    markHot(step);
    set({ step, waitingForTouch: false, finishedAt: step === "lit" ? performance.now() : null });
  },
  setAutoplay: (autoplay) => set({ autoplay, waitingForTouch: false }),
  setWaitingForTouch: (waitingForTouch) => {
    if (get().waitingForTouch !== waitingForTouch) set({ waitingForTouch });
  },
  setEvent: (eventAddress) => {
    if (get().eventAddress !== eventAddress) set({ eventAddress });
  },
  setToken: (tokenId) => {
    if (get().tokenId !== tokenId) set({ tokenId });
  },
  note: (receipt) => set((s) => ({ receipt: { ...s.receipt, ...receipt } })),
}));

/** `?tour=1` starts judge mode, `?tour=auto` starts it on autopilot (the flag is dropped from the URL). */
export function tourRequestedByUrl(): "manual" | "auto" | null {
  const params = new URLSearchParams(window.location.search);
  const value = params.get("tour");
  if (value === null) return null;
  params.delete("tour");
  const rest = params.toString();
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`,
  );
  return value === "auto" ? "auto" : "manual";
}
