#!/usr/bin/env node
// Runs judge mode end to end in headless Chromium and screenshots every step, so the two-minute path can be
// timed and reviewed without a phone. Works against the dev server, `vite preview` and a deployed origin
// (it only reads the DOM hooks the tour bar renders, never dev-only globals).
//
//   node scripts/judge-run.mjs --seed judge1              → dev identity (DEV builds only), autopilot does it all
//   node scripts/judge-run.mjs                            → real passkey path: a virtual platform authenticator
//                                                           answers the prompts and the script "taps" for the judge
//   node scripts/judge-run.mjs --base https://<origin>   → the same against staging (or BASE_URL=…)
//   pnpm --filter @turnstile/web run judge -- --base …   → the same, from the repo root
//
// Shots land in shots/judge-<n>-<step>.png (+ judge-final.png after the hero shot). Exit code 1 on timeout.
import fs from "node:fs";
import path from "node:path";
import { addVirtualPasskey, launch, watch } from "./browser.mjs";

const args = process.argv.slice(2);
const opt = (flag, fallback) => {
  const i = args.indexOf(flag);
  if (i === -1) return fallback;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
};
const seed = opt("--seed", undefined);
const timeout = Number(opt("--timeout", "300000"));
const width = Number(opt("--width", "1280"));
const height = Number(opt("--height", "800"));
const prefix = opt("--name", "judge");
const noShots = args.includes("--no-shots");

const base = opt("--base", process.env["BASE_URL"] ?? "http://127.0.0.1:4174");
const out = path.resolve(import.meta.dirname, "..", "shots");
fs.mkdirSync(out, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = (t0) => `${((performance.now() - t0) / 1000).toFixed(1).padStart(6)}s`;

/** What the tour bar exposes: `data-step`, `data-waiting` and, at the end, the summary card. */
const readBar = () => {
  const bar = document.querySelector('[data-testid="tour-bar"]');
  if (!bar) return { present: false };
  const summary = bar.querySelector('[data-testid="tour-summary"]');
  return {
    present: true,
    // `data-step` / `data-waiting` are the bar's hooks; the `data-tour-hot` attribute and the touch hint
    // are the fallbacks for builds that predate them.
    step: bar.getAttribute("data-step") ?? document.documentElement.getAttribute("data-tour-hot"),
    waiting: bar.hasAttribute("data-waiting")
      ? bar.getAttribute("data-waiting") === "1"
      : /real touch/.test(bar.textContent ?? ""),
    elapsed: bar.getAttribute("data-elapsed"),
    finished: summary !== null,
    summary: summary?.innerText ?? null,
    txs: summary ? [...summary.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")) : [],
    path: location.pathname,
  };
};

/** The one control autopilot refuses to press because a passkey prompt is behind it. */
const tapForJudge = () => {
  const sel = ['[data-tour="checkout"]', '[data-tour="ticket-open"]', '[data-tour="ticket-bind"]'];
  for (const s of sel) {
    const el = document.querySelector(s);
    if (el && !el.disabled) {
      el.click();
      return s;
    }
  }
  return null;
};

const browser = await launch({ width, height });
let ok = false;
try {
  const page = await browser.newPage();
  const watcher = watch(page);
  page.on("error", (e) => console.log(`page crashed: ${e.message}`));
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) console.log(`   navigated → ${f.url()}`);
  });
  if (!seed) await addVirtualPasskey(page);
  const url = `${base}/?tour=auto${seed ? `&dev=${encodeURIComponent(seed)}` : ""}`;
  console.log(`judge run → ${url}${seed ? "" : "  (virtual passkey)"}`);
  const t0 = performance.now();
  await page.goto(url, { waitUntil: "load", timeout: 90_000 });

  let shot = 0;
  let lastStep = null;
  let lastTap = 0;
  let last = null;
  while (performance.now() - t0 < timeout) {
    await sleep(400);
    let bar;
    try {
      bar = await page.evaluate(readBar);
    } catch (e) {
      console.log(`${stamp(t0)}  evaluate failed: ${e.message.split("\n")[0]}`);
      if (page.isClosed()) break;
      continue;
    }
    last = bar;
    if (!bar.present) continue;
    if (bar.step !== lastStep) {
      lastStep = bar.step;
      console.log(`${stamp(t0)}  ${bar.step}  ${bar.path}`);
      if (!noShots) {
        await sleep(1800); // let the cut / route transition settle
        const file = path.join(out, `${prefix}-${++shot}-${bar.step}.png`);
        await page.screenshot({ path: file });
      }
    }
    if (bar.waiting && performance.now() - lastTap > 4000) {
      const pressed = await page.evaluate(tapForJudge);
      if (pressed) {
        lastTap = performance.now();
        console.log(`${stamp(t0)}  tap ${pressed}`);
      }
    }
    if (bar.finished) {
      ok = true;
      break;
    }
  }
  if (ok && last) {
    console.log(`${stamp(t0)}  finished — ${last.elapsed ?? "?"} on the bar`);
    console.log(last.summary?.split("\n").join(" · "));
    for (const tx of last.txs) console.log("   ", tx);
    if (!noShots) {
      await sleep(6500); // back to the room + hero shot of the lit seat
      const file = path.join(out, `${prefix}-final.png`);
      await page.screenshot({ path: file });
      console.log(`shots → ${path.relative(process.cwd(), out)}/${prefix}-*.png`);
    }
  } else {
    console.log(`timed out after ${stamp(t0)} — last: ${JSON.stringify(last)}`);
    if (!noShots) await page.screenshot({ path: path.join(out, `${prefix}-timeout.png`) });
  }
  watcher.flush();
  await page.close();
} finally {
  await browser.close();
}
process.exit(ok ? 0 : 1);
