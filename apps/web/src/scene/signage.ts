import * as THREE from "three";
import { mulberry } from "../lib/random";

/**
 * Canvas-drawn textures for a venue's street presence: the marquee over the doors, the lit lobby behind the
 * glass, the code panel on a turnstile. Drawn once per venue and cached; the marquee is drawn again when the
 * display face has finished loading, since a canvas cannot wait for a font.
 */

const DISPLAY = '"Instrument Serif", "Iowan Old Style", Georgia, serif';
const MONO = '"Geist Mono Variable", ui-monospace, Menlo, monospace';

function canvasTexture(width: number, height: number): [THREE.CanvasTexture, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas unavailable");
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return [texture, ctx];
}

const marquees = new Map<string, THREE.CanvasTexture>();

/** The name over the doors: warm letters on a dark board, with tonight's line under it. */
export function marqueeTexture(name: string): THREE.CanvasTexture {
  const cached = marquees.get(name);
  if (cached) return cached;
  const [texture, ctx] = canvasTexture(1024, 176);
  const draw = () => {
    ctx.fillStyle = "#14100c";
    ctx.fillRect(0, 0, 1024, 176);
    // a thin lit edge top and bottom, as a marquee has
    ctx.fillStyle = "#ffb457";
    ctx.fillRect(0, 0, 1024, 4);
    ctx.fillRect(0, 172, 1024, 4);
    ctx.fillStyle = "#ffe0b0";
    ctx.textBaseline = "middle";
    let size = 96;
    ctx.font = `${size}px ${DISPLAY}`;
    while (size > 40 && ctx.measureText(name).width > 900) {
      size -= 4;
      ctx.font = `${size}px ${DISPLAY}`;
    }
    ctx.textAlign = "center";
    ctx.fillText(name, 512, 78);
    ctx.font = `22px ${MONO}`;
    ctx.fillStyle = "#ffb457";
    ctx.fillText("T O N I G H T   ·   D O O R S   O P E N", 512, 146);
    texture.needsUpdate = true;
  };
  draw();
  if (typeof document !== "undefined" && "fonts" in document) {
    document.fonts.load(`96px ${DISPLAY}`).then(draw, () => undefined);
  }
  marquees.set(name, texture);
  return texture;
}

let lobby: THREE.CanvasTexture | undefined;

/** The lobby behind the glass: warm light, mullions, a few people waiting. Shared by every venue. */
export function lobbyTexture(): THREE.CanvasTexture {
  if (lobby) return lobby;
  const [texture, ctx] = canvasTexture(1024, 256);
  const rnd = mulberry(77);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#5a3d22");
  g.addColorStop(0.55, "#8a5c33");
  g.addColorStop(1, "#3a2816");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 256);
  // a brighter back wall with a bar's shelf of bottles
  ctx.fillStyle = "rgba(255, 214, 160, 0.28)";
  ctx.fillRect(60, 30, 904, 100);
  ctx.fillStyle = "rgba(255, 190, 110, 0.45)";
  for (let i = 0; i < 46; i++) ctx.fillRect(74 + i * 19.4, 56 + rnd() * 24, 5, 22 + rnd() * 26);
  // people waiting: head-and-shoulders silhouettes at a few depths, nearer ones larger and darker
  for (let i = 0; i < 12; i++) {
    const x = 50 + rnd() * 920;
    const h = 140 + rnd() * 80;
    const shoulder = h * 0.36;
    const head = h * 0.11;
    const top = 256 - h;
    ctx.fillStyle = `rgba(18, 12, 8, ${0.55 + ((h - 140) / 80) * 0.4})`;
    ctx.beginPath();
    ctx.arc(x, top + head, head, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - shoulder / 2, 256);
    ctx.lineTo(x - shoulder / 2, top + head * 2.6);
    ctx.quadraticCurveTo(x, top + head * 1.9, x + shoulder / 2, top + head * 2.6);
    ctx.lineTo(x + shoulder / 2, 256);
    ctx.fill();
  }
  // the floor line
  ctx.fillStyle = "rgba(20, 14, 10, 0.5)";
  ctx.fillRect(0, 236, 1024, 20);
  // mullions every 1.6 m of a 22 m front (the texture spans the whole glazed band)
  ctx.fillStyle = "#0e0c0a";
  for (let x = 0; x <= 1024; x += 1024 / 13.75) ctx.fillRect(Math.round(x) - 5, 0, 10, 256);
  ctx.fillRect(0, 96, 1024, 8);
  texture.needsUpdate = true;
  lobby = texture;
  return texture;
}

let code: THREE.CanvasTexture | undefined;

/**
 * A turnstile's panel: a code as the door sees it, a block pattern and the digits under it, drawn once and
 * still — the product's codes rotate every 30 s, but a panel in the distance only has to read as one.
 */
export function codePanelTexture(): THREE.CanvasTexture {
  if (code) return code;
  const [texture, ctx] = canvasTexture(256, 176);
  const rnd = mulberry(4821);
  ctx.fillStyle = "#0b0d12";
  ctx.fillRect(0, 0, 256, 176);
  ctx.fillStyle = "#ffb457";
  const cell = 14;
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      const corner = (x < 2 && y < 2) || (x > 4 && y < 2) || (x < 2 && y > 4);
      if (corner || rnd() < 0.45) ctx.fillRect(28 + x * cell, 22 + y * cell, cell - 2, cell - 2);
    }
  }
  ctx.font = `28px ${MONO}`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText("4 8 1 9", 138, 52);
  ctx.fillText("0 3 7 2", 138, 90);
  ctx.font = `14px ${MONO}`;
  ctx.fillStyle = "#8a93a8";
  ctx.fillText("SLOT · 00:42", 138, 128);
  ctx.fillStyle = "#3fd68a";
  ctx.beginPath();
  ctx.arc(40, 150, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8a93a8";
  ctx.fillText("ADMIT ONCE", 56, 150);
  texture.needsUpdate = true;
  code = texture;
  return texture;
}
