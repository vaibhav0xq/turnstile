import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { gql, liveEnabled } from "./client";
import { big } from "./model";
import {
  CITY_PULSE,
  type CityPulseData,
  INDEXER_SYNC,
  type IndexerSyncData,
  ORGANISER_BOARD,
  type OrganiserBoardData,
  PASSPORT_HISTORY,
  type PassportHistoryData,
  TICKET_PROVENANCE,
  type TicketProvenanceData,
} from "./queries";

/** Every Live query polls on this cadence; Monad blocks every ~0.4 s, the indexer follows within seconds. */
export const LIVE_POLL_MS = 8_000;

function useLive<T>(
  key: readonly unknown[],
  query: string,
  variables: Record<string, unknown>,
  enabled = true,
) {
  return useQuery<T, Error>({
    queryKey: ["live", ...key],
    queryFn: ({ signal }) => gql<T>(query, variables, signal),
    enabled: liveEnabled && enabled,
    refetchInterval: LIVE_POLL_MS,
    staleTime: LIVE_POLL_MS / 2,
    retry: 1,
  });
}

export function useOrganiserBoard(chainId: number, eventAddress: string, enabled = true) {
  const address = eventAddress.toLowerCase();
  return useLive<OrganiserBoardData>(
    ["board", chainId, address],
    ORGANISER_BOARD,
    { chainId, address },
    enabled,
  );
}

export function usePassportHistory(chainId: number | undefined, fanAddress: string | null | undefined) {
  const address = fanAddress?.toLowerCase() ?? "";
  return useLive<PassportHistoryData>(
    ["passport", chainId, address],
    PASSPORT_HISTORY,
    { chainId, address },
    chainId !== undefined && address !== "",
  );
}

export function useCityPulse(chainId: number | undefined, eventAddresses: readonly string[]) {
  const addresses = eventAddresses.map((a) => a.toLowerCase());
  return useLive<CityPulseData>(
    ["pulse", chainId, addresses.join(",")],
    CITY_PULSE,
    { chainId, addresses },
    chainId !== undefined,
  );
}

export function useTicketProvenance(chainId: number, eventAddress: string, tokenId: number) {
  const address = eventAddress.toLowerCase();
  return useLive<TicketProvenanceData>(
    ["provenance", chainId, address, tokenId],
    TICKET_PROVENANCE,
    { chainId, eventAddress: address, tokenId: String(tokenId) },
    Number.isInteger(tokenId) && tokenId > 0,
  );
}

interface HealthBody {
  ok: boolean;
  chainId: number;
  block: string | number;
}

export interface LiveFreshness {
  /** The indexer's latest processed block; null until it reports one. */
  indexed: bigint | null;
  /** The chain head the relayer's RPC sees; null when the relayer did not answer. */
  head: bigint | null;
}

/**
 * The freshness chip's two numbers, read in the same tick. Polled separately they were up to a poll apart,
 * and on a 0.4 s chain that skew alone shows as "20 blocks behind" while the indexer is caught up. The
 * indexer's answer is the one that matters: a relayer hiccup leaves the head unknown instead of blanking
 * the indexer's own height.
 */
export function useLiveFreshness(chainId: number | undefined) {
  return useQuery<LiveFreshness, Error>({
    queryKey: ["live", "freshness", chainId],
    queryFn: async ({ signal }) => {
      const [sync, health] = await Promise.all([
        gql<IndexerSyncData>(INDEXER_SYNC, { chainId }, signal),
        api<HealthBody>("/api/health", { signal }).catch(() => null),
      ]);
      const row = sync.chain_metadata[0];
      return {
        indexed: row?.latest_processed_block == null ? null : big(row.latest_processed_block),
        head: health ? big(health.block) : null,
      };
    },
    enabled: liveEnabled && chainId !== undefined,
    refetchInterval: LIVE_POLL_MS,
    staleTime: LIVE_POLL_MS / 2,
    retry: 1,
  });
}

/** A clock that ticks every `stepMs`, so "N min ago" and minute buckets stay honest between polls. */
export function useNow(stepMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), stepMs);
    return () => clearInterval(id);
  }, [stepMs]);
  return now;
}
