// Frozen constants. Every value here is part of SPEC.md: changing one changes which keys
// users derive from their passkey, so a change is a spec revision (bump the `v1`), never an edit.

import { sha256 } from "@noble/hashes/sha2.js";
import { utf8ToBytes } from "@noble/hashes/utils.js";

/** Label behind Mera's default PRF salt, `sha256("mera.prf.salt.v1")`. The account namespace passes no
 * `prfSalt`, so the account is exactly what any Mera app derives from the same passkey. */
export const ACCOUNT_SALT_LABEL = "mera.prf.salt.v1";
export const ACCOUNT_SALT: Uint8Array = sha256(utf8ToBytes(ACCOUNT_SALT_LABEL));

/** BIP-44 path of the account key (portable to MetaMask/Rabby through the recovery phrase). */
export const ACCOUNT_PATH = "m/44'/60'/0'/0/0";

/** Presence namespace: a fresh biometric at the door. PRF salt = sha256 of this label. */
export const PRESENCE_SALT_LABEL = "turnstile/presence/v1";
export const PRESENCE_SALT: Uint8Array = sha256(utf8ToBytes(PRESENCE_SALT_LABEL));

/** HKDF parameters of the per-event door key. */
export const DOOR_HKDF_SALT = "turnstile/door-key/v1";
export const DOOR_HKDF_INFO_PREFIX = "turnstile/door/v1";
/** Counter attempts before giving up (an invalid secp256k1 scalar has probability ≈ 2^-128 per attempt). */
export const DOOR_MAX_COUNTER = 8;

/** Vault namespace: the private passport key. PRF salt = sha256 of this label. */
export const VAULT_SALT_LABEL = "turnstile/vault/v1";
export const VAULT_SALT: Uint8Array = sha256(utf8ToBytes(VAULT_SALT_LABEL));

/** HKDF parameters of the vault key, and the AES-GCM associated data of every passport blob. */
export const VAULT_HKDF_SALT = "turnstile/vault-key/v1";
export const VAULT_HKDF_INFO = "passport";
export const VAULT_AAD = "turnstile/passport/v1";
/** Blob layout: `v1.<iv base64url>.<ciphertext‖tag base64url>`. */
export const BLOB_VERSION = "v1";
export const BLOB_IV_BYTES = 12;

/** EIP-712 domain shared with `TurnstileEvent.sol`. */
export const EIP712_NAME = "Turnstile";
export const EIP712_VERSION = "1";

/** Entry codes rotate every 30 s; `checkIn` accepts the current and the previous slot. */
export const SLOT_MS = 30_000;

/** Session lifetimes (product prompt budget, SPEC §5). */
export const ACCOUNT_SESSION_TTL_MS = 15 * 60_000;
export const DOOR_SESSION_TTL_MS = 60 * 60_000;

/** Prefix of the scannable entry-code string, long form (SPEC §4.3). */
export const ENTRY_CODE_PREFIX = "TS1";
/** Prefix of the compact, QR-alphanumeric entry-code string (SPEC §4.3, v1.3). */
export const ENTRY_CODE_COMPACT_PREFIX = "TS2";

/** Monad chain ids. */
export const MONAD_MAINNET = 143;
export const MONAD_TESTNET = 10143;
