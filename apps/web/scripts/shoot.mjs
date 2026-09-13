#!/usr/bin/env node
// Headless screenshots of the running app (software WebGL), for visual review on machines without a GPU.
//
//   node scripts/shoot.mjs /            → shots/root.png
//   node scripts/shoot.mjs /e/0xabc… --wait 9000 --name event
//   BASE_URL=http://127.0.0.1:4174 CHROMIUM=/path/to/chromium node scripts/shoot.mjs / /me
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

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
const routes = args.length ? args : ["/"];

const base = process.env["BASE_URL"] ?? "http://127.0.0.1:4174";
const out = path.resolve(import.meta.dirname, "..", "shots");
fs.mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: process.env["CHROMIUM"] ?? "/repl/tools/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--no-zygote",
    "--single-process",
    "--in-process-gpu",
    "--disable-features=site-per-process,IsolateOrigins,AudioServiceOutOfProcess",
    "--renderer-process-limit=1",
    "--mute-audio",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--disable-extensions",
    "--disable-background-networking",
    "--js-flags=--max-old-space-size=256",
    `--window-size=${width},${height}`,
  ],
  defaultViewport: { width, height, deviceScaleFactor: 1 },
  protocolTimeout: 120_000,
});

try {
  for (const route of routes) {
    const page = await browser.newPage();
    const logs = [];
    page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
    page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
    page.on("requestfailed", (r) => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText ?? ""}`));
    const started = performance.now();
    await page.goto(base + route, { waitUntil: "load", timeout: 90_000 });
    if (script) {
      await new Promise((r) => setTimeout(r, evalDelay));
      await page.evaluate(script);
    }
    await new Promise((r) => setTimeout(r, Math.max(0, wait - (script ? evalDelay : 0))));
    const slug = name ?? route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
    const file = path.join(out, `${slug || "root"}.png`);
    await page.screenshot({ path: file });
    if (probe) console.log("   probe:", JSON.stringify(await page.evaluate(probe)));
    const ms = Math.round(performance.now() - started);
    console.log(`${route} → ${path.relative(process.cwd(), file)} (${ms} ms)`);
    for (const line of logs.filter((l) => !/\[(log|debug|info)\]/.test(l)).slice(0, 25))
      console.log("   ", line);
    await page.close();
  }
} finally {
  await browser.close();
}
