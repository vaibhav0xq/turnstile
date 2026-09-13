// Private-passport encryption. Pure WebCrypto: works in browsers and Node ≥ 20. The key comes from the
// vault namespace (kdf.ts); blobs are ciphertext-only and safe to store anywhere (SPEC §4.4).

import { BLOB_IV_BYTES, BLOB_VERSION, VAULT_AAD } from "./constants.ts";
import { assertBytes, b64u, plainBuffer, utf8, utf8Decode, zeroize } from "./encoding.ts";
import { IdentityError } from "./errors.ts";

const AAD = plainBuffer(utf8(VAULT_AAD));

function subtle(): SubtleCrypto {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new IdentityError("CRYPTO_UNAVAILABLE", "crypto.subtle is unavailable");
  return s;
}

/** Wraps 32 raw key bytes as a non-extractable AES-256-GCM key and zeroises the bytes. */
export async function importVaultKey(rawKey: Uint8Array): Promise<CryptoKey> {
  assertBytes(rawKey, 32, "rawKey");
  const copy = plainBuffer(rawKey);
  try {
    return await subtle().importKey("raw", copy, { name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
  } finally {
    zeroize(rawKey, copy);
  }
}

export type ParsedBlob = { version: typeof BLOB_VERSION; iv: Uint8Array; ciphertext: Uint8Array };

/** Splits and validates `v1.<iv>.<ciphertext‖tag>`. */
export function parseBlob(blob: string): ParsedBlob {
  const parts = typeof blob === "string" ? blob.split(".") : [];
  if (parts.length !== 3 || parts[0] !== BLOB_VERSION || !parts[1] || !parts[2]) {
    throw new IdentityError("BLOB_FORMAT_INVALID", "blob must be v1.<iv>.<ciphertext>");
  }
  let iv: Uint8Array;
  let ciphertext: Uint8Array;
  try {
    iv = b64u.decode(parts[1], "iv");
    ciphertext = b64u.decode(parts[2], "ciphertext");
  } catch (cause) {
    throw new IdentityError("BLOB_FORMAT_INVALID", "blob parts must be canonical base64url", { cause });
  }
  if (iv.length !== BLOB_IV_BYTES || ciphertext.length < 16) {
    throw new IdentityError(
      "BLOB_FORMAT_INVALID",
      "blob iv must be 12 bytes and ciphertext must carry a tag",
    );
  }
  return { version: BLOB_VERSION, iv, ciphertext };
}

/** Test/vector hook: encrypt with a caller-supplied IV. Production code must use `encryptBlob` (random IV). */
export async function encryptBlobWithIv(
  key: CryptoKey,
  plaintext: Uint8Array,
  iv: Uint8Array,
): Promise<string> {
  assertBytes(iv, BLOB_IV_BYTES, "iv");
  const ciphertext = new Uint8Array(
    await subtle().encrypt(
      { name: "AES-GCM", iv: plainBuffer(iv), additionalData: AAD },
      key,
      plainBuffer(plaintext),
    ),
  );
  return `${BLOB_VERSION}.${b64u.encode(iv)}.${b64u.encode(ciphertext)}`;
}

/** AES-256-GCM, fresh 12-byte random IV, AAD `turnstile/passport/v1`. Returns `v1.<iv>.<ciphertext‖tag>`. */
export async function encryptBlob(key: CryptoKey, plaintext: Uint8Array | string | object): Promise<string> {
  const iv = new Uint8Array(BLOB_IV_BYTES);
  if (!globalThis.crypto?.getRandomValues) {
    throw new IdentityError("CRYPTO_UNAVAILABLE", "crypto.getRandomValues is unavailable");
  }
  globalThis.crypto.getRandomValues(iv);
  return encryptBlobWithIv(key, toPlaintextBytes(plaintext), iv);
}

/** Decrypts a blob to bytes. Wrong key, wrong namespace or any tampering → `DECRYPT_FAILED`. */
export async function decryptBlob(key: CryptoKey, blob: string): Promise<Uint8Array> {
  const { iv, ciphertext } = parseBlob(blob);
  try {
    return new Uint8Array(
      await subtle().decrypt(
        { name: "AES-GCM", iv: plainBuffer(iv), additionalData: AAD },
        key,
        plainBuffer(ciphertext),
      ),
    );
  } catch (cause) {
    throw new IdentityError("DECRYPT_FAILED", "AES-GCM authentication failed", { cause });
  }
}

/** `decryptBlob` + UTF-8 + JSON.parse. */
export async function decryptBlobJson<T = unknown>(key: CryptoKey, blob: string): Promise<T> {
  const bytes = await decryptBlob(key, blob);
  try {
    return JSON.parse(utf8Decode(bytes)) as T;
  } catch (cause) {
    throw new IdentityError("BLOB_FORMAT_INVALID", "decrypted passport is not JSON", { cause });
  } finally {
    zeroize(bytes);
  }
}

function toPlaintextBytes(plaintext: Uint8Array | string | object): Uint8Array {
  if (plaintext instanceof Uint8Array) return plaintext;
  if (typeof plaintext === "string") return utf8(plaintext);
  return utf8(JSON.stringify(plaintext));
}
