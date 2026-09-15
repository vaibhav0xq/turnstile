import assert from "node:assert/strict";
import test from "node:test";
import type { Address } from "viem";
import { DAY_MS, HOUR_MS, isDenial, SpendGuard, type SpendLimits } from "../src/spend-guard.ts";

const RELAYER = "0x1000000000000000000000000000000000000001" as Address;
const GATE = "0x2000000000000000000000000000000000000002" as Address;
const FAN = "0x90F79bf6EB2c4f870365E785982E1f101E93b906";
const OTHER = "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65";
const MON = 10n ** 18n;

const limits: SpendLimits = {
  hourly: { relay: 3, drip: 2, gate: 5 },
  daily: { relay: 5, drip: 3, gate: 10 },
  perAddressDaily: { relay: 2, drip: 1 },
};

function guard(
  overrides: { relayer?: bigint; gate?: bigint; cost?: bigint; fail?: boolean; limits?: SpendLimits } = {},
) {
  const balances = { [RELAYER]: overrides.relayer ?? 10n * MON, [GATE]: overrides.gate ?? 10n * MON };
  let now = 1_000_000;
  let reads = 0;
  const instance = new SpendGuard({
    limits: overrides.limits ?? limits,
    wallets: {
      relayer: { address: RELAYER, reserveWei: 1n * MON },
      gate: { address: GATE, reserveWei: MON / 5n },
    },
    estimateCostWei: () => overrides.cost ?? MON / 10n,
    getBalance: async (address) => {
      reads++;
      if (overrides.fail) throw new Error("rpc down");
      return balances[address] as bigint;
    },
    balanceTtlMs: 5_000,
    now: () => now,
  });
  return {
    guard: instance,
    balances,
    advance: (ms: number) => {
      now += ms;
    },
    reads: () => reads,
  };
}

async function charged(g: SpendGuard, action: "relay" | "drip" | "gate", address?: string) {
  const result = await g.charge(action, address);
  assert.ok(!isDenial(result), `expected a charge, got ${JSON.stringify(result)}`);
  return result;
}

test("admits and charges within every limit", async () => {
  const { guard: g } = guard();
  assert.equal(await g.admit("relay", FAN), null);
  const charge = await charged(g, "relay", FAN);
  charge.settle(MON / 100n);
  const status = await g.status();
  assert.equal(status.budgets.relay.hour.used, 1);
  assert.equal(status.budgets.relay.day.used, 1);
  assert.equal(status.spentWei.hour, MON / 100n);
  assert.equal(status.paused, false);
});

test("reserve floor pauses sponsorship before the wallet is drained", async () => {
  // 1.25 MON with a 1 MON floor and 0.1 MON per action: two more actions fit, the third would breach.
  const { guard: g } = guard({ relayer: MON + MON / 4n });
  const first = await charged(g, "relay", FAN);
  const second = await charged(g, "relay", OTHER);
  const denied = await g.admit("relay", FAN);
  assert.equal(denied?.code, "SPONSOR_PAUSED");
  assert.equal(denied?.status, 503);
  if (denied?.code === "SPONSOR_PAUSED") assert.equal(denied.wallet, "relayer");
  // Settling in-flight work frees the estimate again (the balance re-read still says 1.25 MON).
  first.settle(MON / 100n);
  second.settle(MON / 100n);
  assert.equal(await g.admit("relay", FAN), null);
});

test("a wallet already at its reserve stops at once, and drip shares the relayer's floor", async () => {
  const { guard: g } = guard({ relayer: MON / 2n });
  assert.equal((await g.admit("relay", FAN))?.code, "SPONSOR_PAUSED");
  assert.equal((await g.admit("drip", FAN))?.code, "SPONSOR_PAUSED");
  // The gate wallet is separate and still fine.
  assert.equal(await g.admit("gate"), null);
  const status = await g.status();
  assert.equal(status.paused, true);
  assert.equal(status.wallets.relayer.ok, false);
  assert.equal(status.wallets.gate.ok, true);
});

test("the gate has its own floor", async () => {
  const { guard: g } = guard({ gate: MON / 10n });
  const denied = await g.admit("gate");
  assert.equal(denied?.code, "SPONSOR_PAUSED");
  if (denied?.code === "SPONSOR_PAUSED") assert.equal(denied.wallet, "gate");
  assert.match(denied?.message ?? "", /door is paused/);
  assert.equal(await g.admit("relay", FAN), null);
});

test("an unreadable balance pauses rather than sponsors blind", async () => {
  const { guard: g } = guard({ fail: true });
  const denied = await g.admit("relay", FAN);
  assert.equal(denied?.code, "SPONSOR_PAUSED");
  const status = await g.status();
  assert.equal(status.wallets.relayer.balanceWei, null);
  assert.equal(status.paused, true);
});

test("hourly budget exhausts per action class and recovers as the window slides", async () => {
  const { guard: g, advance } = guard();
  const addresses = [FAN, OTHER, "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"];
  for (const address of addresses) (await charged(g, "relay", address)).settle();
  const denied = await g.admit("relay", "0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
  assert.equal(denied?.code, "BUDGET_EXHAUSTED");
  assert.equal(denied?.status, 429);
  if (denied?.code === "BUDGET_EXHAUSTED") assert.equal(denied.window, "hour");
  assert.equal(denied?.retryAfterSec, HOUR_MS / 1000);
  // Other classes are untouched.
  assert.equal(await g.admit("drip", FAN), null);
  assert.equal(await g.admit("gate"), null);
  advance(HOUR_MS + 1);
  assert.equal(await g.admit("relay", FAN), null);
});

test("daily budget holds even when the hourly window has cleared", async () => {
  const { guard: g, advance } = guard();
  const fans = [
    FAN,
    OTHER,
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
  ];
  for (const [index, fan] of fans.entries()) {
    if (index === 3) advance(HOUR_MS + 1);
    (await charged(g, "relay", fan)).settle();
  }
  const denied = await g.admit("relay", "0x976EA74026E726554dB657fA54763abd0C3a0aa9");
  assert.equal(denied?.code, "BUDGET_EXHAUSTED");
  if (denied?.code === "BUDGET_EXHAUSTED") assert.equal(denied.window, "day");
  advance(DAY_MS);
  assert.equal(await g.admit("relay", FAN), null);
});

test("per-address daily quota: one account cannot eat the class budget", async () => {
  const { guard: g, advance } = guard();
  (await charged(g, "relay", FAN)).settle();
  (await charged(g, "relay", FAN.toLowerCase())).settle(); // case-insensitive key
  const denied = await g.admit("relay", FAN);
  assert.equal(denied?.code, "QUOTA_EXCEEDED");
  assert.equal(denied?.status, 429);
  // A different account is still served; the class budget (3/hour) has room for one more.
  assert.equal(await g.admit("relay", OTHER), null);
  advance(DAY_MS + 1);
  assert.equal(await g.admit("relay", FAN), null);
});

test("drip quota is per recipient per day", async () => {
  const { guard: g } = guard();
  (await charged(g, "drip", FAN)).settle();
  const denied = await g.admit("drip", FAN);
  assert.equal(denied?.code, "QUOTA_EXCEEDED");
  assert.match(denied?.message ?? "", /testnet drip/);
  assert.equal(await g.admit("drip", OTHER), null);
});

test("charge re-checks: concurrent admissions cannot overshoot the budget", async () => {
  const { guard: g } = guard();
  const fans = [
    FAN,
    OTHER,
    "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  ];
  // All four pass the door…
  for (const fan of fans) assert.equal(await g.admit("relay", fan), null);
  // …but only three charges go through (hourly limit 3).
  const results = await Promise.all(fans.map((fan) => g.charge("relay", fan)));
  const denials = results.filter(isDenial);
  assert.equal(denials.length, 1);
  assert.equal(denials[0]?.code, "BUDGET_EXHAUSTED");
});

test("settle is idempotent and counts spend once", async () => {
  const { guard: g } = guard();
  const charge = await charged(g, "gate");
  charge.settle(MON / 50n);
  charge.settle(MON / 50n);
  const status = await g.status();
  assert.equal(status.wallets.gate.inflight, 0);
  assert.equal(status.spentWei.day, MON / 50n);
});

test("balance reads are cached and invalidated by a settled send", async () => {
  const { guard: g, reads, advance } = guard();
  await g.admit("relay", FAN);
  await g.admit("relay", OTHER);
  assert.equal(reads(), 1);
  advance(5_001);
  await g.admit("relay", FAN);
  assert.equal(reads(), 2);
  const charge = await charged(g, "relay", FAN);
  charge.settle();
  await g.admit("relay", OTHER);
  assert.equal(reads(), 3);
});
