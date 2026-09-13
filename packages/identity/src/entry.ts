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
import {
  EIP712_NAME,
  EIP712_VERSION,
  ENTRY_CODE_COMPACT_PREFIX,
  ENTRY_CODE_PREFIX,
  SLOT_MS,
} from "./constants.ts";
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

/** Both scannable spellings of an entry code. */
export type EntryCodeForm = "long" | "compact";

const SIGNATURE_HEX = /^0x[0-9a-f]{130}$/i;
const DIGITS = /^[0-9]+$/;

/**
 * Long form: `TS1|<chainId>|<event address lowercase>|<eventId>|<tokenId>|<slot>|<signature hex>` — 7 fields,
 * ASCII, ≈ 200 chars, QR byte mode (version 10 at ECC M).
 *
 * Compact form (`form: "compact"`): `TS2:<chainId>:<EVENT ADDRESS HEX UPPER, no 0x>:<eventId>:<tokenId>:<slot>:
 * <SIGNATURE HEX UPPER, no 0x>` — the same fields, but every character is in the QR alphanumeric set
 * (digits, A–Z, `:`), so the code packs 5.5 bits per character instead of 8 and drops two QR versions
 * (≈ 195 chars, version 8 at ECC M): bigger modules on the same phone screen, faster lock at the door.
 *
 * Nothing in either is secret (the signature is public proof of presence for that slot); `checkIn` is what
 * consumes it, once. `decodeEntryCode` accepts both.
 */
export function encodeEntryCode(code: EntryCode, form: EntryCodeForm = "long"): string {
  assertEventRef(code.event);
  assertEntryMessage(code.message);
  if (!SIGNATURE_HEX.test(code.signature)) {
    throw new IdentityError("INPUT_INVALID", "signature must be 65 bytes of hex");
  }
  const { eventId, tokenId, slot } = code.message;
  const numbers = [String(code.event.chainId), eventId.toString(), tokenId.toString(), slot.toString()];
  if (form === "compact") {
    return [
      ENTRY_CODE_COMPACT_PREFIX,
      numbers[0],
      code.event.eventAddress.slice(2).toUpperCase(),
      ...numbers.slice(1),
      code.signature.slice(2).toUpperCase(),
    ].join(":");
  }
  return [
    ENTRY_CODE_PREFIX,
    numbers[0],
    code.event.eventAddress.toLowerCase(),
    ...numbers.slice(1),
    code.signature.toLowerCase(),
  ].join("|");
}

/** Which spelling a scanned string claims to be, or null when it is not an entry code at all. */
export function entryCodeForm(text: string): EntryCodeForm | null {
  const head = text.trimStart();
  if (head.startsWith(`${ENTRY_CODE_PREFIX}|`)) return "long";
  if (head.startsWith(`${ENTRY_CODE_COMPACT_PREFIX}:`)) return "compact";
  return null;
}

export function decodeEntryCode(text: string): EntryCode {
  const form = entryCodeForm(text);
  if (!form) throw new IdentityError("CODE_FORMAT_INVALID", "not a Turnstile entry code");
  const parts = text.trim().split(form === "compact" ? ":" : "|");
  if (parts.length !== 7) {
    throw new IdentityError("CODE_FORMAT_INVALID", "not a Turnstile entry code");
  }
  const [, chainIdText, addressText, eventIdText, tokenIdText, slotText, signatureText] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  if (
    !DIGITS.test(chainIdText) ||
    !DIGITS.test(eventIdText) ||
    !DIGITS.test(tokenIdText) ||
    !DIGITS.test(slotText)
  ) {
    throw new IdentityError("CODE_FORMAT_INVALID", "entry code has a non-numeric field");
  }
  // Compact is bare uppercase hex, strictly. Long form keeps its v1 leniency: any-case 0x address (kept
  // as written) and a lowercase 0x signature — existing TS1 codes must decode exactly as before.
  let eventAddress: string;
  let signature: Hex;
  if (form === "compact") {
    if (!/^[0-9A-F]{40}$/.test(addressText) || !/^[0-9A-F]{130}$/.test(signatureText)) {
      throw new IdentityError("CODE_FORMAT_INVALID", "entry code has a malformed address or signature");
    }
    eventAddress = `0x${addressText.toLowerCase()}`;
    signature = `0x${signatureText.toLowerCase()}`;
  } else {
    if (!isAddress(addressText, { strict: false }) || !/^0x[0-9a-f]{130}$/.test(signatureText)) {
      throw new IdentityError("CODE_FORMAT_INVALID", "entry code has a malformed address or signature");
    }
    eventAddress = addressText;
    signature = signatureText as Hex;
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
  return { event: { chainId, eventAddress: eventAddress as Address }, message, signature };
}
