#!/usr/bin/env node
// A stand-in for the Envio GraphQL endpoint, for working on the Live layer's UI without Docker or a hosted
// indexer. It answers the five named operations in src/live/queries.ts with deterministic, plausible rows
// shaped like the real schema (packages/indexer/schema.graphql). Nothing here is real: point
// VITE_ENVIO_GRAPHQL_URL at it only for local UI work.
//
//   node scripts/mock-indexer.mjs [--port 8790] [--lag 0] [--relayer http://127.0.0.1:8787]
//   VITE_ENVIO_GRAPHQL_URL=http://127.0.0.1:8790/v1/graphql pnpm dev
//
// --lag N makes chain_metadata trail the relayer's /api/health block by N (to see the amber / red chip);
// --fail makes every query answer 503 (to see the failure states).

import http from "node:http";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const PORT = Number(opt("port", "8790"));
const LAG = Number(opt("lag", "0"));
const RELAYER = opt("relayer", "http://127.0.0.1:8787");
const FAIL = args.includes("--fail");

const KINDS = ["MINT", "BIND", "CHECKIN", "MINT", "LIST", "RESALE", "BIND", "CHECKIN", "MINT", "DELIST"];
const FANS = [
  "0xa474e24e29eec4733a741bb4c4800ce7d3f424a8",
  "0x2d4f6e4b0e45327e92a9be5e1c1ae2c489678630",
  "0x9b1c0e5f5a42d6e7c8b3a1d2e3f4a5b6c7d8e9f0",
  "0x14d2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4",
];
const GATE = "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc";
const WEI = 10n ** 18n;
const price = (n) => String((WEI * BigInt(n)) / 100n); // n hundredths of a MON

const now = () => Math.floor(Date.now() / 1000);
const hash = (i, salt) => `0x${(salt + i * 7919).toString(16).padStart(8, "0").repeat(8)}`;

function activityRows(count, { eventName, address, tokenBase = 1, actor, chainId, newestFirst = true }) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    const kind = KINDS[i % KINDS.length];
    const who = actor ?? FANS[i % FANS.length];
    const other = FANS[(i + 1) % FANS.length];
    rows.push({
      id: `${chainId}-${1000 + i}-${i % 3}`,
      kind,
      actor: kind === "RESALE" && actor ? other : who,
      counterparty: kind === "RESALE" ? (actor ? who : other) : kind === "CHECKIN" ? GATE : null,
      amount: kind === "MINT" ? (i % 4 === 0 ? "0" : price(5)) : kind === "RESALE" ? price(7) : "0",
      timestamp: String(now() - i * 95 - 20),
      block: String(500_000 - i * 3),
      txHash: hash(i, 0x51ee),
      event: { name: eventName, address },
      ticket: { tokenId: String(tokenBase + ((i * 13) % 40)), tier: i % 5 === 0 ? 1 : 0 },
    });
  }
  return newestFirst ? rows : rows.reverse();
}

function minuteRows(count = 30) {
  const start = Math.floor(now() / 60) * 60;
  const rows = [];
  for (let i = 0; i < count; i++) {
    const mints = [0, 1, 0, 2, 3, 1, 0, 0, 4, 2][i % 10];
    const checkIns = [0, 0, 1, 1, 2, 3, 2, 1, 0, 1][i % 10];
    rows.push({
      minute: String(start - i * 60),
      mints,
      checkIns,
      resales: i % 7 === 0 ? 1 : 0,
      volume: price(5 * mints),
    });
  }
  return rows;
}

async function head() {
  try {
    const res = await fetch(`${RELAYER}/api/health`);
    const body = await res.json();
    return Number(body.block ?? 0);
  } catch {
    return 0;
  }
}

async function answer(operation, v) {
  const chainId = v.chainId ?? 31337;
  switch (operation) {
    case "OrganiserLiveBoard":
      return {
        Event: [
          {
            id: `${chainId}-${v.address}`,
            chainId,
            address: v.address,
            name: "Opening Night",
            sold: 41,
            comps: 3,
            checkedIn: 17,
            listed: 2,
            resales: 4,
            primaryVolume: price(5 * 38),
            resaleVolume: price(7 * 4),
            resaleFees: price(2),
          },
        ],
        Activity: activityRows(20, { eventName: "Opening Night", address: v.address, chainId }),
        EventMinute: minuteRows(),
      };
    case "PassportHistory":
      return {
        Fan: [
          {
            id: `${chainId}-${v.address}`,
            chainId,
            address: v.address,
            tickets: 2,
            bought: 5,
            checkIns: 3,
            firstSeenAt: String(now() - 86400 * 12),
            lastSeenAt: String(now() - 600),
          },
        ],
        Activity: activityRows(12, {
          eventName: "Opening Night",
          address: "0xevent",
          actor: v.address,
          chainId,
        }),
      };
    case "CityPulse": {
      const addresses = v.addresses ?? [];
      return {
        Stats: [
          {
            events: Math.max(2, addresses.length),
            sold: 128,
            comps: 9,
            checkedIn: 61,
            resales: 11,
            fans: 97,
            primaryVolume: price(5 * 100),
            resaleVolume: price(7 * 11),
            resaleFees: price(5),
            lastActivityAt: String(now() - 40),
            lastBlock: String(500_000),
          },
        ],
        Event: addresses.map((address, i) => ({
          id: `${chainId}-${address}`,
          address,
          name: i === 0 ? "Opening Night" : "Second Night",
          sold: 41 - i * 10,
          comps: 3,
          checkedIn: 17 - i * 5,
          listed: 2,
          resales: 4,
        })),
        Activity: activityRows(6, { eventName: "Opening Night", address: addresses[0] ?? "0x", chainId }),
      };
    }
    case "Pulse": {
      const events = [
        "0x1000000000000000000000000000000000000001",
        "0x1000000000000000000000000000000000000002",
      ];
      const feed = activityRows(30, { eventName: "Opening Night", address: events[0], chainId });
      return {
        Stats: [
          {
            events: 2,
            sold: 128,
            comps: 9,
            checkedIn: 61,
            resales: 11,
            fans: 97,
            primaryVolume: price(5 * 100),
            resaleVolume: price(7 * 11),
            resaleFees: price(5),
            lastActivityAt: String(now() - 40),
            lastBlock: String(500_000),
          },
        ],
        Event: events.map((address, i) => ({
          id: `${chainId}-${address}`,
          chainId,
          address,
          name: i === 0 ? "Opening Night" : "Second Night",
          startsAt: String(now() + 3600 * (i + 1)),
          createdAt: String(now() - 86_400 * (i + 1)),
          sold: 41 - i * 10,
          comps: 3,
          checkedIn: 17 - i * 5,
          listed: 2,
          resales: 4,
          primaryVolume: price(5 * 30),
          resaleVolume: price(7 * 4),
          resaleFees: price(2),
        })),
        feed,
        doors: feed.filter((row) => row.kind === "CHECKIN"),
        Handover: feed
          .filter((row) => row.kind === "RESALE")
          .map((row) => ({
            id: row.id,
            seller: row.actor,
            buyer: row.counterparty,
            price: row.amount,
            fee: price(1),
            timestamp: row.timestamp,
            txHash: row.txHash,
            event: row.event,
            ticket: row.ticket,
          })),
        EventMinute: minuteRows(60),
      };
    }
    case "TicketProvenance": {
      const rows = activityRows(5, {
        eventName: "Opening Night",
        address: v.eventAddress,
        chainId,
        newestFirst: false,
      });
      const life = ["MINT", "BIND", "LIST", "RESALE", "CHECKIN"];
      return {
        Activity: rows.map((row, i) => ({
          ...row,
          kind: life[i],
          actor: i >= 4 ? FANS[1] : FANS[0], // the seller lists and hands over; the buyer walks in
          counterparty: life[i] === "RESALE" ? FANS[1] : life[i] === "CHECKIN" ? GATE : null,
          amount: life[i] === "MINT" ? price(5) : life[i] === "RESALE" ? price(7) : "0",
          timestamp: String(now() - (5 - i) * 1800),
          ticket: { tokenId: String(v.tokenId), tier: 0 },
        })),
      };
    }
    case "IndexerSync": {
      const h = await head();
      return {
        chain_metadata: [
          { chain_id: chainId, block_height: h, latest_processed_block: Math.max(0, h - LAG) },
        ],
      };
    }
    default:
      return null;
  }
}

const server = http.createServer(async (req, res) => {
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type" };
  if (req.method === "OPTIONS") return res.writeHead(204, cors).end();
  if (req.method !== "POST") return res.writeHead(404, cors).end("mock indexer: POST GraphQL here");
  let raw = "";
  for await (const chunk of req) raw += chunk;
  if (FAIL) return res.writeHead(503, cors).end("mock indexer: --fail");
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return res.writeHead(400, cors).end("bad json");
  }
  const operation = /query\s+(\w+)/.exec(body.query ?? "")?.[1] ?? "";
  const data = await answer(operation, body.variables ?? {});
  const json = data
    ? JSON.stringify({ data })
    : JSON.stringify({
        errors: [{ message: `mock indexer: unknown operation ${operation || "(anonymous)"}` }],
      });
  res.writeHead(200, { ...cors, "content-type": "application/json" }).end(json);
  console.log(`${operation || "?"} ${JSON.stringify(body.variables ?? {})}`);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mock indexer on http://127.0.0.1:${PORT}/v1/graphql (lag ${LAG}${FAIL ? ", failing" : ""})`);
});
