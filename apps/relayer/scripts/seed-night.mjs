#!/usr/bin/env node
// Seeds a night with the activity a real one has, so the organiser's live board, the passport histories and
// the city pulse are not empty when the camera rolls: a crowd of fans buying free seats, a couple paying for
// booths, one resale, and check-ins arriving over a stretch of minutes. Everything goes through the relayer
// and the chain exactly as apps/web does it — the same dev identities (`?dev=night-3` opens fan 3's
// passport on a dev build), the same relayed calls, the same entry codes at the door.
//
// Re-runnable: fans who already hold a seat keep it, the resale happens once, and each run walks the next
// `--checkins` fans through the door — so a second run ten minutes later adds life instead of repeating.
//
//   node scripts/seed-night.mjs                        # newest event, 12 free fans, 2 paid, 1 resale, 6 check-ins over 10 min
//   node scripts/seed-night.mjs --event 0x…            # a specific event (address or index in /api/config)
//   node scripts/seed-night.mjs --fans 8 --paid 0 --checkins 3 --minutes 0    # quick local rehearsal
//   node scripts/seed-night.mjs --no-resale --prefix rehearsal
//   RELAYER_URL=https://turnstile.example GATE_TOKEN=… node scripts/seed-night.mjs --event 0x…
//   (--site <origin> for the links it prints when the site is not the relayer's origin)
//
// Paid seats and a priced resale need the relayer's testnet drip (0.1 MON per new account); without it the
// paid fans are skipped and the resale falls back to a free listing taken gaslessly.
import { erc2771ForwarderAbi, turnstileEventAbi } from "@turnstile/contracts/abi";
import { accountKeyFromPrf, doorKeyFromPrf, encodeEntryCode, entryTypedData } from "@turnstile/identity";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeFunctionData,
  formatEther,
  hexToBytes,
  http,
  keccak256,
  stringToBytes,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const args = parseArgs(process.argv.slice(2));
const RELAYER = (args.relayer ?? process.env.RELAYER_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const GATE_TOKEN = args["gate-token"] ?? process.env.GATE_TOKEN ?? "";
const SITE = (args.site ?? process.env.SITE_URL ?? RELAYER).replace(/\/$/, "");
const PREFIX = args.prefix ?? "night";
const FANS = Number(args.fans ?? 12);
const PAID = Number(args.paid ?? 2);
const CHECKINS = Number(args.checkins ?? 6);
const MINUTES = Number(args.minutes ?? 10);
const RESALE = args["no-resale"] !== "true";
const ZERO = "0x0000000000000000000000000000000000000000";

const started = performance.now();
const log = (label, detail = "") =>
  console.log(
    `${String(Math.round(performance.now() - started)).padStart(7)} ms  ${label.padEnd(9)}${detail ? ` ${detail}` : ""}`,
  );
const fail = (message, detail) => {
  console.error(`\n✗ ${message}`);
  if (detail !== undefined) console.error(JSON.stringify(detail, null, 2));
  process.exit(1);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, init) {
  const res = await fetch(`${RELAYER}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

// The relayer allows 30 relayed calls a minute per address; a crowd is bigger than that, so wait it out.
async function apiPatient(path, init) {
  for (let attempt = 0; ; attempt++) {
    const res = await api(path, init);
    if (res.status !== 429 || attempt >= 12) return res;
    log("busy", `relayer rate limit · waiting 10 s (${res.body?.error?.code ?? res.body?.code ?? 429})`);
    await sleep(10_000);
  }
}

// ---------------------------------------------------------------- 1. config → the night
const health = await api("/api/health");
if (health.status !== 200) fail(`relayer not healthy at ${RELAYER}`, health.body);
const { body: config } = await api("/api/config");
if (!Array.isArray(config.events) || config.events.length === 0)
  fail("relayer /api/config returned no events");

const event = pickEvent(config.events, args.event);
if (!event)
  fail(
    `no event matching "${args.event}"`,
    config.events.map((e) => `${e.eventId} ${e.address} ${e.name}`),
  );
const eventRef = { chainId: config.chainId, eventAddress: event.address };
const freeTier = event.tiers.find((t) => BigInt(t.priceWei) === 0n) ?? null;
const paidTier = event.tiers.find((t) => BigInt(t.priceWei) > 0n) ?? null;
if (!freeTier && !paidTier) fail("the event has no tiers");
log(
  "night",
  `${event.name} · event #${event.eventId} · ${event.address} · chain ${config.chainId}` +
    (freeTier ? ` · free: ${freeTier.name}` : "") +
    (paidTier ? ` · paid: ${paidTier.name} ${formatEther(BigInt(paidTier.priceWei))} MON` : "") +
    ` · drip ${config.drip?.enabled ? "on" : "off"}`,
);

const chain = defineChain({
  id: config.chainId,
  name: `chain-${config.chainId}`,
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [args.rpc ?? process.env.RPC_URL ?? config.rpcUrl] } },
});
const client = createPublicClient({ chain, transport: http() });
const read = (functionName, fnArgs) =>
  client.readContract({ address: event.address, abi: turnstileEventAbi, functionName, args: fnArgs });

// ---------------------------------------------------------------- 2. identities (the web app's dev mode)
function identity(seed) {
  // The KDFs consume (zeroize) their input, so derive a fresh PRF output for each namespace.
  const prf = () => hexToBytes(keccak256(stringToBytes(`turnstile-dev-prf:${seed}`)));
  const fan = privateKeyToAccount(toHex(accountKeyFromPrf(prf())));
  const door = privateKeyToAccount(toHex(doorKeyFromPrf(prf(), eventRef)));
  return { seed, fan, door, seatId: null };
}

// ---------------------------------------------------------------- 3. relayed and direct calls
const [, domainName, domainVersion] = await client.readContract({
  address: config.forwarder,
  abi: erc2771ForwarderAbi,
  functionName: "eip712Domain",
});
async function relay(kind, data, signer, settled = null) {
  const nonce = await client.readContract({
    address: config.forwarder,
    abi: erc2771ForwarderAbi,
    functionName: "nonces",
    args: [signer.address],
  });
  const deadline = Math.floor(Date.now() / 1000) + 600;
  const message = {
    from: signer.address,
    to: event.address,
    value: 0n,
    gas: BigInt(config.gas[kind]),
    nonce,
    deadline,
    data,
  };
  const signature = await signer.signTypedData({
    domain: {
      name: domainName,
      version: domainVersion,
      chainId: config.chainId,
      verifyingContract: config.forwarder,
    },
    types: {
      ForwardRequest: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "gas", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint48" },
        { name: "data", type: "bytes" },
      ],
    },
    primaryType: "ForwardRequest",
    message,
  });
  const res = await apiPatient("/api/relay", {
    method: "POST",
    body: JSON.stringify({
      request: {
        from: message.from,
        to: message.to,
        value: "0",
        gas: message.gas.toString(),
        nonce: nonce.toString(),
        deadline: String(deadline),
        data,
        signature,
      },
    }),
  });
  if (res.status === 200 && res.body.status === "success") return res.body;
  // A public testnet can outlive the relayer's 30 s receipt wait: the call returns 5xx and the transaction
  // lands anyway. Re-read the state the call was meant to change before calling it a failure.
  if (res.status >= 500 && settled && (await landed(settled))) {
    log("late", `${kind} for ${signer.address} landed after the relayer gave up`);
    return { hash: "(landed late)", blockNumber: "?", gasUsed: "?", status: "success" };
  }
  const error = new Error(`relayed ${kind} for ${signer.address} failed: ${JSON.stringify(res.body)}`);
  error.code = res.body?.error?.code ?? res.body?.code ?? String(res.status);
  throw error;
}

async function landed(settled) {
  for (let i = 0; i < 10; i++) {
    await sleep(3000);
    if (await settled()) return true;
  }
  return false;
}

const seatState = async (seatId) => (await read("seatStates", [BigInt(seatId), 1n]))[0];
const same = (a, b) => a.toLowerCase() === b.toLowerCase();

/** A paid call from the fan's own account (the web app's path for priced seats and priced listings). */
async function direct(functionName, fnArgs, fan, value) {
  const wallet = createWalletClient({ account: fan, chain, transport: http() });
  const hash = await wallet.writeContract({
    address: event.address,
    abi: turnstileEventAbi,
    functionName,
    args: fnArgs,
    value,
  });
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (receipt.status !== "success") throw new Error(`${functionName} from ${fan.address} reverted (${hash})`);
  return { hash, blockNumber: receipt.blockNumber.toString(), gasUsed: receipt.gasUsed.toString() };
}

/** Makes sure a fan can pay `value` plus gas; the relayer's drip funds brand-new testnet accounts. */
async function fund(fan, value) {
  const needed = value + 200_000n * 120_000_000_000n;
  let balance = await client.getBalance({ address: fan.address });
  if (balance >= needed) return true;
  if (!config.drip?.enabled) return false;
  const res = await apiPatient("/api/drip", { method: "POST", body: JSON.stringify({ to: fan.address }) });
  if (res.status !== 200) {
    log("drip", `refused for ${fan.address}: ${res.body?.error?.code ?? res.status}`);
    return false;
  }
  for (let i = 0; i < 30 && balance < needed; i++) {
    await sleep(600);
    balance = await client.getBalance({ address: fan.address });
  }
  return balance >= needed;
}

async function bind(who) {
  const bound = async () => same((await seatState(who.seatId)).doorKey, who.door.address);
  if (await bound()) return;
  const data = encodeFunctionData({
    abi: turnstileEventAbi,
    functionName: "bindDoorKey",
    args: [BigInt(who.seatId), who.door.address],
  });
  await relay("bindDoorKey", data, who.fan, bound);
}

/**
 * A fan who holds nothing here but has already acted (a relayed call, or a paid one from their own account)
 * sold their seat on an earlier run: leave them out instead of buying them another one.
 */
async function movedOn(fan) {
  const [relayed, own] = await Promise.all([
    client.readContract({
      address: config.forwarder,
      abi: erc2771ForwarderAbi,
      functionName: "nonces",
      args: [fan.address],
    }),
    client.getTransactionCount({ address: fan.address }),
  ]);
  return relayed > 0n || own > 0;
}

/** Buys `seatId` for `who`; if someone took it since the snapshot, moves to the next free seat in `seats`. */
async function buyFree(who, seatId, seats, tier) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const mine = async () => same((await seatState(seatId)).holder, who.fan.address);
    try {
      const res = await relay(
        "buy",
        encodeFunctionData({ abi: turnstileEventAbi, functionName: "buy", args: [BigInt(seatId)] }),
        who.fan,
        mine,
      );
      return { seatId, hash: res.hash };
    } catch (error) {
      if (error.code !== "SeatTaken") throw error;
      log("taken", `${tier.name} #${seatId} went to someone else · picking another`);
      const fresh = scatter(await tierStates(tier), 1).filter((id) => !seats.includes(id));
      const next = fresh[0] ?? seats.shift();
      if (next === undefined) throw error;
      seatId = next;
    }
  }
  throw new Error(`could not find a free ${tier.name} seat for ${who.seed}`);
}

// ---------------------------------------------------------------- 4. seats: scattered, front first
async function tierStates(tier) {
  const span = Math.min(Number(tier.seatCount), 96);
  const states = await read("seatStates", [BigInt(tier.firstSeat), BigInt(span)]);
  return states.map((s, i) => ({ id: Number(tier.firstSeat) + i, ...s }));
}

/** The seat a fan already holds in this tier, if any (a previous run, or the tour) — makes the run idempotent. */
function heldSeat(states, fan) {
  return states.find((s) => s.holder.toLowerCase() === fan.address.toLowerCase())?.id ?? null;
}

/** Free seats spread through the block instead of filling it from the left: a crowd, not a queue. */
function scatter(states, count) {
  const free = states.filter((s) => s.holder === ZERO).map((s) => s.id);
  if (count >= free.length) return free;
  const picks = new Set();
  for (let i = 0; picks.size < count && i < count * 3; i++) {
    const slot = i % count;
    const wobble = (i % 3) - 1;
    const at = Math.floor(((slot + 0.5) * free.length) / count) + wobble;
    picks.add(free[Math.min(free.length - 1, Math.max(0, at))]);
  }
  for (const id of free) {
    if (picks.size >= count) break;
    picks.add(id);
  }
  return [...picks];
}

/** The seat a fan holds anywhere in the event's first blocks, if any. */
async function seatOf(fan) {
  for (const tier of event.tiers) {
    const held = heldSeat(await tierStates(tier), fan);
    if (held !== null) return held;
  }
  return null;
}

// ---------------------------------------------------------------- 5. the crowd
const crowd = [];
if (freeTier && FANS > 0) {
  const states = await tierStates(freeTier);
  const fans = Array.from({ length: FANS }, (_, i) => identity(`${PREFIX}-${i + 1}`));
  const seats = scatter(states, fans.filter((f) => heldSeat(states, f.fan) === null).length);
  let bought = 0;
  for (const who of fans) {
    const held = heldSeat(states, who.fan);
    if (held !== null) {
      who.seatId = held;
      await bind(who);
      crowd.push(who);
      log("held", `${who.seed} · ${freeTier.name} #${held} · from an earlier run`);
      continue;
    }
    if (await movedOn(who.fan)) {
      log("moved on", `${who.seed} sold their seat on an earlier run · not re-seated`);
      continue;
    }
    const pick = seats.shift();
    if (pick === undefined) break;
    const { seatId, hash } = await buyFree(who, pick, seats, freeTier);
    who.seatId = seatId;
    await bind(who);
    crowd.push(who);
    bought++;
    log("seat", `${who.seed} · ${freeTier.name} #${seatId} · sponsored · ${hash}`);
    await sleep(MINUTES > 0 ? 1500 : 0);
  }
  log("crowd", `${crowd.length} fans hold ${freeTier.name} seats (${bought} bought this run)`);
}

const booths = [];
if (paidTier && PAID > 0) {
  const price = BigInt(paidTier.priceWei);
  const states = await tierStates(paidTier);
  const fans = Array.from({ length: PAID }, (_, i) => identity(`${PREFIX}-booth-${i + 1}`));
  const seats = scatter(states, fans.length);
  for (const who of fans) {
    const held = heldSeat(states, who.fan);
    if (held !== null) {
      who.seatId = held;
      await bind(who);
      booths.push(who);
      log("held", `${who.seed} · ${paidTier.name} #${held} · from an earlier run`);
      continue;
    }
    if (await movedOn(who.fan)) {
      log("moved on", `${who.seed} sold their booth on an earlier run · not re-seated`);
      continue;
    }
    let seatId = seats.shift();
    if (seatId === undefined) break;
    if (!(await fund(who.fan, price))) {
      log("skip", `${who.seed} · ${paidTier.name} needs ${formatEther(price)} MON and the drip refused`);
      continue;
    }
    if (!same((await seatState(seatId)).holder, ZERO)) {
      seatId = scatter(await tierStates(paidTier), 1)[0];
      if (seatId === undefined) break;
    }
    const res = await direct("buy", [BigInt(seatId)], who.fan, price);
    who.seatId = seatId;
    await bind(who);
    booths.push(who);
    log("seat", `${who.seed} · ${paidTier.name} #${seatId} · paid ${formatEther(price)} MON · ${res.hash}`);
    await sleep(MINUTES > 0 ? 1500 : 0);
  }
}

// ---------------------------------------------------------------- 6. one resale
// Priced when a booth exists and the taker can be funded (a handover with a price and a fee on the live
// board); otherwise a free listing taken gaslessly. The sale clears the seller's door key; the taker rebinds.
let handover = null;
if (RESALE) {
  const taker = identity(`${PREFIX}-taker`);
  const takerSeat = await seatOf(taker.fan);
  if (takerSeat !== null) {
    taker.seatId = takerSeat;
    await bind(taker);
    const first = paidTier ? Number(paidTier.firstSeat) : -1;
    const paidSeat =
      paidTier !== null && takerSeat >= first && takerSeat < first + Number(paidTier.seatCount);
    (paidSeat ? booths : crowd).push(taker);
    log("resale", `done on an earlier run · ${taker.seed} holds #${takerSeat}`);
  } else {
    let seller = booths[0] ?? crowd[0] ?? null;
    let ask = 0n;
    if (seller && booths[0]) {
      const cap = await read("resaleCapOf", [BigInt(seller.seatId)]);
      ask = (cap * 8n) / 10n;
      if (ask > 0n && !(await fund(taker.fan, ask))) {
        log("resale", `the taker cannot be funded for ${formatEther(ask)} MON · a free listing instead`);
        seller = crowd[0] ?? null;
        ask = 0n;
      }
    }
    const state = seller ? await seatState(seller.seatId) : null;
    if (!seller) log("resale", "nobody to sell — no seats were seeded");
    else if (state.checkedInAt !== 0n)
      log("resale", `${seller.seed}'s seat is already inside; nothing to sell`);
    else {
      if (!state.listed) {
        await relay(
          "list",
          encodeFunctionData({
            abi: turnstileEventAbi,
            functionName: "list",
            args: [BigInt(seller.seatId), ask],
          }),
          seller.fan,
          async () => (await seatState(seller.seatId)).listed,
        );
        log("listed", `${seller.seed} · #${seller.seatId} at ${formatEther(ask)} MON`);
        await sleep(MINUTES > 0 ? 4000 : 0);
      }
      const res =
        ask === 0n
          ? await relay(
              "buyListing",
              encodeFunctionData({
                abi: turnstileEventAbi,
                functionName: "buyListing",
                args: [BigInt(seller.seatId)],
              }),
              taker.fan,
              async () => same((await seatState(seller.seatId)).holder, taker.fan.address),
            )
          : await direct("buyListing", [BigInt(seller.seatId)], taker.fan, ask);
      taker.seatId = seller.seatId;
      await bind(taker);
      // The seat moved: the seller leaves the crowd, the taker takes the place.
      for (const list of [crowd, booths]) {
        const i = list.indexOf(seller);
        if (i >= 0) list.splice(i, 1, taker);
      }
      handover = { seller, taker, ask };
      log(
        "resale",
        `${seller.seed} → ${taker.seed} · #${seller.seatId} · ${formatEther(ask)} MON · ${res.hash}`,
      );
    }
  }
}

// ---------------------------------------------------------------- 7. the door, over a stretch of minutes
// Booths arrive early too, so the door's first minutes are not all one tier.
const everyone = [...crowd];
booths.forEach((booth, i) => {
  everyone.splice(Math.min(everyone.length, 1 + i * 4), 0, booth);
});
const auth = GATE_TOKEN ? { authorization: `Bearer ${GATE_TOKEN}` } : {};
let admitted = 0;
if (CHECKINS > 0 && everyone.length > 0) {
  // Whoever is still outside, in arrival order: a second run walks the next fans in, not the same ones.
  const outside = [];
  for (const who of everyone) {
    if ((await seatState(who.seatId)).checkedInAt === 0n) outside.push(who);
  }
  const queue = outside.slice(0, CHECKINS);
  if (queue.length === 0) log("door", `everyone seeded is already inside`);
  const gapMs = queue.length > 1 ? (MINUTES * 60_000) / (queue.length - 1) : 0;
  for (let i = 0; i < queue.length; i++) {
    const who = queue[i];
    const slot = BigInt(Math.floor(Date.now() / 30_000));
    const entry = { eventId: BigInt(event.eventId), tokenId: BigInt(who.seatId), slot };
    const code = encodeEntryCode({
      event: eventRef,
      message: entry,
      signature: await who.door.signTypedData(entryTypedData(eventRef, entry)),
    });
    const res = await apiPatient("/api/gate/check-in", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ code }),
    });
    if (res.status !== 200 || res.body.ok !== true) {
      if (res.status === 401) fail("the door needs its operator token (GATE_TOKEN)", res.body);
      const inside =
        res.status >= 500 && (await landed(async () => (await seatState(who.seatId)).checkedInAt !== 0n));
      if (!inside) {
        log(
          "refused",
          `${who.seed} · #${who.seatId} · ${res.body?.code ?? res.body?.error?.code ?? res.status}`,
        );
        continue;
      }
      log("late", `${who.seed} · #${who.seatId} · check-in landed after the gate gave up`);
    } else log("check-in", `${who.seed} · #${who.seatId} · ${res.body.hash} · ${res.body.gasUsed} gas`);
    admitted++;
    if (i < queue.length - 1 && gapMs > 0) {
      const jitter = 0.7 + Math.random() * 0.6;
      await sleep(Math.round(gapMs * jitter));
    }
  }
}

// ---------------------------------------------------------------- 8. the night as the chain sees it
const tally = { sold: 0, inside: 0, listed: 0 };
for (const tier of event.tiers) {
  const states = await read("seatStates", [BigInt(tier.firstSeat), BigInt(tier.seatCount)]);
  for (const s of states) {
    if (s.holder !== ZERO) tally.sold++;
    if (s.checkedInAt !== 0n) tally.inside++;
    if (s.listed) tally.listed++;
  }
}
console.log(
  `\n✓ ${event.name} seeded · ${tally.sold} sold · ${tally.inside} inside · ${tally.listed} listed` +
    ` · this run: ${crowd.length + booths.length} holders, ${handover ? "1 resale" : "no resale"}, ${admitted} admitted` +
    `\n  room     ${SITE}/e/${event.address}` +
    `\n  door     ${SITE}/gate/${event.address}` +
    `\n  passport ${SITE}/me?dev=${PREFIX}-1  (dev builds: any ${PREFIX}-<n>, ${PREFIX}-booth-<n>, ${PREFIX}-taker)`,
);

function pickEvent(events, wanted) {
  if (wanted === undefined) {
    // The newest night — the one just published for the capture.
    return [...events].sort((a, b) => Number(b.eventId) - Number(a.eventId))[0];
  }
  if (/^0x[0-9a-fA-F]{40}$/.test(wanted))
    return events.find((e) => e.address.toLowerCase() === wanted.toLowerCase());
  return events[Number(wanted)];
}

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
