// The ticket as an image: what `tokenURI.image` points at. Self-contained SVG (no fonts, scripts or
// external references — marketplaces render it inside an <img>), drawn in the app's palette: a dark card,
// the event in serif display type, and a fan of seats in which this ticket's seat is the lit one — amber
// while it is outside, green once the chain says it has been through the door.

export interface TicketImageInput {
  eventName: string;
  tierName: string;
  seatId: number;
  /** Position of the seat inside its tier, 0-based, and the tier's size — places the lit dot. */
  seatIndex: number;
  seatCount: number;
  /** Unix seconds; the card prints the date in UTC. */
  startsAt: number;
  checkedIn: boolean;
  chainName: string;
  eventAddress: string;
}

const W = 1000;
const H = 1400;
const PALETTE = {
  ink: "#07080a",
  ink2: "#0d0f13",
  paper: "#f3efe7",
  muted: "#8b8f98",
  amber: "#ffb457",
  cyan: "#7ee7ff",
  green: "#59f2a1",
};
const DISPLAY = "'Instrument Serif','Iowan Old Style',Georgia,'Times New Roman',serif";
const MONO = "'Geist Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const SANS = "Geist,system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

/** XML-escape organiser-controlled text and drop control characters; names come straight from the chain. */
export function escapeXml(text: string): string {
  let clean = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const control = (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) || code === 0x7f;
    if (!control) clean += ch;
  }
  return clean
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function clip(text: string, max: number): string {
  const chars = [...text.trim()];
  return chars.length <= max
    ? chars.join("")
    : `${chars
        .slice(0, max - 1)
        .join("")
        .trimEnd()}…`;
}

/** Greedy word wrap into at most `lines` lines of `perLine` characters; overflow ends in an ellipsis. */
function wrap(text: string, perLine: number, lines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = "";
  let i = 0;
  for (; i < words.length; i++) {
    const word = clip(words[i] ?? "", perLine);
    const candidate = line ? `${line} ${word}` : word;
    if ([...candidate].length <= perLine) {
      line = candidate;
      continue;
    }
    if (out.length === lines - 1) break; // no room for another line
    out.push(line);
    line = word;
  }
  if (out.length < lines) out.push(line);
  if (i < words.length) {
    const last = clip(out[out.length - 1] ?? "", perLine - 1);
    out[out.length - 1] = last.endsWith("…") ? last : `${last}…`;
  }
  return out;
}

function utcDate(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  return `${day} · ${time} UTC`;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Every seat of the tier laid out as concentric arcs facing a stage line, rows widening towards the back
 * like the room in the app; dots shrink for big tiers so all of them fit. Returns the dots with this
 * ticket's seat flagged.
 */
function seatFan(seatIndex: number, seatCount: number, cx: number, cy: number) {
  const total = clamp(Math.floor(seatCount) || 1, 1, 400);
  const index = clamp(Math.floor(seatIndex) || 0, 0, total - 1);
  const rows = clamp(Math.ceil(Math.sqrt(total / 3)), 1, 8);
  const radii = Array.from({ length: rows }, (_, row) => 110 + row * 40);
  const weight = radii.reduce((a, b) => a + b, 0);
  const counts = radii.map((r) => Math.floor((total * r) / weight));
  for (let rest = total - counts.reduce((a, b) => a + b, 0), row = rows - 1; rest > 0; rest--, row--) {
    counts[(row + rows) % rows] = (counts[(row + rows) % rows] ?? 0) + 1;
  }
  const r = clamp(9 * Math.sqrt(48 / total), 4, 9);
  const dots: Array<{ x: number; y: number; r: number; mine: boolean }> = [];
  let placed = 0;
  radii.forEach((radius, row) => {
    const perRow = counts[row] ?? 0;
    const span = Math.min(Math.PI * 0.72, (perRow * r * 3) / radius);
    for (let i = 0; i < perRow; i++) {
      const a = -Math.PI / 2 + (perRow === 1 ? 0 : -span / 2 + (span * i) / (perRow - 1));
      dots.push({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a), r, mine: placed === index });
      placed++;
    }
  });
  return dots;
}

const STAGE_Y = 1262;

export function renderTicketSvg(input: TicketImageInput): string {
  const accent = input.checkedIn ? PALETTE.green : PALETTE.amber;
  const status = input.checkedIn ? "INSIDE · CHECKED IN ON CHAIN" : "BOUND TO THE HOLDER'S PASSKEY";
  const title = wrap(input.eventName || "Untitled event", 16, 3);
  const titleSize = title.some((l) => [...l].length > 12) ? 92 : 108;
  const tier = clip(input.tierName || "Seat", 24);
  const date = utcDate(input.startsAt);
  // Rows curve around the stage line, like the room in the app; the lit seat is the light source.
  const fan = seatFan(input.seatIndex, input.seatCount, W / 2, STAGE_Y);
  const mine = fan.find((d) => d.mine) ?? { x: W / 2, y: STAGE_Y - 110, r: 9, mine: true };
  const address = `${input.eventAddress.slice(0, 6)}…${input.eventAddress.slice(-4)}`;
  const px = (n: number) => n.toFixed(1);

  const titleLines = title
    .map((line, i) => `<tspan x="80" dy="${i === 0 ? 0 : titleSize * 0.98}">${escapeXml(line)}</tspan>`)
    .join("");
  const dots = fan
    .filter((d) => !d.mine)
    .map((d) => `<circle cx="${px(d.x)}" cy="${px(d.y)}" r="${d.r}" fill="${PALETTE.paper}" opacity="0.16"/>`)
    .join("");
  const lit =
    `<circle cx="${px(mine.x)}" cy="${px(mine.y)}" r="34" fill="${accent}" opacity="0.18"/>` +
    `<circle cx="${px(mine.x)}" cy="${px(mine.y)}" r="18" fill="${accent}" opacity="0.45"/>` +
    `<circle cx="${px(mine.x)}" cy="${px(mine.y)}" r="${Math.max(9, mine.r * 1.4).toFixed(1)}" fill="${accent}"/>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeXml(`${input.eventName} · ${input.tierName} #${input.seatId}`)}">` +
    `<defs>` +
    `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#12141a"/><stop offset="1" stop-color="${PALETTE.ink}"/></linearGradient>` +
    `<radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${accent}" stop-opacity="0.5"/><stop offset="0.45" stop-color="${accent}" stop-opacity="0.12"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>` +
    `<clipPath id="card"><rect x="40" y="40" width="${W - 80}" height="${H - 80}" rx="48"/></clipPath>` +
    `</defs>` +
    `<rect width="${W}" height="${H}" fill="${PALETTE.ink}"/>` +
    `<g clip-path="url(#card)">` +
    `<rect x="40" y="40" width="${W - 80}" height="${H - 80}" fill="url(#bg)"/>` +
    `<circle cx="${px(mine.x)}" cy="${px(mine.y)}" r="300" fill="url(#glow)"/>` +
    // the stage the rows face
    `<rect x="300" y="${STAGE_Y - 3}" width="400" height="6" rx="3" fill="${PALETTE.amber}" opacity="0.9"/>` +
    `<rect x="260" y="${STAGE_Y + 3}" width="480" height="40" fill="${PALETTE.amber}" opacity="0.07"/>` +
    dots +
    lit +
    `</g>` +
    `<rect x="40" y="40" width="${W - 80}" height="${H - 80}" rx="48" fill="none" stroke="${PALETTE.paper}" stroke-opacity="0.14" stroke-width="2"/>` +
    // perforation between body and stub
    `<line x1="40" y1="760" x2="${W - 40}" y2="760" stroke="${PALETTE.paper}" stroke-opacity="0.18" stroke-width="2" stroke-dasharray="4 14"/>` +
    `<circle cx="40" cy="760" r="26" fill="${PALETTE.ink}"/><circle cx="${W - 40}" cy="760" r="26" fill="${PALETTE.ink}"/>` +
    // body
    `<text x="80" y="128" font-family="${MONO}" font-size="24" letter-spacing="6" fill="${PALETTE.muted}">TURNSTILE · ${escapeXml(input.chainName.toUpperCase())}</text>` +
    `<text x="80" y="270" font-family="${DISPLAY}" font-size="${titleSize}" fill="${PALETTE.paper}">${titleLines}</text>` +
    `<text x="80" y="640" font-family="${SANS}" font-size="40" fill="${PALETTE.paper}">${escapeXml(tier)}</text>` +
    `<text x="${W - 80}" y="640" text-anchor="end" font-family="${DISPLAY}" font-size="120" fill="${accent}">#${input.seatId}</text>` +
    `<text x="80" y="690" font-family="${MONO}" font-size="24" fill="${PALETTE.muted}">${escapeXml(date)}</text>` +
    // stub
    `<circle cx="92" cy="822" r="10" fill="${accent}"/>` +
    `<text x="118" y="831" font-family="${MONO}" font-size="24" letter-spacing="4" fill="${accent}">${status}</text>` +
    // the footer's two runs share one baseline: ~30 monospace chars on the left, 23 on the right, so they
    // stay apart at 22 px even with a wide fallback font (a tier name here made them collide)
    `<text x="80" y="${H - 62}" font-family="${MONO}" font-size="22" fill="${PALETTE.muted}">${escapeXml(address)} · ${clamp(Math.floor(input.seatIndex) || 0, 0, Math.max(0, input.seatCount - 1)) + 1} of ${input.seatCount}</text>` +
    `<text x="${W - 80}" y="${H - 62}" text-anchor="end" font-family="${MONO}" font-size="22" fill="${PALETTE.cyan}">one passkey · no wallet</text>` +
    `</svg>`
  );
}

/** `host[:port]` as a browser would send it — anything else is not a host we will echo into metadata. */
const HOST =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*(?::\d{1,5})?$/i;

/**
 * Absolute origin for URLs inside metadata. `PUBLIC_ORIGIN` when configured — set it on every deployed
 * relayer. Otherwise the request's own `Host` (which any cache in front keys on) and, for the scheme, a
 * `x-forwarded-proto` that is literally `http` or `https`. `x-forwarded-host` is deliberately ignored:
 * a client can send it, no cache keys on it, and reflecting it would let one request poison the metadata
 * everyone else is served.
 */
export function requestOrigin(headers: Headers, url: string, configured: string | null): string {
  if (configured) return configured;
  const parsed = new URL(url);
  const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const proto =
    forwardedProto === "https" || forwardedProto === "http"
      ? forwardedProto
      : parsed.protocol.replace(/:$/, "");
  const host = headers.get("host")?.trim() ?? "";
  return `${proto}://${HOST.test(host) ? host : parsed.host}`;
}
