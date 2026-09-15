#!/usr/bin/env node
// Origin preflight: the read-only checks of docs/final-domain-migration.md §3 as one command, so a fresh
// origin (staging today, the final domain later) is verified the same way every time before the smoke run,
// the judge run and — last — the `baseURI` re-point. Nothing here sends a transaction.
//
//   node scripts/preflight.mjs --origin https://turnstile-michellecox8789.replit.app     # staging: label expected
//   node scripts/preflight.mjs --origin https://turnstile.work --final                    # no label, absolute OG, www → apex
//   node scripts/preflight.mjs --origin https://turnstile.work --final --event 1 --token 1 --chain 10143
//
// Exit code 1 if any check fails; every check prints ✓ or ✗ with what it saw.
const args = parseArgs(process.argv.slice(2));
const ORIGIN = (args.origin ?? process.env.ORIGIN ?? process.env.RELAYER_URL ?? "").replace(/\/$/, "");
if (!/^https?:\/\/[^/]+$/.test(ORIGIN)) {
  console.error(
    "usage: preflight.mjs --origin https://<host> [--final] [--event 1] [--token 1] [--chain 10143]",
  );
  process.exit(2);
}
const FINAL = args.final === "true";
const EVENT = args.event ?? "1";
const TOKEN = args.token ?? "1";
const CHAIN = Number(args.chain ?? 10143);
const host = new URL(ORIGIN).host;

let failures = 0;
function check(ok, label, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
  return ok;
}

async function get(path, init = {}) {
  const started = performance.now();
  try {
    const res = await fetch(`${ORIGIN}${path}`, { redirect: "manual", ...init });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return {
      status: res.status,
      headers: res.headers,
      text,
      json,
      ms: Math.round(performance.now() - started),
    };
  } catch (error) {
    return { status: 0, headers: new Headers(), text: "", json: null, ms: 0, error: String(error) };
  }
}

console.log(`preflight ${ORIGIN}${FINAL ? " (final origin)" : ""}\n`);

// ---------------------------------------------------------------- relayer
const health = await get("/api/health");
check(
  health.status === 200 && health.json?.ok === true,
  "/api/health ok",
  health.error ?? `status ${health.status} · ${health.ms} ms`,
);
check(health.json?.chainId === CHAIN, `chain ${CHAIN}`, `saw ${health.json?.chainId}`);
const rpc = health.json?.rpc ?? null;
const rpcDetail = rpc
  ? `${rpc.provider} · ${rpc.host} · ${rpc.latencyMs} ms · fallbacks ${rpc.fallbacks?.length ?? 0}`
  : "no rpc block in /api/health (older relayer build?)";
check(!FINAL || rpc?.provider === "alchemy", "rpc provider", rpcDetail);
check(!FINAL || (rpc?.fallbacks?.length ?? 0) > 0, "rpc fallback configured", rpcDetail);

const config = await get("/api/config");
check(config.status === 200 && Array.isArray(config.json?.events), "/api/config", `status ${config.status}`);
const label = config.json?.environmentLabel ?? null;
check(
  FINAL ? label === null : true,
  FINAL ? "no environment label" : "environment label",
  label === null ? "none (final origin)" : `"${label}"`,
);
check(
  typeof config.json?.explorer === "string" && config.json.explorer.startsWith("https://"),
  "explorer URL",
  config.json?.explorer,
);
check(
  config.json?.drip?.enabled === true,
  "drip on (paid seats in the demo need it)",
  `enabled: ${config.json?.drip?.enabled}`,
);
console.log(
  `  gateProtected ${config.json?.gateProtected} · ${config.json?.events?.length ?? 0} events · relayer ${config.json?.relayer}`,
);

// ---------------------------------------------------------------- metadata on this origin
const meta = await get(`/api/events/${EVENT}/tickets/${TOKEN}`);
const onOrigin = (url) => typeof url === "string" && url.startsWith(`${ORIGIN}/`);
check(
  meta.status === 200 && meta.json,
  `metadata /api/events/${EVENT}/tickets/${TOKEN}`,
  `status ${meta.status}`,
);
check(onOrigin(meta.json?.image), "metadata image on this origin", meta.json?.image);
check(onOrigin(meta.json?.external_url), "metadata external_url on this origin", meta.json?.external_url);

const spoofed = await get(`/api/events/${EVENT}/tickets/${TOKEN}`, {
  headers: { "x-forwarded-host": "evil.example" },
});
check(onOrigin(spoofed.json?.image), "spoofed X-Forwarded-Host ignored", spoofed.json?.image);

const image = await get(`/api/events/${EVENT}/tickets/${TOKEN}/image.svg`);
check(
  image.status === 200 &&
    (image.headers.get("content-type") ?? "").startsWith("image/svg+xml") &&
    image.text.includes("<svg"),
  "ticket image.svg renders",
  `status ${image.status} · ${image.headers.get("content-type")} · ${image.text.length} bytes`,
);

// ---------------------------------------------------------------- the site
const TITLE = "Turnstile — access that follows you";
const home = await get("/");
const title = home.text.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
check(
  home.status === 200 && title === TITLE,
  "/ serves the app",
  `status ${home.status} · "${title}" · ${home.ms} ms`,
);
const canonical = home.text.match(/<link rel="canonical" href="([^"]+)"/)?.[1] ?? null;
const ogImage = home.text.match(/<meta property="og:image" content="([^"]+)"/)?.[1] ?? null;
const ogUrl = home.text.match(/<meta property="og:url" content="([^"]+)"/)?.[1] ?? null;
if (FINAL) {
  check(canonical === `${ORIGIN}/`, "canonical link on this origin (VITE_SITE_URL)", canonical ?? "missing");
  check(ogUrl === `${ORIGIN}/`, "og:url on this origin", ogUrl ?? "missing");
  check(onOrigin(ogImage), "og:image absolute", ogImage ?? "missing");
} else {
  console.log(
    `  canonical ${canonical ?? "—"} · og:url ${ogUrl ?? "—"} · og:image ${ogImage ?? "—"} (absolute only with VITE_SITE_URL)`,
  );
}
// The SPA fallback answers any path with index.html and a 200, so a 200 alone proves nothing: check the type
// and the first bytes of each asset.
const assets = [
  ["/robots.txt", "text/plain", (t) => /^User-agent:/im.test(t)],
  // Served as .json on purpose: the platform's static layer labels .webmanifest text/plain.
  ["/manifest.json", "application/", (t) => /"name"/.test(t)],
  ["/og.jpg", "image/jpeg", (t) => t.length > 10_000],
  ["/favicon.svg", "image/svg+xml", (t) => t.includes("<svg")],
];
for (const [path, type, looksRight] of assets) {
  const res = await get(path);
  const contentType = res.headers.get("content-type") ?? "";
  check(
    res.status === 200 && contentType.startsWith(type) && looksRight(res.text),
    path,
    `status ${res.status} · ${contentType || "no content-type"}`,
  );
}
const deep = await get(`/e/0x0000000000000000000000000000000000000000`);
check(
  deep.status === 200 && deep.text.includes(`<title>${TITLE}</title>`),
  "deep link falls back to the app",
  `status ${deep.status}`,
);

// ---------------------------------------------------------------- one canonical host
const isPlatform = /\.replit\.app$/.test(host);
if (isPlatform) {
  console.log("  www redirect: not applicable on a platform hostname");
} else {
  // On the platform deployment page routes never reach the relayer, so `www` is answered by whatever the
  // registrar forwards: accept a redirect to the apex over https, or over plain http when the forwarder has no
  // certificate for `www` (a registrar URL forward). Either way one host owns the passkeys.
  const wwwHost = host.startsWith("www.") ? host.slice(4) : `www.${host}`;
  const started = performance.now();
  const results = [];
  for (const scheme of ["https", "http"]) {
    try {
      const res = await fetch(`${scheme}://${wwwHost}/e/x`, { redirect: "manual" });
      const location = res.headers.get("location") ?? "";
      results.push(`${scheme} ${res.status} → ${location || "—"}`);
      if ([301, 302, 307, 308].includes(res.status) && location.startsWith(ORIGIN)) {
        check(
          true,
          `${wwwHost} → ${host}`,
          `${results.join(" · ")} · ${Math.round(performance.now() - started)} ms`,
        );
        break;
      }
    } catch (error) {
      results.push(`${scheme} unreachable (${String(error).split("\n")[0]})`);
    }
    if (scheme === "http")
      check(
        false,
        `${wwwHost} → ${host}`,
        `${results.join(" · ")} — no forward to the apex yet (registrar URL forward, or DNS not ready)`,
      );
  }
}

console.log(
  failures === 0
    ? `\n✓ ${ORIGIN} ready — next: pnpm smoke -- --relayer ${ORIGIN} --rpc <rpc>, then the judge run`
    : `\n✗ ${failures} check${failures === 1 ? "" : "s"} failed on ${ORIGIN}`,
);
process.exit(failures === 0 ? 0 : 1);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else out[key] = "true";
  }
  return out;
}
