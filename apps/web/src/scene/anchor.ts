// Screen anchor for the seat card. The card lives in the DOM overlay (inside the Router, outside the
// WebGL container) and the scene writes the projected seat position straight into its transform every
// frame — no React re-render per frame, and no HTML layer inside the canvas container.
export const seatAnchor: { el: HTMLElement | null } = { el: null };

// Keep-out for the beacon labels: DOM copy the chips must not cross (the landing hero and the bill). Rects
// are re-read at most a few times a second — a layout read per frame per chip would be the expensive part.
const keepOut = new Set<HTMLElement>();
let rects: DOMRect[] = [];
let readAt = 0;

export function registerKeepOut(el: HTMLElement | null): () => void {
  if (!el) return () => {};
  keepOut.add(el);
  readAt = 0;
  return () => {
    keepOut.delete(el);
    readAt = 0;
  };
}

export function keepOutRects(now = performance.now()): DOMRect[] {
  if (now - readAt > 250) {
    readAt = now;
    rects = [];
    for (const el of keepOut) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) rects.push(r);
    }
  }
  return rects;
}
