import assert from "node:assert/strict";
import { test } from "node:test";
import {
  big,
  describeActivity,
  freshness,
  kindLabel,
  lagAsTime,
  minuteSeries,
  summariseProvenance,
  timeAgo,
} from "../src/live/model.ts";

const ME = "0xa474E24e29eEc4733a741bB4C4800Ce7D3f424A8";
const OTHER = "0x2d4f6e4b0e45327e92a9be5e1c1ae2c489678630";

test("big accepts the shapes Hasura serialises numerics as", () => {
  assert.equal(big("50000000000000000"), 50_000_000_000_000_000n);
  assert.equal(big(7), 7n);
  assert.equal(big(null), 0n);
  assert.equal(big(""), 0n);
  assert.equal(big(12n), 12n);
});

test("freshness never claims sync it cannot see", () => {
  assert.equal(freshness(null, 100n).tone, "muted");
  assert.equal(freshness(100n, null).label, "Envio · #100");
  assert.deepEqual(freshness(100n, 101n), { tone: "green", label: "Envio · in sync", lag: 1 });
  assert.equal(freshness(105n, 100n).lag, 0); // indexer ahead of the relayer's RPC: still in sync
  assert.equal(freshness(100n, 130n).tone, "amber");
  assert.equal(freshness(100n, 300n).tone, "red");
  assert.equal(freshness(100n, 300n).label, "Envio · 200 blocks behind");
});

test("freshness tones are set in seconds, not blocks", () => {
  // 0.4 s blocks: a dozen blocks is one poll of ordinary latency, still in sync
  assert.equal(freshness(100n, 112n).tone, "green");
  assert.equal(freshness(100n, 112n).lag, 12);
  assert.equal(freshness(100n, 113n).tone, "amber"); // 5.2 s
  assert.equal(freshness(100n, 250n).tone, "amber"); // 60 s, the last amber
  assert.equal(freshness(100n, 251n).tone, "red");
  // a slower chain reaches the same thresholds in fewer blocks
  assert.equal(freshness(100n, 103n, 2_000).tone, "amber");
  assert.equal(lagAsTime(3), "≈ 1.2 s");
  assert.equal(lagAsTime(120), "≈ 48 s");
  assert.equal(lagAsTime(600), "≈ 4 min");
});

test("timeAgo rounds the way a feed reads", () => {
  const now = 1_800_000_000_000;
  assert.equal(timeAgo(1_800_000_000 - 10, now), "just now");
  assert.equal(timeAgo(1_800_000_000 - 4 * 60, now), "4 min ago");
  assert.equal(timeAgo(1_800_000_000 - 3 * 3600, now), "3 h ago");
  assert.equal(timeAgo(1_800_000_000 - 3 * 86400, now), "3 d ago");
  assert.equal(timeAgo(1_800_000_000 + 60, now), "just now"); // clock skew never goes negative
});

test("minuteSeries fills thirty buckets ending at the current minute, oldest first", () => {
  const now = 1_800_000_000_000 + 25_000; // 25 s into a minute
  const current = 1_800_000_000; // divisible by 60
  const rows = [
    { minute: String(current), mints: 2, checkIns: 1, resales: 0 },
    { minute: current - 5 * 60, mints: 0, checkIns: 3, resales: 1 },
    { minute: current - 60 * 60, mints: 9, checkIns: 9, resales: 9 }, // outside the window
  ];
  const series = minuteSeries(rows, now);
  assert.equal(series.length, 30);
  assert.equal(series[0]?.minute, current - 29 * 60);
  assert.deepEqual(series[29], { minute: current, mints: 2, checkIns: 1, resales: 0 });
  assert.deepEqual(series[24], { minute: current - 5 * 60, mints: 0, checkIns: 3, resales: 1 });
  assert.equal(
    series.reduce((n, b) => n + b.mints, 0),
    2,
  );
});

test("minuteSeries sums rows from different events that share a minute", () => {
  const now = 1_800_000_000_000 + 25_000;
  const current = 1_800_000_000;
  const rows = [
    { minute: String(current), mints: 2, checkIns: 1, resales: 0 },
    { minute: current, mints: 1, checkIns: 0, resales: 3 },
    { minute: current - 60, mints: 0, checkIns: 4, resales: 0 },
  ];
  const series = minuteSeries(rows, now, 60);
  assert.equal(series.length, 60);
  assert.deepEqual(series[59], { minute: current, mints: 3, checkIns: 1, resales: 3 });
  assert.deepEqual(series[58], { minute: current - 60, mints: 0, checkIns: 4, resales: 0 });
});

test("describeActivity speaks in the second person for the viewer, on either side of a resale", () => {
  const base = { id: "1", amount: "0", timestamp: "1", txHash: "0xabc", ticket: { tokenId: "7" } };
  assert.equal(describeActivity({ ...base, kind: "MINT", actor: ME }, ME), "You took the seat · seat 7");
  assert.equal(
    describeActivity({ ...base, kind: "MINT", actor: ME }, null),
    "0xa474…24A8 took the seat · seat 7",
  );
  assert.equal(
    describeActivity({ ...base, kind: "CHECKIN", actor: ME, counterparty: OTHER }, ME),
    "You walked in with seat 7",
  );
  assert.equal(
    describeActivity({ ...base, kind: "RESALE", actor: OTHER, counterparty: ME.toLowerCase() }, ME),
    "You took over seat 7 from 0x2d4f…8630",
  );
  assert.equal(
    describeActivity({ ...base, kind: "RESALE", actor: ME.toLowerCase(), counterparty: OTHER }, ME),
    "You handed seat 7 to 0x2d4f…8630",
  );
  assert.equal(kindLabel("DELIST"), "took it off the market");
  assert.equal(kindLabel("SOMETHING_NEW"), "something_new"); // an unknown kind still renders
});

test("summariseProvenance reads a seat's life oldest-first", () => {
  const row = (kind: string, timestamp: number) => ({
    id: `${kind}-${timestamp}`,
    kind,
    actor: ME,
    amount: "0",
    timestamp,
    txHash: "0x",
  });
  const s = summariseProvenance([
    row("MINT", 100),
    row("BIND", 110),
    row("LIST", 120),
    row("RESALE", 130),
    row("BIND", 140),
    row("CHECKIN", 150),
  ]);
  assert.deepEqual(s, { minted: 100, handovers: 1, checkedIn: 150, bound: true });
  assert.deepEqual(summariseProvenance([]), { minted: null, handovers: 0, checkedIn: null, bound: false });
  assert.equal(summariseProvenance([row("MINT", 1), row("BIND", 2), row("RESALE", 3)]).bound, false);
});
