import { existsSync, readFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { serve } from "@hono/node-server";
import { turnstileEventAbi } from "@turnstile/contracts/abi";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { getAddress, isAddress } from "viem";
import {
  chainId,
  deployment,
  gateAccount,
  publicClient,
  relayerAccount,
  settings,
  verifyChain,
} from "./config.ts";
import { drip } from "./drip.ts";
import { findEvent, getEvents, tierFor } from "./events.ts";
import { checkIn, lookupEntry } from "./gate.ts";
import { PassportStore } from "./passport.ts";
import { RateLimiter } from "./ratelimit.ts";
import { relay, relayGas } from "./relay.ts";

function json(value: unknown, status = 200): Response {
  return new Response(
    JSON.stringify(value, (_, item: unknown) => (typeof item === "bigint" ? item.toString() : item)),
    {
      status,
      headers: { "content-type": "application/json; charset=UTF-8" },
    },
  );
}

function ip(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

await verifyChain();
const app = new Hono();
const relayLimit = new RateLimiter(30, 60_000);
const dripIpLimit = new RateLimiter(10, 60_000);
const passportLimit = new RateLimiter(20, 60_000);
const passports = new PassportStore(settings.passportFile);

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

app.get("/api/health", async () =>
  json({
    ok: true,
    chainId,
    block: await publicClient.getBlockNumber(),
    relayer: relayerAccount.address,
    gate: gateAccount.address,
  }),
);

// `?fresh=1` skips the 15 s event cache (the organiser flow calls it right after `createEvent`).
const fresh = (context: Context) => context.req.query("fresh") === "1";

app.get("/api/config", async (context) =>
  json({
    chainId,
    rpcUrl: settings.publicRpcUrl,
    explorer: settings.explorer,
    factory: deployment.factory,
    forwarder: deployment.forwarder,
    implementation: deployment.implementation,
    relayer: relayerAccount.address,
    gate: gateAccount.address,
    gas: relayGas,
    drip: { enabled: settings.dripEnabled, amountWei: settings.dripAmount },
    events: await getEvents(fresh(context)),
  }),
);
app.get("/api/events", async (context) => json(await getEvents(fresh(context))));

// Ticket metadata (`tokenURI`). Events are created with `baseURI = <api>/api/events/<eventId>/tickets/`;
// the address form is kept for tooling.
app.get("/api/events/:id/tickets/:tokenId", (context) => metadata(context));
app.get("/api/events/:id/:tokenId", (context) => metadata(context));

async function metadata(context: Context) {
  const idText = context.req.param("id") ?? "";
  const tokenText = context.req.param("tokenId") ?? "";
  const notFound = () => json({ error: { code: "NOT_FOUND", message: "Unknown seat" } }, 404);
  if (!/^[0-9]+$/.test(tokenText)) return notFound();
  let event: Awaited<ReturnType<typeof findEvent>>;
  if (isAddress(idText)) event = await findEvent(getAddress(idText));
  else if (/^[0-9]+$/.test(idText)) event = (await getEvents()).find((e) => e.eventId === idText);
  else return notFound();
  const tokenId = BigInt(tokenText);
  const tier = event ? tierFor(event, tokenId) : undefined;
  if (!event || !tier) return notFound();
  const states = (await publicClient.readContract({
    address: event.address,
    abi: turnstileEventAbi,
    functionName: "seatStates",
    args: [tokenId, 1n],
  })) as readonly { checkedInAt: bigint }[];
  return json({
    name: `${event.name} — ${tier.name} #${tokenId}`,
    description: `${tier.name} seat #${tokenId} for ${event.name}, bound to the holder's passkey.`,
    image: null,
    attributes: [
      { trait_type: "Event", value: event.name },
      { trait_type: "Tier", value: tier.name },
      { trait_type: "Seat", value: tokenId },
      { trait_type: "Checked in", value: (states[0]?.checkedInAt ?? 0n) !== 0n },
    ],
  });
}

app.post("/api/relay", async (context) => {
  if (!relayLimit.allow(ip(context.req.raw.headers))) {
    return json({ error: { code: "RATE_LIMITED", message: "Too many requests" } }, 429);
  }
  const result = await relay(await context.req.json().catch(() => undefined));
  return json(result.body, result.status);
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
  return json(result, result.ok ? 200 : result.status);
});

// The private passport: ciphertext in, ciphertext out. Writes carry the account key's signature (SPEC §4.6).
app.get("/api/passport/:address", (context) => {
  const address = context.req.param("address");
  if (!isAddress(address)) return json({ error: { code: "BAD_ADDRESS", message: "Not an address" } }, 400);
  const record = passports.get(address);
  if (!record)
    return json({ error: { code: "NOT_FOUND", message: "No passport stored for this account" } }, 404);
  return json({ blob: record.blob, issuedAt: record.issuedAt, updatedAt: record.updatedAt });
});
app.put("/api/passport/:address", async (context) => {
  if (!passportLimit.allow(ip(context.req.raw.headers))) {
    return json({ error: { code: "RATE_LIMITED", message: "Too many requests" } }, 429);
  }
  const result = await passports.put(
    context.req.param("address"),
    await context.req.json().catch(() => undefined),
  );
  return json(result.body, result.status);
});

app.post("/api/drip", async (context) => {
  if (!dripIpLimit.allow(ip(context.req.raw.headers))) {
    return json({ error: { code: "RATE_LIMITED", message: "Too many requests" } }, 429);
  }
  const result = await drip(await context.req.json().catch(() => undefined));
  return json(result.body, result.status);
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
  console.log(`relayer listening on :${info.port} chain ${chainId}`);
});
