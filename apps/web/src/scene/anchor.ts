// Screen anchor for the seat card. The card lives in the DOM overlay (inside the Router, outside the
// WebGL container) and the scene writes the projected seat position straight into its transform every
// frame — no React re-render per frame, and no HTML layer inside the canvas container.
export const seatAnchor: { el: HTMLElement | null } = { el: null };
