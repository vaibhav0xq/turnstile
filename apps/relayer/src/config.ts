import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { canonicalHostPolicy } from "./canonical-host.ts";
import { parseUrlList, planRpc, transportFor } from "./rpc.ts";

type Deployment = { chainId: number; factory: Address; forwarder: Address; implementation: Address };

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

/** Optional non-negative integer setting; a malformed value is a startup error, not a silent default. */
function integer(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
  return value;
}

/** Optional wei amount (decimal string). */
function wei(name: string, fallback: bigint): bigint {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  if (!/^[0-9]+$/.test(raw)) throw new Error(`${name} must be a decimal wei amount`);
  return BigInt(raw);
}

const appDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const rpcUrl = required("RPC_URL");
/** Primary RPC plus optional fallbacks (`RPC_FALLBACK_URLS`, comma-separated); sends stay on the primary. */
export const rpc = planRpc(rpcUrl, parseUrlList(process.env["RPC_FALLBACK_URLS"]));
export const chainId = Number(process.env["CHAIN_ID"] ?? 0);
if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error("CHAIN_ID must be a positive integer");
const deploymentPath =
  process.env["DEPLOYMENTS_FILE"] || resolve(appDir, `../../packages/contracts/deployments/${chainId}.json`);
let rawDeployment: unknown;
try {
  rawDeployment = JSON.parse(readFileSync(deploymentPath, "utf8"));
} catch (error) {
  throw new Error(`Cannot read deployments file ${deploymentPath}`, { cause: error });
}
const candidate = rawDeployment as Partial<Deployment>;
if (
  candidate.chainId !== chainId ||
  !candidate.factory ||
  !candidate.forwarder ||
  !candidate.implementation
) {
  throw new Error(`Deployments file does not match chain ${chainId}`);
}
export const deployment: Deployment = {
  chainId,
  factory: getAddress(candidate.factory),
  forwarder: getAddress(candidate.forwarder),
  implementation: getAddress(candidate.implementation),
};

function key(name: string): Hex {
  const value = required(name);
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${name} must be a 32-byte hex private key`);
  return value as Hex;
}

/** Multicall3 at its canonical address on Monad (testnet and mainnet); anvil has none, viem falls back to plain calls. */
export const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;
export const chain = defineChain({
  id: chainId,
  name: chainId === 31337 ? "Anvil" : chainId === 10143 ? "Monad Testnet" : "Monad",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl, ...rpc.fallbacks] } },
  ...(chainId === 31337 ? {} : { contracts: { multicall3: { address: MULTICALL3 } } }),
});
// Monad seals a block every 400 ms; viem's default 4 s receipt polling would make every
// sponsored action feel ten times slower than the chain actually is.
const pollingInterval = 400;
// Public Monad RPCs allow ~15 requests a second and loading one event is ~20 reads, so reads issued
// together are folded into one Multicall3 `aggregate3` and remaining requests share an HTTP round trip.
export const publicClient = createPublicClient({
  chain,
  transport: transportFor(rpc, { batch: true }),
  batch: { multicall: true },
  pollingInterval,
});
export const relayerAccount = privateKeyToAccount(key("RELAYER_PRIVATE_KEY"));
export const gateAccount = privateKeyToAccount(key("GATE_SIGNER_PRIVATE_KEY"));
export const relayerWallet = createWalletClient({
  account: relayerAccount,
  chain,
  transport: transportFor(rpc),
  pollingInterval,
});
export const gateWallet = createWalletClient({
  account: gateAccount,
  chain,
  transport: transportFor(rpc),
  pollingInterval,
});

const publicOrigin = process.env["PUBLIC_ORIGIN"]?.replace(/\/+$/, "") || null;
/** Browser-side RPC plan (`PUBLIC_RPC_URL` + `PUBLIC_RPC_FALLBACK_URLS`); the browser only reads, so any public RPC will do. */
const publicRpc = planRpc(
  process.env["PUBLIC_RPC_URL"] || rpcUrl,
  parseUrlList(process.env["PUBLIC_RPC_FALLBACK_URLS"]),
);
export const settings = {
  publicRpcUrl: publicRpc.primary,
  publicRpcFallbackUrls: publicRpc.fallbacks,
  publicRpcProvider: publicRpc.provider,
  explorer: process.env["EXPLORER_URL"] || null,
  /** Shown in the web app's header (e.g. `staging`) so a rehearsal origin is never mistaken for the real one. */
  environmentLabel: process.env["ENVIRONMENT_LABEL"]?.trim() || null,
  /** Public origin for absolute URLs in ticket metadata; unset = taken from each request (proxy headers first). */
  publicOrigin,
  /** Alias hosts (`www.<apex>` + `REDIRECT_HOSTS`) answered with a redirect to the public origin; null without one. */
  canonicalHost: canonicalHostPolicy(publicOrigin, process.env["REDIRECT_HOSTS"]),
  gateToken: process.env["GATE_TOKEN"] || null,
  dripEnabled: process.env["DRIP_ENABLED"] === "1",
  dripAmount: BigInt(process.env["DRIP_AMOUNT_WEI"] || "100000000000000000"),
  /**
   * `X-Forwarded-For` entries written by proxies we trust (rightmost first). 1 = one proxy in front of the
   * process (Replit's ingress); 0 = reached directly, use the socket address. Client-sent entries never count.
   */
  trustedProxyHops: integer("TRUSTED_PROXY_HOPS", 1),
  /** Spend safety: reserve floors per wallet and rolling budgets per action class (spend-guard.ts). */
  spend: {
    relayerReserveWei: wei("RELAYER_RESERVE_WEI", 10n ** 18n),
    gateReserveWei: wei("GATE_RESERVE_WEI", 2n * 10n ** 17n),
    limits: {
      hourly: {
        relay: integer("RELAY_HOURLY_LIMIT", 60),
        drip: integer("DRIP_HOURLY_LIMIT", 10),
        gate: integer("GATE_HOURLY_LIMIT", 300),
      },
      daily: {
        relay: integer("RELAY_DAILY_LIMIT", 300),
        drip: integer("DRIP_DAILY_LIMIT", 40),
        gate: integer("GATE_DAILY_LIMIT", 2000),
      },
      perAddressDaily: {
        relay: integer("RELAY_DAILY_PER_ADDRESS", 24),
        drip: integer("DRIP_DAILY_PER_ADDRESS", 2),
      },
    },
    /** Transactions queued or running per wallet before new ones are refused with `BUSY`. */
    queueMax: integer("TX_QUEUE_MAX", 8),
    /** Longest a transaction may wait for its turn before it is refused instead of sent. */
    queueMaxWaitMs: integer("TX_QUEUE_MAX_WAIT_MS", 20_000),
  },
  corsOrigins: (process.env["CORS_ORIGIN"] || "*").split(",").map((x) => x.trim()),
  port: Number(process.env["PORT"] || "8787"),
  /** Optional: serve the built web app (apps/web/dist) from this process, so one deployment is enough. */
  staticDir: process.env["STATIC_DIR"] ? resolve(process.cwd(), process.env["STATIC_DIR"]) : null,
  /** Postgres for the passport store; unset = the JSON file below. */
  databaseUrl: process.env["DATABASE_URL"] || null,
  /** Where encrypted passports live without Postgres (identity SPEC §4.6). `PASSPORT_FILE=` keeps them in memory. */
  passportFile:
    process.env["PASSPORT_FILE"] === undefined
      ? resolve(appDir, `.data/passports-${chainId}.json`)
      : process.env["PASSPORT_FILE"]
        ? resolve(process.cwd(), process.env["PASSPORT_FILE"])
        : null,
};

export async function verifyChain(): Promise<void> {
  const actual = await publicClient.getChainId();
  if (actual !== chainId)
    throw new Error(`RPC chain id ${actual} does not match configured CHAIN_ID ${chainId}`);
}
