#!/usr/bin/env node
// Headless screenshots of the running app (software WebGL), for visual review on machines without a GPU.
//
//   node scripts/shoot.mjs /            → shots/root.png
//   node scripts/shoot.mjs /e/0xabc… --wait 9000 --name event
//   BASE_URL=http://127.0.0.1:4174 CHROMIUM=/path/to/chromium node scripts/shoot.mjs / /me
import fs from "node:fs";
import path from "node:path";
import { launch, watch } from "./browser.mjs";

const args = process.argv.slice(2);
const opt = (flag, fallback) => {
  const i = args.indexOf(flag);
  if (i === -1) return fallback;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
};
const wait = Number(opt("--wait", "7000"));
const name = opt("--name", undefined);
const width = Number(opt("--width", "1280"));
const height = Number(opt("--height", "800"));
const script = opt("--eval", undefined); // JS to run in the page (after --eval-delay ms) before the wait
const evalDelay = Number(opt("--eval-delay", "2500")); // let the scene mount (window.__director / __world)
const probe = opt("--print", undefined); // JS expression evaluated after waiting; its result is printed
const jpeg = opt("--jpeg", undefined); // JPEG quality (1–100) instead of PNG, for stills that ship in public/
const outDir = opt("--out", undefined); // directory for the file (default: shots/, which is gitignored)
const dpr = Number(opt("--dpr", "1")); // device scale factor; < 1 renders a wide layout into a small still
const routes = args.length ? args : ["/"];

const base = process.env["BASE_URL"] ?? "http://127.0.0.1:4174";
const out = outDir ? path.resolve(outDir) : path.resolve(import.meta.dirname, "..", "shots");
fs.mkdirSync(out, { recursive: true });

const browser = await launch({ width, height, dpr });

try {
  for (const route of routes) {
    const page = await browser.newPage();
    const watcher = watch(page);
    const started = performance.now();
    await page.goto(base + route, { waitUntil: "load", timeout: 90_000 });
    if (script) {
      await new Promise((r) => setTimeout(r, evalDelay));
      await page.evaluate(script);
    }
    await new Promise((r) => setTimeout(r, Math.max(0, wait - (script ? evalDelay : 0))));
    const slug = name ?? route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
    const file = path.join(out, `${slug || "root"}.${jpeg ? "jpg" : "png"}`);
    await page.screenshot(jpeg ? { path: file, type: "jpeg", quality: Number(jpeg) } : { path: file });
    if (probe) console.log("   probe:", JSON.stringify(await page.evaluate(probe)));
    const ms = Math.round(performance.now() - started);
    console.log(`${route} → ${path.relative(process.cwd(), file)} (${ms} ms)`);
    watcher.flush();
    await page.close();
  }
} finally {
  await browser.close();
}
