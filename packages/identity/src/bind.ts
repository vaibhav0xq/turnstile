// EIP-712 `BindDoorKey` — the holder's *account* key authorising a door key for one ticket. Used when the
// binding cannot go through the relayer (gate fallback: `checkInWithBind`) or when a third party submits it
// (`bindDoorKeyWithSig`). Same domain as `Entry`; a different signer (account, not door key). Pure module.

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
import { utf8 } from "./encoding.ts";
import { type EntryDomain, entryDomain } from "./entry.ts";
import { IdentityError } from "./errors.ts";
import type { EventRef } from "./kdf.ts";

/** Solidity: `BindDoorKey(uint256 tokenId,address doorKey,uint256 nonce,uint256 deadline)` */
export const BIND_TYPES = {
  BindDoorKey: [
    { name: "tokenId", type: "uint256" },
    { name: "doorKey", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const BIND_PRIMARY_TYPE = "BindDoorKey" as const;
export const BIND_TYPE_STRING = "BindDoorKey(uint256 tokenId,address doorKey,uint256 nonce,uint256 deadline)";
/** `keccak256(BIND_TYPE_STRING)` — `BIND_TYPEHASH` in TurnstileEvent.sol. */
export const BIND_TYPEHASH: Hex = keccak256(utf8(BIND_TYPE_STRING));

export type BindDoorKeyMessage = {
  readonly tokenId: bigint;
  /** The door key being bound (never the account address). */
  readonly doorKey: Address;
  /** `TurnstileEvent.bindNonceOf(tokenId)` at signing time; every bind (any path) bumps it. */
  readonly nonce: bigint;
  /** Unix **seconds**; the contract rejects after this. */
  readonly deadline: bigint;
};

export type BindDoorKeyTypedData = {
  readonly domain: EntryDomain;
  readonly types: typeof BIND_TYPES;
  readonly primaryType: typeof BIND_PRIMARY_TYPE;
  readonly message: BindDoorKeyMessage;
};

const UINT256_MAX = (1n << 256n) - 1n;

export function assertBindDoorKeyMessage(message: BindDoorKeyMessage): void {
  for (const [name, value] of [
    ["tokenId", message.tokenId],
    ["nonce", message.nonce],
    ["deadline", message.deadline],
  ] as const) {
    if (typeof value !== "bigint" || value < 0n || value > UINT256_MAX) {
      throw new IdentityError("INPUT_INVALID", `${name} must be a bigint in [0, 2^256)`);
    }
  }
  if (!isAddress(message.doorKey, { strict: false }) || /^0x0{40}$/.test(message.doorKey)) {
    throw new IdentityError("INPUT_INVALID", "doorKey must be a non-zero address");
  }
}

export function bindDoorKeyTypedData(event: EventRef, message: BindDoorKeyMessage): BindDoorKeyTypedData {
  assertBindDoorKeyMessage(message);
  return { domain: entryDomain(event), types: BIND_TYPES, primaryType: BIND_PRIMARY_TYPE, message };
}

/** What `bindDoorKeyWithSig` / `checkInWithBind` recover over. */
export function bindDoorKeyDigest(event: EventRef, message: BindDoorKeyMessage): Hex {
  return hashTypedData(bindDoorKeyTypedData(event, message));
}

export function bindDoorKeyHashes(
  event: EventRef,
  message: BindDoorKeyMessage,
): { typeHash: Hex; domainSeparator: Hex; structHash: Hex; digest: Hex } {
  const typed = bindDoorKeyTypedData(event, message);
  return {
    typeHash: BIND_TYPEHASH,
    domainSeparator: domainSeparator({ domain: typed.domain }),
    structHash: hashStruct({ data: typed.message, primaryType: BIND_PRIMARY_TYPE, types: BIND_TYPES }),
    digest: hashTypedData(typed),
  };
}

/** Address that signed a BindDoorKey — must equal `ownerOf(tokenId)` for the contract to accept it. */
export function recoverBindSigner(
  event: EventRef,
  message: BindDoorKeyMessage,
  signature: Hex,
): Promise<Address> {
  return recoverTypedDataAddress({ ...bindDoorKeyTypedData(event, message), signature });
}
