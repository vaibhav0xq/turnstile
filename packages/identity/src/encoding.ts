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
