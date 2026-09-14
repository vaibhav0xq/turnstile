// Which door the judge's tour walks through. Pure so it can be unit-tested without the DOM.

export interface TourCandidate {
  address: string;
  eventId: string;
  tiers: { priceWei: string }[];
}

const hasFreeTier = (event: TourCandidate) => event.tiers.some((tier) => BigInt(tier.priceWei) === 0n);

/**
 * `?event=<address>` wins when it names a listed event; otherwise the newest event with a free tier (the
 * highest `eventId` — the night seeded for the demo, not the oldest fixture); otherwise the first event.
 */
export function pickTourEvent<T extends TourCandidate>(
  events: readonly T[],
  target: string | null,
): T | undefined {
  if (target) {
    const wanted = target.toLowerCase();
    const hit = events.find((event) => event.address.toLowerCase() === wanted);
    if (hit) return hit;
  }
  const free = events.filter(hasFreeTier);
  if (free.length > 0) {
    return free.reduce((newest, event) => (BigInt(event.eventId) > BigInt(newest.eventId) ? event : newest));
  }
  return events[0];
}
