/** Every address-valued field is stored lower-cased so clients can filter with `_eq` without caring about
 * checksum casing (event params arrive checksummed, HyperSync and most wallets speak lower-case). */
export const addr = (address: string) => address.toLowerCase();

export const eventId = (chainId: number, eventAddress: string) => `${chainId}-${addr(eventAddress)}`;

export const ticketId = (chainId: number, eventAddress: string, tokenId: bigint) =>
  `${eventId(chainId, eventAddress)}-${tokenId}`;

export const fanId = (chainId: number, address: string) => `${chainId}-${addr(address)}`;

export const activityId = (chainId: number, block: number, logIndex: number) =>
  `${chainId}-${block}-${logIndex}`;

export const handoverId = (chainId: number, block: number, logIndex: number) =>
  activityId(chainId, block, logIndex);

export const statsId = (chainId: number) => `${chainId}`;

export const eventMinuteId = (eventEntityId: string, timestamp: number) =>
  `${eventEntityId}-${Math.floor(timestamp / 60)}`;
