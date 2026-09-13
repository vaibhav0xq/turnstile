// Talks to apps/relayer: sponsored (ERC-2771) calls, the gate, and the testnet drip.
import { erc2771ForwarderAbi, turnstileEventAbi } from "@turnstile/contracts/abi";
import { type Address, createWalletClient, encodeFunctionData, type Hex, http, parseEventLogs } from "viem";
import { chainFor, publicClientFor } from "../chain/client";
import type { AppConfig, EventInfo } from "../chain/config";
import type { FanSession } from "../identity/store";
import { ApiError, api } from "../lib/api";

export interface RelayReceipt {
  hash: Hex;
  blockNumber: string;
  status: "success" | "reverted";
  gasUsed: string;
  ms: number;
}

export type RelayKind = "buy" | "buyListing" | "bindDoorKey" | "list" | "delist";

const FORWARD_REQUEST_TYPES = {
  ForwardRequest: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "gas", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint48" },
    { name: "data", type: "bytes" },
  ],
} as const;

let domainCache: { key: string; name: string; version: string } | null = null;

async function forwarderDomain(config: AppConfig) {
  const key = `${config.chainId}:${config.forwarder}`;
  if (domainCache?.key === key) return domainCache;
  const client = publicClientFor(config);
  const [, name, version] = await client.readContract({
    address: config.forwarder,
    abi: erc2771ForwarderAbi,
    functionName: "eip712Domain",
  });
  domainCache = { key, name, version };
  return domainCache;
}

/** Signs a ForwardRequest for `data` against `event` with the fan's session key and hands it to the relayer. */
export async function relay(
  config: AppConfig,
  fan: FanSession,
  event: EventInfo,
  kind: RelayKind,
  data: Hex,
): Promise<RelayReceipt> {
  const client = publicClientFor(config);
  const [nonce, domain] = await Promise.all([
    client.readContract({
      address: config.forwarder,
      abi: erc2771ForwarderAbi,
      functionName: "nonces",
      args: [fan.address],
    }),
    forwarderDomain(config),
  ]);
  const deadline = Math.floor(Date.now() / 1000) + 10 * 60;
  const message = {
    from: fan.address,
    to: event.address,
    value: 0n,
    gas: BigInt(config.gas[kind]),
    nonce,
    deadline,
    data,
  };
  const signature = await fan.account.signTypedData({
    domain: {
      name: domain.name,
      version: domain.version,
      chainId: config.chainId,
      verifyingContract: config.forwarder,
    },
    types: FORWARD_REQUEST_TYPES,
    primaryType: "ForwardRequest",
    message,
  });
  return api<RelayReceipt>("/api/relay", {
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

export function buyData(seatId: number): Hex {
  return encodeFunctionData({ abi: turnstileEventAbi, functionName: "buy", args: [BigInt(seatId)] });
}

/** Free listings are relayable (value 0); priced ones go through buyListingDirect. */
export function buyListingData(seatId: number): Hex {
  return encodeFunctionData({ abi: turnstileEventAbi, functionName: "buyListing", args: [BigInt(seatId)] });
}

export function bindData(tokenId: number, doorKey: Address): Hex {
  return encodeFunctionData({
    abi: turnstileEventAbi,
    functionName: "bindDoorKey",
    args: [BigInt(tokenId), doorKey],
  });
}

export function listData(tokenId: number, priceWei: bigint): Hex {
  return encodeFunctionData({
    abi: turnstileEventAbi,
    functionName: "list",
    args: [BigInt(tokenId), priceWei],
  });
}

export function delistData(tokenId: number): Hex {
  return encodeFunctionData({ abi: turnstileEventAbi, functionName: "delist", args: [BigInt(tokenId)] });
}

/** Paid seats: the fan's own account pays, straight to the chain (the relayer never fronts MON). */
export async function buyDirect(
  config: AppConfig,
  fan: FanSession,
  event: EventInfo,
  seatId: number,
  priceWei: bigint,
): Promise<RelayReceipt> {
  const started = performance.now();
  const chain = chainFor(config);
  const wallet = createWalletClient({ account: fan.account, chain, transport: http(config.rpcUrl) });
  const client = publicClientFor(config);
  const hash = await wallet.writeContract({
    address: event.address,
    abi: turnstileEventAbi,
    functionName: "buy",
    args: [BigInt(seatId)],
    value: priceWei,
    gas: 200_000n,
  });
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
  return {
    hash,
    blockNumber: receipt.blockNumber.toString(),
    status: receipt.status,
    gasUsed: receipt.gasUsed.toString(),
    ms: Math.round(performance.now() - started),
  };
}

export async function buyListingDirect(
  config: AppConfig,
  fan: FanSession,
  event: EventInfo,
  tokenId: number,
  priceWei: bigint,
): Promise<RelayReceipt> {
  const started = performance.now();
  const chain = chainFor(config);
  const wallet = createWalletClient({ account: fan.account, chain, transport: http(config.rpcUrl) });
  const client = publicClientFor(config);
  const hash = await wallet.writeContract({
    address: event.address,
    abi: turnstileEventAbi,
    functionName: "buyListing",
    args: [BigInt(tokenId)],
    value: priceWei,
    gas: 240_000n,
  });
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
  return {
    hash,
    blockNumber: receipt.blockNumber.toString(),
    status: receipt.status,
    gasUsed: receipt.gasUsed.toString(),
    ms: Math.round(performance.now() - started),
  };
}

export async function mintedTokenId(config: AppConfig, hash: Hex): Promise<number | null> {
  const client = publicClientFor(config);
  const receipt = await client.getTransactionReceipt({ hash });
  const logs = parseEventLogs({ abi: turnstileEventAbi, eventName: "TicketMinted", logs: receipt.logs });
  const first = logs[0];
  return first ? Number(first.args.tokenId) : null;
}

export async function balanceOf(config: AppConfig, address: Address): Promise<bigint> {
  return publicClientFor(config).getBalance({ address });
}

export interface DripResult {
  hash: Hex;
  amountWei: string;
}

export function drip(to: Address): Promise<DripResult> {
  return api<DripResult>("/api/drip", { method: "POST", body: JSON.stringify({ to }) });
}

export interface GateResult {
  ok: boolean;
  code?: string;
  message?: string;
  hash?: Hex;
  blockNumber?: string;
  gasUsed?: string;
  ms?: number;
  tokenId?: string;
  eventAddress?: Address;
  eventName?: string;
  holder?: Address;
  tier?: { index: number; name: string };
  slot?: string;
  checkedInAt?: string;
}

export function gateLookup(code: string): Promise<GateResult> {
  return api<GateResult>(`/api/gate/lookup?code=${encodeURIComponent(code)}`);
}

export function gateCheckIn(code: string, token?: string): Promise<GateResult> {
  return api<GateResult>("/api/gate/check-in", {
    method: "POST",
    body: JSON.stringify({ code }),
    ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
  });
}

// The private passport (identity SPEC §4.6): ciphertext parked with the relayer, written with the account key.
export interface PassportRecord {
  blob: string;
  issuedAt: number;
  updatedAt: number;
}

export async function getPassport(address: Address): Promise<PassportRecord | null> {
  try {
    return await api<PassportRecord>(`/api/passport/${address}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export function putPassport(
  address: Address,
  body: { blob: string; issuedAt: number; signature: Hex },
): Promise<{ ok: true; updatedAt: number; cleared: boolean }> {
  return api(`/api/passport/${address}`, { method: "PUT", body: JSON.stringify(body) });
}
