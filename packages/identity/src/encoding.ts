import { base64urlnopad, hex } from "@scure/base";
import { IdentityError } from "./errors.ts";

export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);
export const utf8Decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

/** Canonical unpadded base64url — the same alphabet Mera uses for credential ids. */
export const b64u = {
  encode: (bytes: Uint8Array): string => base64urlnopad.encode(bytes),
  decode: (text: string, name = "value"): Uint8Array => {
    try {
      return base64urlnopad.decode(text);
    } catch (cause) {
      throw new IdentityError("INPUT_INVALID", `${name} must be canonical base64url`, { cause });
    }
  },
};

export const toHex = (bytes: Uint8Array): `0x${string}` => `0x${hex.encode(bytes)}`;
export const fromHex = (text: string, name = "value"): Uint8Array => {
  const body = text.startsWith("0x") ? text.slice(2) : text;
  try {
    return hex.decode(body);
  } catch (cause) {
    throw new IdentityError("INPUT_INVALID", `${name} must be hex`, { cause });
  }
};

/** Overwrites secret bytes in place. Call it on every derived buffer once it has been consumed. */
export function zeroize(...buffers: Array<Uint8Array | undefined>): void {
  for (const buffer of buffers) buffer?.fill(0);
}

export function assertBytes(value: Uint8Array, length: number, name: string): void {
  if (!(value instanceof Uint8Array) || value.length !== length) {
    throw new IdentityError("INPUT_INVALID", `${name} must be ${length} bytes`);
  }
}

/** WebCrypto's `BufferSource` wants a view over a plain `ArrayBuffer`; this copies into one. Zeroise the copy yourself. */
export function plainBuffer(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(bytes.length);
  out.set(bytes);
  return out;
}

/**
 * RFC 9285 base45 — the encoding built for QR alphanumeric mode: every output character is in the QR
 * alphanumeric set, so a byte costs 1.5 characters at 5.5 bits each (8.25 bits) instead of 2 hex
 * characters (11 bits). Strict on decode: the alphabet, the 2-or-3 character tail and the 16-bit range.
 */
export const BASE45_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

export function base45Encode(bytes: Uint8Array): string {
  const digit = (n: number) => BASE45_ALPHABET.charAt(n);
  let out = "";
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      let n = ((bytes[i] as number) << 8) | (bytes[i + 1] as number);
      const c = n % 45;
      n = (n - c) / 45;
      const d = n % 45;
      out += digit(c) + digit(d) + digit((n - d) / 45);
    } else {
      const n = bytes[i] as number;
      const c = n % 45;
      out += digit(c) + digit((n - c) / 45);
    }
  }
  return out;
}

export function base45Decode(text: string, name = "value"): Uint8Array {
  const invalid = () => new IdentityError("INPUT_INVALID", `${name} must be RFC 9285 base45`);
  if (text.length % 3 === 1) throw invalid();
  const out = new Uint8Array(Math.floor(text.length / 3) * 2 + (text.length % 3 === 2 ? 1 : 0));
  let o = 0;
  for (let i = 0; i < text.length; i += 3) {
    const c = BASE45_ALPHABET.indexOf(text.charAt(i));
    const d = BASE45_ALPHABET.indexOf(text.charAt(i + 1));
    if (c < 0 || d < 0) throw invalid();
    if (i + 2 < text.length) {
      const e = BASE45_ALPHABET.indexOf(text.charAt(i + 2));
      if (e < 0) throw invalid();
      const n = c + d * 45 + e * 2025;
      if (n > 0xffff) throw invalid();
      out[o++] = n >> 8;
      out[o++] = n & 0xff;
    } else {
      const n = c + d * 45;
      if (n > 0xff) throw invalid();
      out[o++] = n;
    }
  }
  return out;
}
