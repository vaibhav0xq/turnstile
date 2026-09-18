import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { turnstileEventAbi } from "@turnstile/contracts/abi";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { getAddress, isAddress } from "viem";
import { redirectStatus, redirectTarget } from "./canonical-host.ts";
import { classifyForwarded, clientIp } from "./client-ip.ts";
import {
  chain,
  chainId,
  deployment,
  gateAccount,
  publicClient,
  relayerAccount,
  rpc,
  settings,
  verifyChain,
} from "./config.ts";
import { drip } from "./drip.ts";
import { findEvent, getEvents, tierFor } from "./events.ts";
import { checkIn, lookupEntry } from "./gate.ts";
import { PassportStore } from "./passport.ts";
import { PostgresPassportBackend } from "./passport-postgres.ts";
import { RateLimiter } from "./ratelimit.ts";
import { relay, relayGas } from "./relay.ts";
import { rpcHost } from "./rpc.ts";
import { instanceId, sponsorshipStatus } from "./sponsorship.ts";
import { renderTicketSvg, requestOrigin } from "./ticket-image.ts";

function json(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(
    JSON.stringify(value, (_, item: unknown) => (typeof item === "bigint" ? item.toString() : item)),
    {
      status,
      headers: { "content-type": "application/json; charset=UTF-8", ...headers },
    },
  );
}

/** Route result → response; refusals carry `Retry-After` so well-behaved clients back off correctly. */
function answer(result: { status: number; body: unknown; retryAfterSec?: number | undefined }): Response {
  const headers = result.retryAfterSec ? { "retry-after": String(result.retryAfterSec) } : {};
  return json(result.body, result.status, headers);
}

function tooMany(): Response {
  return json({ error: { code: "RATE_LIMITED", message: "Too many requests" } }, 429, {
    "retry-after": "10",
  });
}

/** The limiter key: only proxy-written forwarding entries count (client-ip.ts), never the client's own. */
function ip(context: Context): string {
  return resolveIp(context).key;
}

function resolveIp(context: Context) {
  let remoteAddress: string | null = null;
  try {
    remoteAddress = getConnInfo(context).remote.address ?? null;
  } catch {
    remoteAddress = null;
  }
  return clientIp(context.req.raw.headers, { trustedHops: settings.trustedProxyHops, remoteAddress });
}

await verifyChain();
const app = new Hono();
const relayLimit = new RateLimiter(30, 60_000);
const dripIpLimit = new RateLimiter(10, 60_000);
const passportLimit = new RateLimiter(20, 60_000);
const passports = new PassportStore(
  settings.databaseUrl ? await PostgresPassportBackend.open(settings.databaseUrl) : settings.passportFile,
);

// Alias hosts (`www.<apex>`, backup domains) redirect before anything else: a page served from an alias
// would mint passkeys under a second RP ID (see canonical-host.ts).
app.use("*", async (context, next) => {
  const url = new URL(context.req.url);
  const target = redirectTarget(
    settings.canonicalHost,
    context.req.header("host"),
    url.pathname + url.search,
  );
  if (!target) return next();
  return context.redirect(target, redirectStatus(context.req.method));
});
app.use(
  "*",
  cors({
    origin: (origin) =>
      settings.corsOrigins.includes("*") || settings.corsOrigins.includes(origin) ? origin || "*" : "",
  }),
);
app.use("*", async (context, next) => {
  const started = Date.now();
  await next();
  console.log(`${context.req.method} ${context.req.path} ${context.res.status} ${Date.now() - started}ms`);
});

app.get("/api/health", async () => {
  const started = Date.now();
  const block = await publicClient.getBlockNumber();
  return json({
    ok: true,
    chainId,
    block,
    relayer: relayerAccount.address,
    gate: gateAccount.address,
    // Which provider answered (hostname only, never the key) and what it falls back to.
    rpc: {
      provider: rpc.provider,
      host: rpcHost(rpc.primary),
      fallbacks: rpc.fallbacks.map(rpcHost),
      latencyMs: Date.now() - started,
    },
    // Spend safety, in the open: balances against their floors, budget use and queue depth. Public
    // addresses and on-chain balances only — nothing here is a secret.
    instance: instanceId,
    sponsorship: await sponsorshipStatus(),
  });
});

// What the limiter sees for this caller: the sweep sends a forged X-Forwarded-For and expects to be ignored.
app.get("/api/ip", (context) => {
  const seen = resolveIp(context);
  return json({
    ip: seen.address,
    key: seen.key,
    source: seen.source,
    forwardedEntries: seen.forwardedEntries,
    // Classes only (no addresses): from a clean client, public entries − 1 is the right TRUSTED_PROXY_HOPS.
    forwardedPattern: classifyForwarded(context.req.raw.headers),
    trustedProxyHops: settings.trustedProxyHops,
  });
});

// `?fresh=1` skips the 15 s event cache (the organiser flow calls it right after `createEvent`).
const fresh = (context: Context) => context.req.query("fresh") === "1";

app.get("/api/config", async (context) =>
  json({
    chainId,
    rpcUrl: settings.publicRpcUrl,
    rpcFallbackUrls: settings.publicRpcFallbackUrls,
    rpcProvider: settings.publicRpcProvider,
    explorer: settings.explorer,
    environmentLabel: settings.environmentLabel,
    factory: deployment.factory,
    forwarder: deployment.forwarder,
    implementation: deployment.implementation,
    relayer: relayerAccount.address,
    gate: gateAccount.address,
    // True when check-in needs the operator bearer token (`GATE_TOKEN`); the door UI asks for it up front.
    gateProtected: settings.gateToken !== null,
    gas: relayGas,
    drip: { enabled: settings.dripEnabled, amountWei: settings.dripAmount },
    events: await getEvents(fresh(context)),
  }),
);
app.get("/api/events", async (context) => json(await getEvents(fresh(context))));

// Ticket metadata (`tokenURI`). Events are created with `baseURI = <api>/api/events/<eventId>/tickets/`;
// the address form is kept for tooling. `…/image.svg` is what `image` points at.
app.get("/api/events/:id/tickets/:tokenId/image.svg", (context) => ticketImage(context));
app.get("/api/events/:id/tickets/:tokenId", (context) => metadata(context));
app.get("/api/events/:id/:tokenId", (context) => metadata(context));

const notFound = () => json({ error: { code: "NOT_FOUND", message: "Unknown seat" } }, 404);

/** Resolves `:id` (eventId or address) and `:tokenId` to the event, its tier and the seat's chain state. */
async function seatLookup(context: Context) {
  const idText = context.req.param("id") ?? "";
  const tokenText = context.req.param("tokenId") ?? "";
  if (!/^[0-9]+$/.test(tokenText)) return null;
  let event: Awaited<ReturnType<typeof findEvent>>;
  if (isAddress(idText)) event = await findEvent(getAddress(idText));
  else if (/^[0-9]+$/.test(idText)) event = (await getEvents()).find((e) => e.eventId === idText);
  else return null;
  const tokenId = BigInt(tokenText);
  const tier = event ? tierFor(event, tokenId) : undefined;
  if (!event || !tier) return null;
  const states = (await publicClient.readContract({
    address: event.address,
    abi: turnstileEventAbi,
    functionName: "seatStates",
    args: [tokenId, 1n],
  })) as readonly { checkedInAt: bigint }[];
  const checkedIn = (states[0]?.checkedInAt ?? 0n) !== 0n;
  return { event, tier, tokenId, checkedIn };
}

async function metadata(context: Context) {
  const seat = await seatLookup(context);
  if (!seat) return notFound();
  const { event, tier, tokenId, checkedIn } = seat;
  const origin = requestOrigin(context.req.raw.headers, context.req.url, settings.publicOrigin);
  return json({
    name: `${event.name} · ${tier.name} #${tokenId}`,
    description: `${tier.name} seat #${tokenId} for ${event.name}, bound to the holder's passkey.`,
    image: `${origin}/api/events/${event.eventId}/tickets/${tokenId}/image.svg`,
    external_url: `${origin}/t/${event.address}/${tokenId}`,
    attributes: [
      { trait_type: "Event", value: event.name },
      { trait_type: "Tier", value: tier.name },
      { trait_type: "Seat", value: tokenId },
      { trait_type: "Checked in", value: checkedIn },
    ],
  });
}

async function ticketImage(context: Context) {
  const seat = await seatLookup(context);
  if (!seat) return notFound();
  const { event, tier, tokenId, checkedIn } = seat;
  const svg = renderTicketSvg({
    eventName: event.name,
    tierName: tier.name,
    seatId: Number(tokenId),
    seatIndex: Number(tokenId) - tier.firstSeat,
    seatCount: tier.seatCount,
    startsAt: event.startsAt,
    checkedIn,
    chainName: chain.name,
    eventAddress: event.address,
  });
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=UTF-8",
      // The card changes once at check-in; a minute of caching keeps marketplaces from hammering the RPC.
      "cache-control": "public, max-age=60",
    },
  });
}

app.post("/api/relay", async (context) => {
  if (!relayLimit.allow(ip(context))) return tooMany();
  return answer(await relay(await context.req.json().catch(() => undefined)));
});

app.get("/api/gate/lookup", async (context) => {
  const result = await lookupEntry(context.req.query("code"));
  return json(result, result.ok ? 200 : result.status);
});
app.post("/api/gate/check-in", async (context) => {
  if (settings.gateToken && context.req.header("authorization") !== `Bearer ${settings.gateToken}`) {
    return json({ ok: false, code: "UNAUTHORIZED", message: "A valid gate token is required" }, 401);
  }
  const body = (await context.req.json().catch(() => undefined)) as { code?: unknown } | undefined;
  const result = await checkIn(body?.code);
  if (result.ok) return json(result);
  const retryAfterSec =
    "retryAfterSec" in result && typeof result.retryAfterSec === "number" ? result.retryAfterSec : undefined;
  return answer({ status: result.status, body: result, retryAfterSec });
});

// The private passport: ciphertext in, ciphertext out. Writes carry the account key's signature (SPEC §4.6).
app.get("/api/passport/:address", async (context) => {
  const address = context.req.param("address");
  if (!isAddress(address)) return json({ error: { code: "BAD_ADDRESS", message: "Not an address" } }, 400);
  const record = await passports.get(address);
  if (!record)
    return json({ error: { code: "NOT_FOUND", message: "No passport stored for this account" } }, 404);
  return json({ blob: record.blob, issuedAt: record.issuedAt, updatedAt: record.updatedAt });
});
app.put("/api/passport/:address", async (context) => {
  if (!passportLimit.allow(ip(context))) return tooMany();
  const result = await passports.put(
    context.req.param("address"),
    await context.req.json().catch(() => undefined),
  );
  return json(result.body, result.status);
});

app.post("/api/drip", async (context) => {
  if (!dripIpLimit.allow(ip(context))) return tooMany();
  return answer(await drip(await context.req.json().catch(() => undefined)));
});

if (settings.staticDir) {
  // Single-process deployment: static assets + SPA fallback for every non-API route.
  const root = settings.staticDir;
  const types: Record<string, string> = {
    ".html": "text/html; charset=UTF-8",
    ".js": "text/javascript; charset=UTF-8",
    ".css": "text/css; charset=UTF-8",
    ".json": "application/json; charset=UTF-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".wasm": "application/wasm",
    ".webmanifest": "application/manifest+json",
    ".txt": "text/plain; charset=UTF-8",
  };
  const index = join(root, "index.html");
  if (!existsSync(index)) throw new Error(`STATIC_DIR ${root} has no index.html`);
  app.get("*", (context) => {
    const requestPath = normalize(decodeURIComponent(context.req.path)).replace(/^(\.\.[/\\])+/, "");
    if (requestPath.startsWith("/api/"))
      return json({ error: { code: "NOT_FOUND", message: "No such route" } }, 404);
    const file = join(root, requestPath);
    const inRoot = file.startsWith(root);
    const isAsset = inRoot && extname(file) !== "" && existsSync(file);
    const body = readFileSync(isAsset ? file : index);
    const type = isAsset ? (types[extname(file)] ?? "application/octet-stream") : types[".html"];
    const cache =
      isAsset && requestPath.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache";
    return new Response(body, { headers: { "content-type": type ?? "text/plain", "cache-control": cache } });
  });
}

app.onError((error) => {
  console.error(error instanceof Error ? error.message : "Unhandled request error");
  return json({ error: { code: "INTERNAL_ERROR", message: "Internal server error" } }, 500);
});

serve({ fetch: app.fetch, port: settings.port }, (info) => {
  const store = settings.databaseUrl ? "postgres" : settings.passportFile ? "file" : "memory";
  console.log(
    `relayer listening on :${info.port} chain ${chainId} passports ${store} rpc ${rpc.provider} (${rpcHost(rpc.primary)}${rpc.fallbacks.length ? ` +${rpc.fallbacks.length} fallback` : ""})`,
  );
  if (settings.canonicalHost) {
    console.log(
      `canonical host ${settings.canonicalHost.origin}; redirecting ${[...settings.canonicalHost.aliases].join(", ")}`,
    );
  }
  if (chainId !== 31337 && !settings.publicOrigin) {
    console.warn(
      "PUBLIC_ORIGIN is not set: metadata image/external_url will follow each request's Host header",
    );
  }
});
