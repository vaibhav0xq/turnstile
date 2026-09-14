// RPC transports: one primary provider (Alchemy on the deployed origins) with public fallbacks.
//
// Reads, receipts and nonce lookups fail over to the next URL when a provider errors or times out.
// `eth_sendRawTransaction` is pinned to the primary: a send that timed out may still have been accepted,
// and replaying it through another provider would surface "already known" / "nonce too low" for a
// transaction that actually landed. The relayer's per-process queue keeps nonces ordered on that one path.

import { fallback, http, type Transport } from "viem";

/** Splits a comma-separated URL list, dropping blanks and anything that is not an http(s) URL. */
export function parseUrlList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => /^https?:\/\//i.test(item));
}

const KNOWN_PROVIDERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/(^|\.)alchemy\.com$/i, "alchemy"],
  [/(^|\.)monad\.xyz$/i, "monad"],
  [/(^|\.)quiknode\.pro$/i, "quicknode"],
  [/(^|\.)ankr\.com$/i, "ankr"],
  [/(^|\.)drpc\.org$/i, "drpc"],
  [/(^|\.)thirdweb\.com$/i, "thirdweb"],
  [/(^|\.)blockvision\.org$/i, "blockvision"],
  [/(^|\.)envio\.dev$/i, "envio"],
  [/^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/i, "local"],
];

/** Provider label for `/api/health` and the web app: derived from the hostname only, never the path (API keys live there). */
export function providerLabel(url: string): string {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return "unknown";
  }
  for (const [pattern, label] of KNOWN_PROVIDERS) if (pattern.test(host)) return label;
  const parts = host.split(".").filter(Boolean);
  return (parts.length >= 2 ? parts[parts.length - 2] : parts[0]) ?? "unknown";
}

/** Hostname of an RPC URL for logs and health, or "invalid" when it does not parse. */
export function rpcHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "invalid";
  }
}

export type RpcPlan = {
  primary: string;
  fallbacks: string[];
  provider: string;
};

export function planRpc(primary: string, fallbacks: string[]): RpcPlan {
  return { primary, fallbacks: fallbacks.filter((url) => url !== primary), provider: providerLabel(primary) };
}

const SEND_ONLY_ON_PRIMARY = ["eth_sendRawTransaction", "eth_sendTransaction"];

/**
 * Builds the transport for a plan. With no fallbacks it is a plain `http()`; otherwise a viem `fallback`
 * whose secondary transports exclude sends (see the header comment). `batch` folds simultaneous reads
 * into one HTTP round trip on public RPCs that allow ~15 requests a second.
 */
export function transportFor(plan: RpcPlan, options: { batch?: boolean } = {}): Transport {
  const httpOptions = options.batch ? { batch: true } : {};
  if (plan.fallbacks.length === 0) return http(plan.primary, httpOptions);
  return fallback(
    [
      http(plan.primary, httpOptions),
      ...plan.fallbacks.map((url) =>
        http(url, { ...httpOptions, methods: { exclude: SEND_ONLY_ON_PRIMARY } }),
      ),
    ],
    { rank: false },
  );
}
