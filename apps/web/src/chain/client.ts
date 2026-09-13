import { type Chain, createPublicClient, defineChain, http, type PublicClient } from "viem";
import type { AppConfig } from "./config";

const cache = new Map<string, { chain: Chain; client: PublicClient }>();

export function chainFor(config: Pick<AppConfig, "chainId" | "rpcUrl" | "explorer">): Chain {
  return defineChain({
    id: config.chainId,
    name: config.chainId === 10143 ? "Monad Testnet" : config.chainId === 143 ? "Monad" : "Anvil",
    nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
    ...(config.explorer ? { blockExplorers: { default: { name: "Explorer", url: config.explorer } } } : {}),
    testnet: config.chainId !== 143,
  });
}

export function publicClientFor(config: Pick<AppConfig, "chainId" | "rpcUrl" | "explorer">): PublicClient {
  const key = `${config.chainId}:${config.rpcUrl}`;
  const hit = cache.get(key);
  if (hit) return hit.client;
  const chain = chainFor(config);
  // 400 ms blocks on Monad: poll receipts at block pace instead of viem's 4 s default.
  const client = createPublicClient({
    chain,
    transport: http(config.rpcUrl, { batch: true }),
    pollingInterval: 400,
  });
  cache.set(key, { chain, client });
  return client;
}
