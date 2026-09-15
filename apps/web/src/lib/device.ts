/**
 * A phone: coarse pointer on a screen under the 640 px fold. The guided run (judge mode) is built for a
 * desktop frame — its bar, its autopilot pacing and its readout crowd a phone — so it is not offered
 * there, and a `?tour=` link opens the city instead. Tablets keep it. Read at use, not cached: a
 * desktop window narrowed below the fold is still a desktop.
 */
export function isPhone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse)").matches && window.innerWidth < 640;
}
