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
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

type Deployment = { chainId: number; factory: Address; forwarder: Address; implementation: Address };

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

const appDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const rpcUrl = required("RPC_URL");
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
  rpcUrls: { default: { http: [rpcUrl] } },
  ...(chainId === 31337 ? {} : { contracts: { multicall3: { address: MULTICALL3 } } }),
});
// Monad seals a block every 400 ms; viem's default 4 s receipt polling would make every
// sponsored action feel ten times slower than the chain actually is.
const pollingInterval = 400;
// Public Monad RPCs allow ~15 requests a second and loading one event is ~20 reads, so reads issued
// together are folded into one Multicall3 `aggregate3` and remaining requests share an HTTP round trip.
export const publicClient = createPublicClient({
  chain,
  transport: http(rpcUrl, { batch: true }),
  batch: { multicall: true },
  pollingInterval,
});
export const relayerAccount = privateKeyToAccount(key("RELAYER_PRIVATE_KEY"));
export const gateAccount = privateKeyToAccount(key("GATE_SIGNER_PRIVATE_KEY"));
export const relayerWallet = createWalletClient({
  account: relayerAccount,
  chain,
  transport: http(rpcUrl),
  pollingInterval,
});
export const gateWallet = createWalletClient({
  account: gateAccount,
  chain,
  transport: http(rpcUrl),
  pollingInterval,
});

export const settings = {
  publicRpcUrl: process.env["PUBLIC_RPC_URL"] || rpcUrl,
  explorer: process.env["EXPLORER_URL"] || null,
  /** Shown in the web app's header (e.g. `staging`) so a rehearsal origin is never mistaken for the real one. */
  environmentLabel: process.env["ENVIRONMENT_LABEL"]?.trim() || null,
  /** Public origin for absolute URLs in ticket metadata; unset = taken from each request (proxy headers first). */
  publicOrigin: process.env["PUBLIC_ORIGIN"]?.replace(/\/+$/, "") || null,
  gateToken: process.env["GATE_TOKEN"] || null,
  dripEnabled: process.env["DRIP_ENABLED"] === "1",
  dripAmount: BigInt(process.env["DRIP_AMOUNT_WEI"] || "100000000000000000"),
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
