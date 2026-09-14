import { type Chain, createPublicClient, defineChain, fallback, http, type PublicClient } from "viem";
import type { AppConfig } from "./config";

type RpcConfig = Pick<AppConfig, "chainId" | "rpcUrl" | "explorer"> &
  Partial<Pick<AppConfig, "rpcFallbackUrls">>;

const cache = new Map<string, { chain: Chain; client: PublicClient }>();
/** Multicall3 at its canonical address on Monad (testnet and mainnet); anvil has none, viem falls back to plain calls. */
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

/** Primary RPC first, then the relayer-configured fallbacks (`PUBLIC_RPC_FALLBACK_URLS`), deduplicated. */
export function rpcUrlsFor(config: RpcConfig): string[] {
  return [...new Set([config.rpcUrl, ...(config.rpcFallbackUrls ?? [])])];
}

export function chainFor(config: RpcConfig): Chain {
  return defineChain({
    id: config.chainId,
    name: config.chainId === 10143 ? "Monad Testnet" : config.chainId === 143 ? "Monad" : "Anvil",
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: rpcUrlsFor(config) } },
    ...(config.explorer ? { blockExplorers: { default: { name: "Explorer", url: config.explorer } } } : {}),
    ...(config.chainId === 31337 ? {} : { contracts: { multicall3: { address: MULTICALL3 } } }),
    testnet: config.chainId !== 143,
  });
}

export function publicClientFor(config: RpcConfig): PublicClient {
  const urls = rpcUrlsFor(config);
  const key = `${config.chainId}:${urls.join("|")}`;
  const hit = cache.get(key);
  if (hit) return hit.client;
  const chain = chainFor(config);
  // 400 ms blocks on Monad: poll receipts at block pace instead of viem's 4 s default. Public Monad RPCs
  // allow ~15 requests a second, so reads issued together become one Multicall3 call. The browser only
  // reads (every write goes through the relayer), so a provider outage simply fails over to the next URL.
  const transports = urls.map((url) => http(url, { batch: true }));
  const client = createPublicClient({
    chain,
    transport:
      transports.length === 1
        ? (transports[0] as ReturnType<typeof http>)
        : fallback(transports, { rank: false }),
    batch: { multicall: true },
    pollingInterval: 400,
  });
  cache.set(key, { chain, client });
  return client;
}
