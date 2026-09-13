// Ceremony layer: one WebAuthn PRF ceremony per call, one prompt each. Wraps @category-labs/mera 0.2.0
// (pinned) so a Mera API change is a one-file fix. Ceremonies are DISCOVERABLE: the app never passes
// `allowCredentials`; "same passkey as sign-in" is enforced afterwards by credential-id equality
// (SPEC §3, docs/mera-spike-report.md §3). `webAuthnClient` is injectable, which is how the unit tests
// run every flow without a browser.

import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  type PasskeyCredentialMetadata,
  type Secp256k1SigningSession,
  type WebAuthnClient,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import type { Address, Hex, LocalAccount } from "viem";
import {
  ACCOUNT_SESSION_TTL_MS,
  DOOR_SESSION_TTL_MS,
  PRESENCE_SALT,
  SLOT_MS,
  VAULT_SALT,
} from "./constants.ts";
import { zeroize } from "./encoding.ts";
import { currentSlot, type EntryMessage, encodeEntryCode, entryDigest, entryTypedData } from "./entry.ts";
import { fromCeremonyError, IdentityError } from "./errors.ts";
import {
  accountKeyFromPrf,
  accountMnemonicFromPrf,
  doorKeyFromPrf,
  type EventRef,
  vaultKeyBytesFromPrf,
} from "./kdf.ts";
import { decryptBlob, decryptBlobJson, encryptBlob, importVaultKey } from "./vault.ts";

export type { WebAuthnClient } from "@category-labs/mera";

/** Public identifier of a passkey: credential id (base64url) and, when known, its transports. Never secret. */
export type PasskeyRef = PasskeyCredentialMetadata;

export type CeremonyOptions = {
  /** Relying-party id — the host passkeys are bound to. Production value is fixed for the life of the product. */
  readonly rpId: string;
  /** WebAuthn timeout in ms; platform default when omitted. */
  readonly timeout?: number;
  /** Injectable WebAuthn transport (tests, React Native). Browser default when omitted. */
  readonly webAuthnClient?: WebAuthnClient;
  /** Clock used for session lifetimes. Tests inject one. */
  readonly now?: () => number;
};

type NamespaceOptions = CeremonyOptions & {
  /**
   * Credential id the ceremony must be answered by (the sign-in credential). A different passkey → `DIFFERENT_PASSKEY`.
   * Omit only when there is nothing to compare against (e.g. a door key derived without a prior sign-in).
   */
  readonly expectCredentialId?: string;
};

// ------------------------------------------------------------------ sessions

export type AccountSession = {
  readonly kind: "account";
  readonly address: Address;
  readonly credentialId: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  /** viem local account backed by the in-memory key; signing never shows a prompt. */
  readonly account: LocalAccount<"mera">;
  readonly ended: boolean;
  /** Zeroises the key. Idempotent. */
  end(): void;
  [Symbol.dispose](): void;
};

export type SignedEntry = {
  readonly message: EntryMessage;
  readonly digest: Hex;
  readonly signature: Hex;
  /** Unix ms when this slot ends and the ticket screen should rotate to the next code. */
  readonly slotEndsAt: number;
};

export type DoorSession = {
  readonly kind: "door";
  /** The door key's address — what `bindDoorKey` stores and `checkIn` recovers. */
  readonly address: Address;
  readonly credentialId: string;
  readonly event: EventRef;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly ended: boolean;
  signEntry(input: { eventId: bigint; tokenId: bigint; slot?: bigint }): Promise<SignedEntry>;
  /** `signEntry` rendered as the scannable `TS1|…` string. */
  code(input: { eventId: bigint; tokenId: bigint; slot?: bigint }): Promise<string>;
  end(): void;
  [Symbol.dispose](): void;
};

export type Vault = {
  readonly kind: "vault";
  readonly credentialId: string;
  readonly closed: boolean;
  encrypt(plaintext: Uint8Array | string | object): Promise<string>;
  decrypt(blob: string): Promise<Uint8Array>;
  decryptJson<T = unknown>(blob: string): Promise<T>;
  /** Drops the key reference (a non-extractable CryptoKey cannot be zeroised, only released). */
  close(): void;
};

export type SignInResult = {
  readonly credential: PasskeyRef;
  readonly account: AccountSession;
  /** Wall time of the ceremony (both prompts, when creation needed a fallback assertion). */
  readonly ms: number;
  readonly created: boolean;
};

// ------------------------------------------------------------------ ceremonies

export type CreateIdentityOptions = CeremonyOptions & {
  readonly rpName?: string;
  /** Shown in the passkey sheet. Defaults: `turnstile-<random>` / `Turnstile`. */
  readonly user?: { readonly name?: string; readonly displayName?: string };
  readonly sessionTtlMs?: number;
};

/** Creates a passkey (PRF required) and opens a 15-minute account session. One prompt (two on authenticators without create-time PRF). */
export async function createIdentity(options: CreateIdentityOptions): Promise<SignInResult> {
  preflight(options);
  const now = options.now ?? Date.now;
  const t0 = performance.now();
  try {
    const created = await createPasskeyWithPrfOutput({
      rp: { id: options.rpId, name: options.rpName ?? "Turnstile" },
      user: {
        name: options.user?.name ?? `turnstile-${randomTag()}`,
        displayName: options.user?.displayName ?? "Turnstile",
      },
      ...(options.timeout !== undefined ? { timeout: options.timeout } : {}),
      ...(options.webAuthnClient !== undefined ? { webAuthnClient: options.webAuthnClient } : {}),
    });
    const ms = performance.now() - t0;
    const credential: PasskeyRef = {
      credentialId: created.credentialId,
      ...(created.transports !== undefined ? { transports: created.transports } : {}),
    };
    zeroize(created.prfSalt);
    const account = accountSessionFromPrf(
      created.prfOutput,
      credential.credentialId,
      now,
      options.sessionTtlMs,
    );
    return { credential, account, ms, created: true };
  } catch (error) {
    throw fromCeremonyError(error, performance.now() - t0);
  }
}

export type SignInOptions = CeremonyOptions & {
  /**
   * Optional pre-selection hint (`allowCredentials`). Discouraged: it proves nothing the credential-id
   * comparison does not, and it failed on Android Chrome + GPM in the spike (docs/device-matrix.md).
   */
  readonly hint?: PasskeyRef;
  readonly sessionTtlMs?: number;
};

/** Discoverable sign-in: the platform lists the passkeys for `rpId`; the user picks one. One prompt. */
export async function signIn(options: SignInOptions): Promise<SignInResult> {
  const now = options.now ?? Date.now;
  const { prfOutput, credentialId, ms } = await assertion(options, undefined, options.hint);
  const account = accountSessionFromPrf(prfOutput, credentialId, now, options.sessionTtlMs);
  return { credential: { credentialId }, account, ms, created: false };
}

export type DeriveDoorKeyOptions = NamespaceOptions & {
  readonly event: EventRef;
  readonly sessionTtlMs?: number;
};

/** Presence ceremony → per-event door session (≤ 60 min). Deliberately a fresh biometric: presence is the claim. */
export async function deriveDoorKey(options: DeriveDoorKeyOptions): Promise<DoorSession> {
  const now = options.now ?? Date.now;
  const { prfOutput, credentialId } = await assertion(
    options,
    PRESENCE_SALT,
    undefined,
    options.expectCredentialId,
  );
  const key = doorKeyFromPrf(prfOutput, options.event);
  const session = createSecp256k1SigningSession({ privateKey: key });
  zeroize(key);
  return doorSession(session, credentialId, options.event, now, options.sessionTtlMs ?? DOOR_SESSION_TTL_MS);
}

/** Vault ceremony → AES-256-GCM passport key, in memory until `close()`. */
export async function openVault(options: NamespaceOptions): Promise<Vault> {
  const { prfOutput, credentialId } = await assertion(
    options,
    VAULT_SALT,
    undefined,
    options.expectCredentialId,
  );
  let key: CryptoKey | null = await importVaultKey(vaultKeyBytesFromPrf(prfOutput));
  const live = (): CryptoKey => {
    if (!key) throw new IdentityError("SESSION_ENDED", "vault is closed");
    return key;
  };
  return {
    kind: "vault",
    credentialId,
    get closed() {
      return key === null;
    },
    encrypt: async (plaintext) => encryptBlob(live(), plaintext),
    decrypt: async (blob) => decryptBlob(live(), blob),
    decryptJson: async <T>(blob: string) => decryptBlobJson<T>(live(), blob),
    close() {
      key = null;
    },
  };
}

/** Account ceremony → BIP-39 phrase for import into MetaMask/Rabby. Returns the phrase and nothing else. */
export async function exportRecoveryPhrase(
  options: NamespaceOptions,
): Promise<{ mnemonic: string; credentialId: string; ms: number }> {
  const { prfOutput, credentialId, ms } = await assertion(
    options,
    undefined,
    undefined,
    options.expectCredentialId,
  );
  return { mnemonic: accountMnemonicFromPrf(prfOutput), credentialId, ms };
}

/**
 * Runs `fn` with a live account session. Ended → `SESSION_ENDED`; past `expiresAt` → the session is ended
 * and `SESSION_EXPIRED` is thrown. Mera's own `SESSION_ENDED` from inside `fn` is mapped too. The session is
 * NOT ended afterwards — it lives for its TTL so several relayed calls cost one prompt.
 */
export async function withAccountSession<T>(
  session: AccountSession,
  fn: (account: LocalAccount<"mera">, session: AccountSession) => Promise<T>,
  options: { readonly now?: () => number } = {},
): Promise<T> {
  const now = options.now ?? Date.now;
  if (session.ended) throw new IdentityError("SESSION_ENDED", "account session has ended");
  if (now() >= session.expiresAt) {
    session.end();
    throw new IdentityError("SESSION_EXPIRED", "account session has expired");
  }
  try {
    return await fn(session.account, session);
  } catch (error) {
    throw fromCeremonyError(error, 0);
  }
}

// ------------------------------------------------------------------ internals

type Ceremony = { prfOutput: Uint8Array; credentialId: string; ms: number };

async function assertion(
  options: CeremonyOptions,
  prfSalt: Uint8Array | undefined,
  hint?: PasskeyRef,
  expectCredentialId?: string,
): Promise<Ceremony> {
  preflight(options);
  const t0 = performance.now();
  let result: Awaited<ReturnType<typeof getPasskeyPrfOutput>>;
  try {
    result = await getPasskeyPrfOutput({
      rpId: options.rpId,
      ...(prfSalt !== undefined ? { prfSalt: new Uint8Array(prfSalt) } : {}),
      ...(hint !== undefined ? { credential: hint } : {}),
      ...(options.timeout !== undefined ? { timeout: options.timeout } : {}),
      ...(options.webAuthnClient !== undefined ? { webAuthnClient: options.webAuthnClient } : {}),
    });
  } catch (error) {
    throw fromCeremonyError(error, performance.now() - t0);
  }
  const ms = performance.now() - t0;
  if (expectCredentialId !== undefined && result.credentialId !== expectCredentialId) {
    zeroize(result.prfOutput);
    throw new IdentityError("DIFFERENT_PASSKEY", "a different passkey answered the ceremony", {
      ms,
      details: { expected: expectCredentialId, answered: result.credentialId },
    });
  }
  return { prfOutput: result.prfOutput, credentialId: result.credentialId, ms };
}

/** Browser sanity checks. Skipped when a client is injected — the caller owns that environment. */
function preflight(options: CeremonyOptions): void {
  if (options.webAuthnClient !== undefined) return;
  const g = globalThis as { isSecureContext?: boolean; PublicKeyCredential?: unknown };
  if (g.isSecureContext === false) {
    throw new IdentityError("NOT_SECURE_CONTEXT", "WebAuthn requires a secure context (https or localhost)");
  }
  if (typeof g.PublicKeyCredential === "undefined") {
    throw new IdentityError(
      "WEBAUTHN_UNAVAILABLE",
      "PublicKeyCredential is not available in this environment",
    );
  }
}

function accountSessionFromPrf(
  prfOutput: Uint8Array,
  credentialId: string,
  now: () => number,
  ttlMs: number = ACCOUNT_SESSION_TTL_MS,
): AccountSession {
  const key = accountKeyFromPrf(prfOutput);
  const session = createSecp256k1SigningSession({ privateKey: key });
  zeroize(key);
  const account = toViemAccount(session);
  const createdAt = now();
  const lifecycle = sessionLifecycle(session);
  return {
    kind: "account",
    address: account.address,
    credentialId,
    createdAt,
    expiresAt: createdAt + ttlMs,
    account,
    get ended() {
      return lifecycle.ended();
    },
    end: lifecycle.end,
    [Symbol.dispose]: lifecycle.end,
  };
}

function doorSession(
  session: Secp256k1SigningSession,
  credentialId: string,
  event: EventRef,
  now: () => number,
  ttlMs: number,
): DoorSession {
  const account = toViemAccount(session);
  const createdAt = now();
  const expiresAt = createdAt + ttlMs;
  const lifecycle = sessionLifecycle(session);
  const signEntry: DoorSession["signEntry"] = async ({ eventId, tokenId, slot }) => {
    if (lifecycle.ended()) throw new IdentityError("SESSION_ENDED", "door session has ended");
    if (now() >= expiresAt) {
      lifecycle.end();
      throw new IdentityError("SESSION_EXPIRED", "door session has expired");
    }
    const message: EntryMessage = { eventId, tokenId, slot: slot ?? currentSlot(now()) };
    const typed = entryTypedData(event, message);
    let signature: Hex;
    try {
      signature = await account.signTypedData(typed);
    } catch (error) {
      throw fromCeremonyError(error, 0);
    }
    return {
      message,
      digest: entryDigest(event, message),
      signature,
      slotEndsAt: Number(message.slot + 1n) * SLOT_MS,
    };
  };
  return {
    kind: "door",
    address: account.address,
    credentialId,
    event,
    createdAt,
    expiresAt,
    get ended() {
      return lifecycle.ended();
    },
    signEntry,
    code: async (input) => {
      const signed = await signEntry(input);
      return encodeEntryCode({ event, message: signed.message, signature: signed.signature });
    },
    end: lifecycle.end,
    [Symbol.dispose]: lifecycle.end,
  };
}

function sessionLifecycle(session: Secp256k1SigningSession): { ended: () => boolean; end: () => void } {
  let ended = false;
  return {
    ended: () => ended,
    end: () => {
      if (ended) return;
      ended = true;
      session.end();
    },
  };
}

function randomTag(): string {
  const bytes = new Uint8Array(4);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
