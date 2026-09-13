#!/usr/bin/env node
// Live smoke test: drives the whole fan → gate flow against a running relayer and chain,
// exactly as apps/web does it, minus the browser. Uses the same dev identity derivation
// as the web app (`?dev=<seed>`), so a seat bought here shows up as "yours" in the UI.
//
//   node scripts/smoke.mjs                      # relayer http://127.0.0.1:8787, seed fan-1
//   node scripts/smoke.mjs --seed fan-2 --event 1 --seat 7
//   node scripts/smoke.mjs --no-gate            # stop after buy + bind (leaves a live ticket for the UI)
//   node scripts/smoke.mjs --no-resale          # skip the list / delist round trip
//   node scripts/smoke.mjs --leave-listed       # stop once listed (a resale seat on the map for the UI)
//   RELAYER_URL=https://turnstile.example node scripts/smoke.mjs --gate-token $GATE_TOKEN
//
// Steps: config → pick a free seat → relayed buy → relayed bindDoorKey → resale (over-cap ask refused,
// listed at 0, self-purchase refused, a second identity takes it gaslessly, door key cleared and rebound,
// the seller's old entry code is refused) → entry code → gate lookup → gate check-in → second check-in
// must fail with ALREADY_CHECKED_IN.
import { erc2771ForwarderAbi, turnstileEventAbi } from "@turnstile/contracts/abi";
import { accountKeyFromPrf, doorKeyFromPrf, encodeEntryCode, entryTypedData } from "@turnstile/identity";
import {
  createPublicClient,
  defineChain,
  encodeFunctionData,
  hexToBytes,
  http,
  keccak256,
  parseEventLogs,
  stringToBytes,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const args = parseArgs(process.argv.slice(2));
const RELAYER = (args.relayer ?? process.env.RELAYER_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const SEED = args.seed ?? "fan-1";
const GATE_TOKEN = args["gate-token"] ?? process.env.GATE_TOKEN ?? "";

const started = performance.now();
const log = (label, detail = "") =>
  console.log(
    `${String(Math.round(performance.now() - started)).padStart(6)} ms  ${label}${detail ? `  ${detail}` : ""}`,
  );

async function api(path, init) {
  const res = await fetch(`${RELAYER}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function expect(condition, message, detail) {
  if (condition) return;
  console.error(`\n✗ ${message}`);
  if (detail !== undefined) console.error(JSON.stringify(detail, null, 2));
  process.exit(1);
}

// ---------------------------------------------------------------- 1. config
const health = await api("/api/health");
expect(health.status === 200, `relayer not healthy at ${RELAYER}`, health.body);
const { body: config } = await api("/api/config");
expect(
  Array.isArray(config.events) && config.events.length > 0,
  "relayer /api/config returned no events",
  config,
);
log("config", `chain ${config.chainId} · ${config.events.length} events · relayer ${config.relayer}`);

const chain = defineChain({
  id: config.chainId,
  name: `chain-${config.chainId}`,
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [args.rpc ?? process.env.RPC_URL ?? config.rpcUrl] } },
});
const client = createPublicClient({ chain, transport: http() });

const event = config.events[Number(args.event ?? 0)];
expect(event, `no event at index ${args.event ?? 0}`, config.events);
const freeTiers = event.tiers.filter((t) => BigInt(t.priceWei) === 0n);
const tier = freeTiers[0] ?? event.tiers[0];
expect(
  BigInt(tier.priceWei) === 0n,
  "smoke test needs a free tier (paid seats are bought directly by the fan)",
  event.tiers,
);

// ---------------------------------------------------------------- 2. identity (same as apps/web dev mode)
// The KDFs consume (zeroize) their input, so derive a fresh PRF output for each namespace.
const prf = () => hexToBytes(keccak256(stringToBytes(`turnstile-dev-prf:${SEED}`)));
const fan = privateKeyToAccount(toHex(accountKeyFromPrf(prf())));
const eventRef = { chainId: config.chainId, eventAddress: event.address };
const door = privateKeyToAccount(toHex(doorKeyFromPrf(prf(), eventRef)));
log("identity", `seed ${SEED} · fan ${fan.address} · door ${door.address}`);

// ---------------------------------------------------------------- 3. pick a seat
let seatId = args.seat != null ? Number(args.seat) : null;
if (seatId == null) {
  const first = BigInt(tier.firstSeat);
  const states = await client.readContract({
    address: event.address,
    abi: turnstileEventAbi,
    functionName: "seatStates",
    args: [first, BigInt(Math.min(Number(tier.seatCount), 64))],
  });
  const free = states.findIndex((s) => s.holder === "0x0000000000000000000000000000000000000000");
  expect(free >= 0, `no free seat in the first 64 of tier "${tier.name}"`);
  seatId = Number(first) + free;
}
log("seat", `${event.name} · ${tier.name} #${seatId}`);

// ---------------------------------------------------------------- 4. relayed calls
const [, domainName, domainVersion] = await client.readContract({
  address: config.forwarder,
  abi: erc2771ForwarderAbi,
  functionName: "eip712Domain",
});
async function relay(kind, data, signer = fan) {
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
  return api("/api/relay", {
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
}

const buy = await relay(
  "buy",
  encodeFunctionData({ abi: turnstileEventAbi, functionName: "buy", args: [BigInt(seatId)] }),
);
expect(buy.status === 200 && buy.body.status === "success", "relayed buy failed", buy.body);
const receipt = await client.getTransactionReceipt({ hash: buy.body.hash });
const minted = parseEventLogs({ abi: turnstileEventAbi, eventName: "TicketMinted", logs: receipt.logs })[0];
expect(
  minted && Number(minted.args.tokenId) === seatId,
  "TicketMinted log missing or wrong seat",
  receipt.logs,
);
log(
  "buy",
  `sponsored · ${buy.body.hash} · block ${buy.body.blockNumber} · ${buy.body.gasUsed} gas · relayer ${buy.body.ms} ms`,
);

const bind = await relay(
  "bindDoorKey",
  encodeFunctionData({
    abi: turnstileEventAbi,
    functionName: "bindDoorKey",
    args: [BigInt(seatId), door.address],
  }),
);
expect(bind.status === 200 && bind.body.status === "success", "relayed bindDoorKey failed", bind.body);
log("bind", `door key bound · ${bind.body.hash} · ${bind.body.gasUsed} gas`);

// ---------------------------------------------------------------- 5. resale: list → a second passkey takes it
// Free tier: the cap is 0, so a 1-wei ask must be refused (PriceAboveCap) and a 0 ask must list. A free
// listing is relayable end to end — the taker never holds MON — and the sale clears the seller's door key.
let holder = fan; // whoever walks up to the gate at the end
let holderDoor = door;
if (!args["no-resale"]) {
  const seatState = async () =>
    (
      await client.readContract({
        address: event.address,
        abi: turnstileEventAbi,
        functionName: "seatStates",
        args: [BigInt(seatId), 1n],
      })
    )[0];
  const listData = (price) =>
    encodeFunctionData({ abi: turnstileEventAbi, functionName: "list", args: [BigInt(seatId), price] });
  const tooHigh = await relay("list", listData(1n));
  expect(
    tooHigh.status === 409 && tooHigh.body.error?.code === "PriceAboveCap",
    "a 1-wei ask on a free seat should be refused with PriceAboveCap",
    tooHigh.body,
  );
  const listed = await relay("list", listData(0n));
  expect(listed.status === 200 && listed.body.status === "success", "relayed list failed", listed.body);
  expect((await seatState()).listed === true, "seat should read as listed after list()");
  if (args["leave-listed"]) {
    console.log(
      `\n✓ bought, bound and listed · ${event.name} · ${tier.name} #${seatId} · fan ${fan.address} (left listed for the UI)`,
    );
    process.exit(0);
  }

  // The taker is a second dev identity (`?dev=<seed>-taker` in the UI).
  const takerPrf = () => hexToBytes(keccak256(stringToBytes(`turnstile-dev-prf:${SEED}-taker`)));
  const taker = privateKeyToAccount(toHex(accountKeyFromPrf(takerPrf())));
  const takerDoor = privateKeyToAccount(toHex(doorKeyFromPrf(takerPrf(), eventRef)));
  const selfBuy = await relay(
    "buyListing",
    encodeFunctionData({ abi: turnstileEventAbi, functionName: "buyListing", args: [BigInt(seatId)] }),
  );
  expect(
    selfBuy.status === 409 && selfBuy.body.error?.code === "SelfPurchase",
    "the seller taking their own listing should be refused with SelfPurchase",
    selfBuy.body,
  );
  const taken = await relay(
    "buyListing",
    encodeFunctionData({ abi: turnstileEventAbi, functionName: "buyListing", args: [BigInt(seatId)] }),
    taker,
  );
  expect(taken.status === 200 && taken.body.status === "success", "relayed buyListing failed", taken.body);
  const after = await seatState();
  expect(
    after.holder.toLowerCase() === taker.address.toLowerCase() && !after.listed,
    "seat should belong to the taker and no longer be listed",
    after,
  );
  expect(
    after.doorKey === "0x0000000000000000000000000000000000000000",
    "the sale must clear the seller's door key",
    after,
  );
  const rebound = await relay(
    "bindDoorKey",
    encodeFunctionData({
      abi: turnstileEventAbi,
      functionName: "bindDoorKey",
      args: [BigInt(seatId), takerDoor.address],
    }),
    taker,
  );
  expect(
    rebound.status === 200 && rebound.body.status === "success",
    "taker's bindDoorKey failed",
    rebound.body,
  );

  // The seller's phone still derives the old door key; its code must be dead at the door.
  const staleSlot = BigInt(Math.floor(Date.now() / 30_000));
  const staleEntry = { eventId: BigInt(event.eventId), tokenId: BigInt(seatId), slot: staleSlot };
  const staleCode = encodeEntryCode({
    event: eventRef,
    message: staleEntry,
    signature: await door.signTypedData(entryTypedData(eventRef, staleEntry)),
  });
  const stale = await api(`/api/gate/lookup?code=${encodeURIComponent(staleCode)}`);
  expect(
    stale.status === 409 && stale.body.code === "BAD_SIGNATURE",
    "the seller's old entry code should be refused with BAD_SIGNATURE",
    stale.body,
  );
  log(
    "resale",
    `over-cap ask refused · listed (${listed.body.gasUsed} gas) · self-buy refused · taken by ${taker.address} (${taken.body.gasUsed} gas, sponsored) · rebound · seller's code dead`,
  );
  holder = taker;
  holderDoor = takerDoor;
}

if (args["no-gate"]) {
  console.log(
    `\n✓ bought and bound · ${event.name} · ${tier.name} #${seatId} · fan ${fan.address} (gate skipped)`,
  );
  process.exit(0);
}

// ---------------------------------------------------------------- 6. entry code → gate
const slot = BigInt(Math.floor(Date.now() / 30_000));
const entry = { eventId: BigInt(event.eventId), tokenId: BigInt(seatId), slot };
const signature = await holderDoor.signTypedData(entryTypedData(eventRef, entry));
const code = encodeEntryCode({ event: eventRef, message: entry, signature });
log("code", `${code.length} chars · slot ${slot}`);

const lookup = await api(`/api/gate/lookup?code=${encodeURIComponent(code)}`);
expect(lookup.status === 200 && lookup.body.ok === true, "gate lookup rejected a fresh code", lookup.body);
expect(
  lookup.body.holder?.toLowerCase() === holder.address.toLowerCase(),
  "gate lookup returned the wrong holder",
  lookup.body,
);
log(
  "lookup",
  `ok · ${lookup.body.eventName} · ${lookup.body.tier?.name} #${lookup.body.tokenId} · holder ${lookup.body.holder}`,
);

const auth = GATE_TOKEN ? { authorization: `Bearer ${GATE_TOKEN}` } : {};
const checkIn = await api("/api/gate/check-in", {
  method: "POST",
  headers: auth,
  body: JSON.stringify({ code }),
});
expect(checkIn.status === 200 && checkIn.body.ok === true, "gate check-in failed", checkIn.body);
log(
  "check-in",
  `admitted · ${checkIn.body.hash} · ${checkIn.body.gasUsed} gas · relayer ${checkIn.body.ms} ms`,
);

const again = await api("/api/gate/check-in", {
  method: "POST",
  headers: auth,
  body: JSON.stringify({ code }),
});
expect(
  again.status === 409 && again.body.code === "ALREADY_CHECKED_IN",
  "second check-in should be refused",
  again.body,
);
log("replay", `refused · ${again.body.code}`);

const onChain = await client.readContract({
  address: event.address,
  abi: turnstileEventAbi,
  functionName: "seatStates",
  args: [BigInt(seatId), 1n],
});
expect(onChain[0].checkedInAt !== 0n, "seat not marked checked-in on chain", onChain[0]);
console.log(
  `\n✓ smoke passed · ${event.name} · ${tier.name} #${seatId} · bought by ${fan.address}${
    holder === fan ? "" : ` · passed on to ${holder.address}`
  } · checked in`,
);

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
