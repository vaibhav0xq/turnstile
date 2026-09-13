// EIP-712 `Entry` — the one message a door key ever signs. Pure module: the gate app, the relayer and
// the Foundry tests import it without touching WebAuthn. Byte-for-byte contract with TurnstileEvent.sol
// (`bindDoorKey` / `checkIn`), pinned by vectors/entry.json.

import {
  type Address,
  domainSeparator,
  type Hex,
  hashStruct,
  hashTypedData,
  isAddress,
  keccak256,
  recoverTypedDataAddress,
} from "viem";
import { EIP712_NAME, EIP712_VERSION, ENTRY_CODE_PREFIX, SLOT_MS } from "./constants.ts";
import { utf8 } from "./encoding.ts";
import { IdentityError } from "./errors.ts";
import { assertEventRef, type EventRef } from "./kdf.ts";

/** Solidity: `struct Entry { uint256 eventId; uint256 tokenId; uint64 slot; }` */
export const ENTRY_TYPES = {
  Entry: [
    { name: "eventId", type: "uint256" },
    { name: "tokenId", type: "uint256" },
    { name: "slot", type: "uint64" },
  ],
} as const;

export const ENTRY_PRIMARY_TYPE = "Entry" as const;
export const ENTRY_TYPE_STRING = "Entry(uint256 eventId,uint256 tokenId,uint64 slot)";
/** `keccak256("Entry(uint256 eventId,uint256 tokenId,uint64 slot)")` — `ENTRY_TYPEHASH` in Solidity. */
export const ENTRY_TYPEHASH: Hex = keccak256(utf8(ENTRY_TYPE_STRING));

export type EntryMessage = {
  /** Factory registry id of the event (`EventCreated.eventId`). */
  readonly eventId: bigint;
  /** Ticket token id inside the event's `TurnstileEvent`. */
  readonly tokenId: bigint;
  /** 30-second window: `floor(unixMs / 30000)`. */
  readonly slot: bigint;
};

export type EntryDomain = {
  readonly name: typeof EIP712_NAME;
  readonly version: typeof EIP712_VERSION;
  readonly chainId: number;
  readonly verifyingContract: Address;
};

export type EntryTypedData = {
  readonly domain: EntryDomain;
  readonly types: typeof ENTRY_TYPES;
  readonly primaryType: typeof ENTRY_PRIMARY_TYPE;
  readonly message: EntryMessage;
};

/** `{ name: "Turnstile", version: "1", chainId, verifyingContract: <TurnstileEvent clone> }` */
export function entryDomain(event: EventRef): EntryDomain {
  assertEventRef(event);
  return {
    name: EIP712_NAME,
    version: EIP712_VERSION,
    chainId: event.chainId,
    verifyingContract: event.eventAddress,
  };
}

const UINT64_MAX = (1n << 64n) - 1n;
const UINT256_MAX = (1n << 256n) - 1n;

export function assertEntryMessage(message: EntryMessage): void {
  const check = (value: bigint, max: bigint, name: string) => {
    if (typeof value !== "bigint" || value < 0n || value > max) {
      throw new IdentityError("INPUT_INVALID", `${name} must be a bigint in [0, ${max}]`);
    }
  };
  check(message.eventId, UINT256_MAX, "eventId");
  check(message.tokenId, UINT256_MAX, "tokenId");
  check(message.slot, UINT64_MAX, "slot");
}

export function entryTypedData(event: EventRef, message: EntryMessage): EntryTypedData {
  assertEntryMessage(message);
  return { domain: entryDomain(event), types: ENTRY_TYPES, primaryType: ENTRY_PRIMARY_TYPE, message };
}

/** EIP-712 digest = keccak256(0x1901 ‖ domainSeparator ‖ structHash). What `checkIn` recovers over. */
export function entryDigest(event: EventRef, message: EntryMessage): Hex {
  return hashTypedData(entryTypedData(event, message));
}

/** Pieces the Solidity side computes separately; exported for the vector file and contract tests. */
export function entryHashes(
  event: EventRef,
  message: EntryMessage,
): {
  typeHash: Hex;
  domainSeparator: Hex;
  structHash: Hex;
  digest: Hex;
} {
  const typed = entryTypedData(event, message);
  return {
    typeHash: ENTRY_TYPEHASH,
    domainSeparator: domainSeparator({ domain: typed.domain }),
    structHash: hashStruct({ data: typed.message, primaryType: ENTRY_PRIMARY_TYPE, types: ENTRY_TYPES }),
    digest: hashTypedData(typed),
  };
}

/** Current 30-second slot. */
export function currentSlot(nowMs: number = Date.now()): bigint {
  return BigInt(Math.floor(nowMs / SLOT_MS));
}

/** The gate's acceptance rule: the code's slot is the current one or the one just before it. */
export function isSlotAcceptable(slot: bigint, nowMs: number = Date.now()): boolean {
  const now = currentSlot(nowMs);
  return slot === now || slot === now - 1n;
}

/** Address that signed an Entry — `ecrecover` as `checkIn` will do it. */
export function recoverEntrySigner(event: EventRef, message: EntryMessage, signature: Hex): Promise<Address> {
  return recoverTypedDataAddress({ ...entryTypedData(event, message), signature });
}

/** True when `signature` over (event, message) recovers to `doorKey` (case-insensitive). */
export async function verifyEntry(
  event: EventRef,
  message: EntryMessage,
  signature: Hex,
  doorKey: Address,
): Promise<boolean> {
  try {
    const recovered = await recoverEntrySigner(event, message, signature);
    return recovered.toLowerCase() === doorKey.toLowerCase();
  } catch {
    return false;
  }
}

// ------------------------------------------------------------------ scannable code

/** What the ticket screen renders and the gate scans. */
export type EntryCode = {
  readonly event: EventRef;
  readonly message: EntryMessage;
  readonly signature: Hex;
};

/**
 * `TS1|<chainId>|<event address lowercase>|<eventId>|<tokenId>|<slot>|<signature hex>` — 7 fields, ASCII,
 * ≈ 215 chars: fits a version-9 QR at error-correction M. Nothing in it is secret (the signature is public
 * proof of presence for that slot); `checkIn` is what consumes it, once.
 */
export function encodeEntryCode(code: EntryCode): string {
  assertEventRef(code.event);
  assertEntryMessage(code.message);
  if (!/^0x[0-9a-f]{130}$/i.test(code.signature)) {
    throw new IdentityError("INPUT_INVALID", "signature must be 65 bytes of hex");
  }
  const { eventId, tokenId, slot } = code.message;
  return [
    ENTRY_CODE_PREFIX,
    String(code.event.chainId),
    code.event.eventAddress.toLowerCase(),
    eventId.toString(),
    tokenId.toString(),
    slot.toString(),
    code.signature.toLowerCase(),
  ].join("|");
}

export function decodeEntryCode(text: string): EntryCode {
  const parts = text.trim().split("|");
  if (parts.length !== 7 || parts[0] !== ENTRY_CODE_PREFIX) {
    throw new IdentityError("CODE_FORMAT_INVALID", "not a Turnstile entry code");
  }
  const [, chainIdText, eventAddress, eventIdText, tokenIdText, slotText, signature] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const digits = /^[0-9]+$/;
  if (
    !digits.test(chainIdText) ||
    !digits.test(eventIdText) ||
    !digits.test(tokenIdText) ||
    !digits.test(slotText)
  ) {
    throw new IdentityError("CODE_FORMAT_INVALID", "entry code has a non-numeric field");
  }
  if (!isAddress(eventAddress, { strict: false }) || !/^0x[0-9a-f]{130}$/.test(signature)) {
    throw new IdentityError("CODE_FORMAT_INVALID", "entry code has a malformed address or signature");
  }
  const chainId = Number(chainIdText);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new IdentityError("CODE_FORMAT_INVALID", "entry code has an invalid chain id");
  }
  const message: EntryMessage = {
    eventId: BigInt(eventIdText),
    tokenId: BigInt(tokenIdText),
    slot: BigInt(slotText),
  };
  try {
    assertEntryMessage(message);
  } catch (cause) {
    throw new IdentityError("CODE_FORMAT_INVALID", "entry code field out of range", { cause });
  }
  return { event: { chainId, eventAddress: eventAddress as Address }, message, signature: signature as Hex };
}
