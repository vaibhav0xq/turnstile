// Designed failure states. Every WebAuthn / Mera / crypto failure surfaces as one of these codes so the
// apps render a specific sheet instead of a dead button (SPEC §6).

import { isMeraError } from "@category-labs/mera";

export type IdentityErrorCode =
  /** `PublicKeyCredential` is missing (old browser, some webviews). */
  | "WEBAUTHN_UNAVAILABLE"
  /** Page is not a secure context (plain http on a non-localhost host). */
  | "NOT_SECURE_CONTEXT"
  /** The authenticator does not expose the WebAuthn PRF extension. */
  | "PRF_UNAVAILABLE"
  /** The ceremony ran and failed or was cancelled; `causeName` holds the DOMException name and `ms` the time it took. */
  | "CEREMONY_FAILED"
  /** A discoverable ceremony was answered by a different passkey than the one expected (same-passkey rule). */
  | "DIFFERENT_PASSKEY"
  /** A signing session was used after `end()`. */
  | "SESSION_ENDED"
  /** A signing session was used after `expiresAt`; it has been ended for you. */
  | "SESSION_EXPIRED"
  /** AES-GCM authentication failed: another passkey, another namespace, or a tampered blob. */
  | "DECRYPT_FAILED"
  /** The blob string is not `v1.<iv>.<ciphertext>` with canonical base64url parts. */
  | "BLOB_FORMAT_INVALID"
  /** The entry-code string could not be parsed. */
  | "CODE_FORMAT_INVALID"
  /** No valid secp256k1 scalar after `DOOR_MAX_COUNTER` HKDF attempts (probability ≈ 2^-1024). */
  | "DERIVATION_FAILED"
  /** The runtime lacks `crypto.subtle` or `crypto.getRandomValues`. */
  | "CRYPTO_UNAVAILABLE"
  /** A caller-supplied value failed validation. */
  | "INPUT_INVALID";

export type IdentityErrorOptions = {
  cause?: unknown;
  /** Elapsed milliseconds of the failed ceremony, when one ran. */
  ms?: number;
  details?: Readonly<Record<string, unknown>>;
};

export class IdentityError extends Error {
  readonly code: IdentityErrorCode;
  /** Elapsed milliseconds of the ceremony that failed (undefined when no ceremony ran). */
  readonly ms: number | undefined;
  /** DOMException name from the platform (`NotAllowedError`, `SecurityError`, `InvalidStateError`, …), when known. */
  readonly causeName: string | undefined;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(code: IdentityErrorCode, message: string, options: IdentityErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "IdentityError";
    this.code = code;
    this.ms = options.ms;
    this.details = options.details;
    this.causeName = domExceptionName(options.cause);
  }
}

export function isIdentityError(error: unknown): error is IdentityError {
  return error instanceof IdentityError;
}

/** Walks `cause` chains to find the platform DOMException name, if any. */
export function domExceptionName(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current !== null && typeof current === "object"; depth++) {
    const named = current as { name?: unknown; cause?: unknown };
    if (
      typeof named.name === "string" &&
      named.name.endsWith("Error") &&
      named.name !== "MeraError" &&
      named.name !== "IdentityError"
    ) {
      return named.name;
    }
    current = named.cause;
  }
  return undefined;
}

/** Maps a Mera error (or anything else thrown by a ceremony) to a designed state. */
export function fromCeremonyError(error: unknown, ms: number): IdentityError {
  if (isIdentityError(error)) return error;
  if (isMeraError(error)) {
    switch (error.code) {
      case "PRF_UNAVAILABLE":
        return new IdentityError("PRF_UNAVAILABLE", error.message, { cause: error, ms });
      case "PASSKEY_OPERATION_FAILED":
        return new IdentityError("CEREMONY_FAILED", error.message, { cause: error, ms });
      case "CRYPTO_UNAVAILABLE":
        return new IdentityError("CRYPTO_UNAVAILABLE", error.message, { cause: error, ms });
      case "SESSION_ENDED":
        return new IdentityError("SESSION_ENDED", error.message, { cause: error });
      case "DECRYPT_FAILED":
        return new IdentityError("DECRYPT_FAILED", error.message, { cause: error });
      case "INPUT_INVALID":
      case "VAULT_FORMAT_INVALID":
        return new IdentityError("INPUT_INVALID", error.message, { cause: error });
      default:
        return new IdentityError("CEREMONY_FAILED", error.message, { cause: error, ms });
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  return new IdentityError("CEREMONY_FAILED", message, { cause: error, ms });
}

/** Product copy per state — the apps render these verbatim (SPEC §6). Keep them short; they go in a sheet. */
export const USER_MESSAGES: Readonly<Record<IdentityErrorCode, { title: string; hint: string }>> = {
  WEBAUTHN_UNAVAILABLE: {
    title: "This browser can't use passkeys",
    hint: "Open Turnstile in Chrome, Safari or Edge — or on your phone.",
  },
  NOT_SECURE_CONTEXT: {
    title: "Passkeys need HTTPS",
    hint: "Open the https:// address of this page.",
  },
  PRF_UNAVAILABLE: {
    title: "This passkey provider can't derive keys",
    hint: "Use your phone (Android Chrome with Google Password Manager, or iPhone with iCloud Keychain), or Chrome signed in to Google Password Manager. 1Password and Windows Hello work too.",
  },
  CEREMONY_FAILED: {
    title: "Passkey prompt didn't complete",
    hint: "If you closed the sheet, try again. If nothing appeared, your passkey may live on another device — pick “Use a phone” in the sheet.",
  },
  DIFFERENT_PASSKEY: {
    title: "That's a different passkey",
    hint: "Pick the passkey you signed in with — its name (turnstile-…) is shown on your account page.",
  },
  SESSION_ENDED: {
    title: "Session ended",
    hint: "Confirm with your passkey again to continue.",
  },
  SESSION_EXPIRED: {
    title: "Session expired",
    hint: "Sessions last 15 minutes. Confirm with your passkey again to continue.",
  },
  DECRYPT_FAILED: {
    title: "This passport belongs to another passkey",
    hint: "Open it with the passkey you created it with.",
  },
  BLOB_FORMAT_INVALID: {
    title: "Passport data is damaged",
    hint: "The stored blob is not in a format Turnstile understands.",
  },
  CODE_FORMAT_INVALID: {
    title: "Not a Turnstile code",
    hint: "Scan the rotating code on the ticket screen.",
  },
  DERIVATION_FAILED: {
    title: "Key derivation failed",
    hint: "This should never happen. Try again; if it repeats, tell us.",
  },
  CRYPTO_UNAVAILABLE: {
    title: "This browser lacks Web Crypto",
    hint: "Update your browser or use another device.",
  },
  INPUT_INVALID: {
    title: "Invalid input",
    hint: "Something passed to the identity layer was malformed.",
  },
};
