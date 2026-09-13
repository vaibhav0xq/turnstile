// Pure key-derivation layer (no WebAuthn, no DOM). Input is always one 32-byte PRF output; every
// function consumes and ZEROISES that input, so callers pass ownership and never reuse the buffer.
// The exact bytes these functions produce are frozen by SPEC.md and pinned by vectors/kdf.json.

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { type Address, getAddress, isAddress, keccak256 } from "viem";
import {
  ACCOUNT_PATH,
  DOOR_HKDF_INFO_PREFIX,
  DOOR_HKDF_SALT,
  DOOR_MAX_COUNTER,
  VAULT_HKDF_INFO,
  VAULT_HKDF_SALT,
} from "./constants.ts";
import { assertBytes, utf8, zeroize } from "./encoding.ts";
import { IdentityError } from "./errors.ts";

/** Identifies one event's `TurnstileEvent` clone: the pair the door key is derived for. */
export type EventRef = {
  readonly chainId: number;
  /** Address of the event's `TurnstileEvent` contract (any case; normalised to lowercase in the KDF). */
  readonly eventAddress: Address;
};

export function assertEventRef(event: EventRef): void {
  if (!Number.isInteger(event.chainId) || event.chainId <= 0) {
    throw new IdentityError("INPUT_INVALID", "event.chainId must be a positive integer");
  }
  if (!isAddress(event.eventAddress, { strict: false })) {
    throw new IdentityError("INPUT_INVALID", "event.eventAddress must be a 20-byte hex address");
  }
}

// ------------------------------------------------------------------ account namespace

/**
 * Account namespace → BIP-39 mnemonic (PRF output is the 256-bit entropy). Consumes `prfOutput`.
 * Only `exportRecoveryPhrase` should call this; the mnemonic is the one artefact that leaves the device.
 */
export function accountMnemonicFromPrf(prfOutput: Uint8Array): string {
  assertBytes(prfOutput, 32, "prfOutput");
  const mnemonic = entropyToMnemonic(prfOutput, wordlist);
  zeroize(prfOutput);
  return mnemonic;
}

/** Account namespace → 32-byte secp256k1 private key at `m/44'/60'/0'/0/0`. Consumes `prfOutput`. */
export function accountKeyFromPrf(prfOutput: Uint8Array): Uint8Array {
  assertBytes(prfOutput, 32, "prfOutput");
  const mnemonic = entropyToMnemonic(prfOutput, wordlist);
  zeroize(prfOutput);
  const seed = mnemonicToSeedSync(mnemonic);
  const root = HDKey.fromMasterSeed(seed);
  zeroize(seed);
  const node = root.derive(ACCOUNT_PATH);
  root.wipePrivateData();
  if (!node.privateKey) {
    node.wipePrivateData();
    throw new IdentityError("DERIVATION_FAILED", "BIP-32 derivation produced no private key");
  }
  const key = new Uint8Array(node.privateKey);
  node.wipePrivateData();
  return key;
}

// ------------------------------------------------------------------ presence namespace

/** HKDF `info` string for one event and counter — `turnstile/door/v1|<chainId>|<event lowercase>|<counter>`. */
export function doorKeyInfo(event: EventRef, counter: number): string {
  return `${DOOR_HKDF_INFO_PREFIX}|${event.chainId}|${event.eventAddress.toLowerCase()}|${counter}`;
}

/**
 * Presence namespace → per-event door key (32-byte secp256k1 private key). Consumes `prfOutput`.
 * HKDF-SHA256(ikm = prf, salt = "turnstile/door-key/v1", info = doorKeyInfo(event, counter), L = 32);
 * the counter starts at 0 and increments only when the candidate is not a valid scalar.
 */
export function doorKeyFromPrf(prfOutput: Uint8Array, event: EventRef): Uint8Array {
  assertBytes(prfOutput, 32, "prfOutput");
  assertEventRef(event);
  try {
    for (let counter = 0; counter < DOOR_MAX_COUNTER; counter++) {
      const candidate = hkdf(sha256, prfOutput, utf8(DOOR_HKDF_SALT), utf8(doorKeyInfo(event, counter)), 32);
      if (secp256k1.utils.isValidSecretKey(candidate)) return candidate;
      zeroize(candidate);
    }
  } finally {
    zeroize(prfOutput);
  }
  throw new IdentityError("DERIVATION_FAILED", `no valid door-key scalar after ${DOOR_MAX_COUNTER} attempts`);
}

// ------------------------------------------------------------------ vault namespace

/**
 * Vault namespace → 32 raw AES-256-GCM key bytes. Consumes `prfOutput`.
 * HKDF-SHA256(ikm = prf, salt = "turnstile/vault-key/v1", info = "passport", L = 32).
 * `importVaultKey` in vault.ts turns these bytes into a non-extractable CryptoKey and zeroises them.
 */
export function vaultKeyBytesFromPrf(prfOutput: Uint8Array): Uint8Array {
  assertBytes(prfOutput, 32, "prfOutput");
  const key = hkdf(sha256, prfOutput, utf8(VAULT_HKDF_SALT), utf8(VAULT_HKDF_INFO), 32);
  zeroize(prfOutput);
  return key;
}

// ------------------------------------------------------------------ helpers

/** EIP-55 address of a 65-byte uncompressed secp256k1 public key (as Mera sessions expose it). */
export function addressOfPublicKey(publicKey: Uint8Array): Address {
  assertBytes(publicKey, 65, "publicKey");
  return getAddress(`0x${keccak256(publicKey.subarray(1)).slice(-40)}`);
}

/** EIP-55 address of a 32-byte secp256k1 private key (does not consume the key; never stringifies it). */
export function addressOfPrivateKey(privateKey: Uint8Array): Address {
  assertBytes(privateKey, 32, "privateKey");
  return addressOfPublicKey(secp256k1.getPublicKey(privateKey, false));
}
