import { useQuery } from "@tanstack/react-query";
import { turnstileEventAbi } from "@turnstile/contracts/abi";
import { type Address, zeroAddress } from "viem";
import { publicClientFor } from "./client";
import type { AppConfig, EventInfo } from "./config";

export type SeatStatus = "available" | "sold" | "listed" | "checkedIn";

export interface SeatState {
  id: number;
  holder: Address;
  doorKey: Address;
  checkedInAt: number;
  listingPrice: bigint;
  listed: boolean;
}

export type SeatMap = Map<number, SeatState>;

export function seatStatus(state: SeatState | undefined): SeatStatus {
  if (!state || state.holder === zeroAddress) return "available";
  if (state.checkedInAt > 0) return "checkedIn";
  if (state.listed) return "listed";
  return "sold";
}

export async function fetchSeatMap(config: AppConfig, event: EventInfo): Promise<SeatMap> {
  const client = publicClientFor(config);
  const map: SeatMap = new Map();
  await Promise.all(
    event.tiers.map(async (tier) => {
      // seatStates is a batch view; chunk long tiers so a single call stays small.
      const chunk = 160;
      for (let first = tier.firstSeat; first < tier.firstSeat + tier.seatCount; first += chunk) {
        const count = Math.min(chunk, tier.firstSeat + tier.seatCount - first);
        const states = await client.readContract({
          address: event.address,
          abi: turnstileEventAbi,
          functionName: "seatStates",
          args: [BigInt(first), BigInt(count)],
        });
        states.forEach((s, i) => {
          if (s.holder === zeroAddress) return;
          map.set(first + i, {
            id: first + i,
            holder: s.holder,
            doorKey: s.doorKey,
            checkedInAt: Number(s.checkedInAt),
            listingPrice: s.listingPrice,
            listed: s.listed,
          });
        });
      }
    }),
  );
  return map;
}

export function seatMapQueryKey(eventAddress: string) {
  return ["seats", eventAddress.toLowerCase()] as const;
}

export function useSeatMap(config: AppConfig | undefined, event: EventInfo | undefined, live = true) {
  return useQuery({
    queryKey: seatMapQueryKey(event?.address ?? "none"),
    queryFn: () => {
      if (!config || !event) throw new Error("no event");
      return fetchSeatMap(config, event);
    },
    enabled: Boolean(config && event),
    refetchInterval: live ? 2_500 : false,
    staleTime: 1_000,
    placeholderData: (previous) => previous,
  });
}

export function mySeats(map: SeatMap | undefined, address: Address | undefined): SeatState[] {
  if (!map || !address) return [];
  const a = address.toLowerCase();
  return [...map.values()].filter((s) => s.holder.toLowerCase() === a).sort((x, y) => x.id - y.id);
}
