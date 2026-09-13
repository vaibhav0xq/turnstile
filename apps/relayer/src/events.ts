import { turnstileEventAbi, turnstileFactoryAbi } from "@turnstile/contracts/abi";
import { type Address, getAddress, zeroAddress } from "viem";
import { deployment, publicClient } from "./config.ts";

export type TierInfo = {
  index: number;
  name: string;
  priceWei: string;
  firstSeat: number;
  seatCount: number;
};
export type EventInfo = {
  address: Address;
  eventId: string;
  name: string;
  symbol: string;
  venue: `0x${string}`;
  organiser: Address;
  startsAt: number;
  salesEndAt: number;
  resaleCapBps: number;
  resaleFeeBps: number;
  capacity: number;
  sold: number;
  checkedIn: number;
  tiers: TierInfo[];
};

let cache: { expires: number; events: EventInfo[] } | undefined;

async function read<T>(address: Address, functionName: string, args?: readonly unknown[]): Promise<T> {
  return publicClient.readContract({
    address,
    abi: turnstileEventAbi,
    functionName,
    ...(args ? { args } : {}),
  } as never) as Promise<T>;
}

async function loadEvent(address: Address): Promise<EventInfo> {
  const [
    eventId,
    name,
    symbol,
    venue,
    organiser,
    startsAt,
    salesEndAt,
    resaleCapBps,
    resaleFeeBps,
    capacity,
    sold,
    checkedIn,
    tierCount,
  ] = await Promise.all([
    read<bigint>(address, "eventId"),
    read<string>(address, "name"),
    read<string>(address, "symbol"),
    read<`0x${string}`>(address, "venue"),
    read<Address>(address, "organiser"),
    read<bigint>(address, "startsAt"),
    read<bigint>(address, "salesEndAt"),
    read<number>(address, "resaleCapBps"),
    read<number>(address, "resaleFeeBps"),
    read<bigint>(address, "capacity"),
    read<bigint>(address, "sold"),
    read<bigint>(address, "checkedInCount"),
    read<bigint>(address, "tierCount"),
  ]);
  const tiers = await Promise.all(
    Array.from({ length: Number(tierCount) }, async (_, index): Promise<TierInfo> => {
      const tier = await read<{ name: string; price: bigint; firstSeat: number; seatCount: number }>(
        address,
        "tierAt",
        [BigInt(index)],
      );
      return {
        index,
        name: tier.name,
        priceWei: tier.price.toString(),
        firstSeat: tier.firstSeat,
        seatCount: tier.seatCount,
      };
    }),
  );
  return {
    address: getAddress(address),
    eventId: eventId.toString(),
    name,
    symbol,
    venue,
    organiser: getAddress(organiser),
    startsAt: Number(startsAt),
    salesEndAt: Number(salesEndAt),
    resaleCapBps,
    resaleFeeBps,
    capacity: Number(capacity),
    sold: Number(sold),
    checkedIn: Number(checkedIn),
    tiers,
  };
}

export async function getEvents(fresh = false): Promise<EventInfo[]> {
  if (!fresh && cache && cache.expires > Date.now()) return cache.events;
  const count = await publicClient.readContract({
    address: deployment.factory,
    abi: turnstileFactoryAbi,
    functionName: "eventCount",
  });
  // Factory event ids are 1-based: `eventId = ++eventCount; eventAt[eventId] = event`.
  const addresses = await Promise.all(
    Array.from({ length: Number(count) }, (_, index) =>
      publicClient.readContract({
        address: deployment.factory,
        abi: turnstileFactoryAbi,
        functionName: "eventAt",
        args: [BigInt(index + 1)],
      }),
    ),
  );
  const events = await Promise.all(addresses.map((address) => loadEvent(getAddress(address as Address))));
  cache = { expires: Date.now() + 15_000, events };
  return events;
}

export async function findEvent(address: Address): Promise<EventInfo | undefined> {
  const normalized = getAddress(address);
  const cached = (await getEvents()).find((event) => event.address === normalized);
  if (cached) return cached;
  const known = await publicClient.readContract({
    address: deployment.factory,
    abi: turnstileFactoryAbi,
    functionName: "isTurnstileEvent",
    args: [normalized],
  });
  return known ? loadEvent(normalized) : undefined;
}

export function tierFor(event: EventInfo, tokenId: bigint): TierInfo | undefined {
  return event.tiers.find(
    (tier) => tokenId >= BigInt(tier.firstSeat) && tokenId < BigInt(tier.firstSeat + tier.seatCount),
  );
}

export { zeroAddress };
