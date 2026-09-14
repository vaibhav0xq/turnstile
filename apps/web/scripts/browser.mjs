// Shared headless-Chromium launcher for the review scripts (software WebGL, no GPU needed).
import puppeteer from "puppeteer-core";

export async function launch({ width = 1280, height = 800 } = {}) {
  return puppeteer.launch({
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
}

/** Collects console/page errors and failed requests; `flush()` prints the noteworthy ones. */
export function watch(page) {
  const logs = [];
  page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  page.on("requestfailed", (r) => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText ?? ""}`));
  return {
    logs,
    flush(limit = 25) {
      for (const line of logs.filter((l) => !/\[(log|debug|info)\]/.test(l)).slice(0, limit))
        console.log("   ", line);
    },
  };
}

/**
 * A platform passkey that answers every prompt by itself (CTAP2.1, resident keys, user verification, PRF),
 * so the real identity path — not the `?dev=` seed — can run unattended. Returns the authenticator id.
 */
export async function addVirtualPasskey(page) {
  const cdp = await page.createCDPSession();
  await cdp.send("WebAuthn.enable", { enableUI: false });
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      ctap2Version: "ctap2_1",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      hasPrf: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
      defaultBackupEligibility: true,
      defaultBackupState: true,
    },
  });
  return { cdp, authenticatorId };
}
