import { useQuery } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { api } from "../lib/api";

export interface TierInfo {
  index: number;
  name: string;
  priceWei: string;
  firstSeat: number;
  seatCount: number;
}

export interface EventInfo {
  address: Address;
  eventId: string;
  name: string;
  symbol: string;
  venue: Hex;
  organiser: Address;
  startsAt: number;
  salesEndAt: number;
  resaleCapBps: number;
  resaleFeeBps: number;
  capacity: number;
  sold: number;
  checkedIn: number;
  tiers: TierInfo[];
}

export interface AppConfig {
  chainId: number;
  rpcUrl: string;
  /** Read-only fallbacks the browser tries when `rpcUrl` errors (relayer `PUBLIC_RPC_FALLBACK_URLS`). */
  rpcFallbackUrls: string[];
  /** Provider label derived from `rpcUrl`'s hostname (`alchemy`, `monad`, `local`), for the "under the hood" copy. */
  rpcProvider: string;
  explorer: string | null;
  /** Deployment label from the relayer (`ENVIRONMENT_LABEL`, e.g. `staging`); null on the real thing. */
  environmentLabel: string | null;
  factory: Address;
  forwarder: Address;
  implementation: Address;
  relayer: Address;
  gate: Address;
  /** Check-in requires the operator token (relayer `GATE_TOKEN`); the door asks for it before scanning. */
  gateProtected: boolean;
  gas: { buy: number; buyListing: number; bindDoorKey: number; list: number; delist: number };
  drip: { enabled: boolean; amountWei: string };
  events: EventInfo[];
}

export const configQueryKey = ["config"] as const;

export function useConfig() {
  return useQuery({
    queryKey: configQueryKey,
    queryFn: () => api<AppConfig>("/api/config"),
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 2,
  });
}

export function findEvent(config: AppConfig | undefined, address: string | undefined): EventInfo | undefined {
  if (!config || !address) return undefined;
  const a = address.toLowerCase();
  return config.events.find((e) => e.address.toLowerCase() === a);
}

export function tierForSeat(event: EventInfo, seatId: number): TierInfo | undefined {
  return event.tiers.find((t) => seatId >= t.firstSeat && seatId < t.firstSeat + t.seatCount);
}

export function tierPrice(tier: TierInfo): bigint {
  return BigInt(tier.priceWei);
}

export function explorerTx(config: AppConfig, hash: string): string | null {
  return config.explorer ? `${config.explorer.replace(/\/$/, "")}/tx/${hash}` : null;
}

export function explorerAddress(config: AppConfig, address: string): string | null {
  return config.explorer ? `${config.explorer.replace(/\/$/, "")}/address/${address}` : null;
}

export function chainName(chainId: number): string {
  if (chainId === 10143) return "Monad Testnet";
  if (chainId === 143) return "Monad";
  if (chainId === 31337) return "Local Anvil";
  return `Chain ${chainId}`;
}
