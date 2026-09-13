import { type Chain, createPublicClient, defineChain, http, type PublicClient } from "viem";
import type { AppConfig } from "./config";

const cache = new Map<string, { chain: Chain; client: PublicClient }>();
/** Multicall3 at its canonical address on Monad (testnet and mainnet); anvil has none, viem falls back to plain calls. */
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

export function chainFor(config: Pick<AppConfig, "chainId" | "rpcUrl" | "explorer">): Chain {
  return defineChain({
    id: config.chainId,
    name: config.chainId === 10143 ? "Monad Testnet" : config.chainId === 143 ? "Monad" : "Anvil",
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
    ...(config.explorer ? { blockExplorers: { default: { name: "Explorer", url: config.explorer } } } : {}),
    ...(config.chainId === 31337 ? {} : { contracts: { multicall3: { address: MULTICALL3 } } }),
    testnet: config.chainId !== 143,
  });
}

export function publicClientFor(config: Pick<AppConfig, "chainId" | "rpcUrl" | "explorer">): PublicClient {
  const key = `${config.chainId}:${config.rpcUrl}`;
  const hit = cache.get(key);
  if (hit) return hit.client;
  const chain = chainFor(config);
  // 400 ms blocks on Monad: poll receipts at block pace instead of viem's 4 s default. Public Monad RPCs
  // allow ~15 requests a second, so reads issued together become one Multicall3 call.
  const client = createPublicClient({
    chain,
    transport: http(config.rpcUrl, { batch: true }),
    batch: { multicall: true },
    pollingInterval: 400,
  });
  cache.set(key, { chain, client });
  return client;
}
