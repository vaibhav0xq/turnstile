// One passkey, many keys — the app-side session store around @turnstile/identity.
//
//   fan   → 15-minute account session (viem LocalAccount) that signs forward requests and direct buys
//   doors → per-event door sessions (≤ 60 min) that sign the rotating entry codes
//   vault → the passport key (AES-256-GCM) that encrypts the private passport, open until closed
//
// Nothing here is persisted except the credential id (so the next visit knows to sign in rather than
// create) and the address it produced (to greet the fan before the ceremony). Keys live in memory only.
import {
  ACCOUNT_SESSION_TTL_MS,
  accountKeyFromPrf,
  createIdentity,
  DOOR_SESSION_TTL_MS,
  decryptBlobJson,
  deriveDoorKey,
  doorKeyFromPrf,
  type EventRef,
  encodeEntryCode,
  encryptBlob,
  entryTypedData,
  IdentityError,
  importVaultKey,
  openVault,
  signIn,
  toHex,
  USER_MESSAGES,
  vaultKeyBytesFromPrf,
} from "@turnstile/identity";
import { type Address, type Hex, hexToBytes, keccak256, type LocalAccount, stringToBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { create } from "zustand";

export interface FanSession {
  readonly address: Address;
  readonly credentialId: string;
  readonly expiresAt: number;
  readonly account: LocalAccount;
  readonly dev: boolean;
  end(): void;
}

export interface DoorKeySession {
  readonly address: Address;
  readonly expiresAt: number;
  readonly event: EventRef;
  code(input: { eventId: bigint; tokenId: bigint }): Promise<string>;
  end(): void;
}

export interface VaultSession {
  readonly credentialId: string;
  encrypt(plaintext: object): Promise<string>;
  decryptJson<T>(blob: string): Promise<T>;
  end(): void;
}

export type Busy = "create" | "signin" | "door" | "vault" | null;

const RP_ID: string = (import.meta.env["VITE_RP_ID"] as string | undefined) ?? window.location.hostname;
const LS_CRED = "turnstile.credentialId";
const LS_ADDR = "turnstile.address";
const LS_DEV = "turnstile.dev";

function eventKey(event: EventRef): string {
  return `${event.chainId}:${event.eventAddress.toLowerCase()}`;
}

export function readDevSeed(): string | null {
  if (!import.meta.env.DEV) return null;
  const q = new URLSearchParams(window.location.search).get("dev");
  if (q) {
    localStorage.setItem(LS_DEV, q);
    return q;
  }
  return localStorage.getItem(LS_DEV);
}

/** Dev-only identity: a deterministic PRF output run through the real KDF, so it behaves exactly like a passkey. */
function devPrf(seed: string): Uint8Array {
  return hexToBytes(keccak256(stringToBytes(`turnstile-dev-prf:${seed}`)));
}

function devFan(seed: string, now: number): FanSession {
  const prf = devPrf(seed);
  const key = toHex(accountKeyFromPrf(prf)) as Hex;
  const account = privateKeyToAccount(key);
  return {
    address: account.address,
    credentialId: `dev:${seed}`,
    expiresAt: now + ACCOUNT_SESSION_TTL_MS,
    account,
    dev: true,
    end() {},
  };
}

function devDoor(seed: string, event: EventRef, now: number): DoorKeySession {
  const prf = devPrf(seed);
  const key = toHex(doorKeyFromPrf(prf, event)) as Hex;
  const account = privateKeyToAccount(key);
  return {
    address: account.address,
    expiresAt: now + DOOR_SESSION_TTL_MS,
    event,
    async code({ eventId, tokenId }) {
      const slot = BigInt(Math.floor(Date.now() / 30_000));
      const message = { eventId, tokenId, slot };
      const typed = entryTypedData(event, message);
      const signature = await account.signTypedData(typed);
      return encodeEntryCode({ event, message, signature }, "base45");
    },
    end() {},
  };
}

async function devVault(seed: string): Promise<VaultSession> {
  const key = await importVaultKey(vaultKeyBytesFromPrf(devPrf(seed)));
  return {
    credentialId: `dev:${seed}`,
    encrypt: (plaintext) => encryptBlob(key, plaintext),
    decryptJson: <T>(blob: string) => decryptBlobJson<T>(key, blob),
    end() {},
  };
}

export interface IdentityState {
  rpId: string;
  fan: FanSession | null;
  doors: Record<string, DoorKeySession>;
  vault: VaultSession | null;
  knownCredentialId: string | null;
  knownAddress: Address | null;
  busy: Busy;
  lastCeremonyMs: number | null;
  devSeed: string | null;
  error: { code: string; title: string; hint: string } | null;

  /** Live account session or null (expired sessions are dropped lazily). */
  liveFan(): FanSession | null;
  liveDoor(event: EventRef): DoorKeySession | null;
  create(): Promise<FanSession>;
  signIn(): Promise<FanSession>;
  /** Sign in if a passkey is known on this device, otherwise create one. */
  ensureFan(): Promise<FanSession>;
  ensureDoor(event: EventRef): Promise<DoorKeySession>;
  /**
   * Derive this event's door key again (one passkey prompt) and replace the current session, expired or
   * not. The old session is kept until the new one exists, so a cancelled prompt loses nothing.
   */
  renewDoor(event: EventRef): Promise<DoorKeySession>;
  /** Vault ceremony (one more passkey prompt): the passport key stays open until `closeVault` or sign-out. */
  ensureVault(): Promise<VaultSession>;
  closeVault(): void;
  endSessions(): void;
  /** "Stateless test": forget everything this device knows. The passkey itself stays in the platform. */
  forgetDevice(): void;
  setDevSeed(seed: string | null): void;
  clearError(): void;
}

function describe(error: unknown): { code: string; title: string; hint: string } {
  if (error instanceof IdentityError) {
    const m = USER_MESSAGES[error.code];
    return { code: error.code, title: m.title, hint: m.hint };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { code: "UNKNOWN", title: "Something went wrong", hint: message };
}

export const useIdentity = create<IdentityState>()((set, get) => ({
  rpId: RP_ID,
  fan: null,
  doors: {},
  vault: null,
  knownCredentialId: localStorage.getItem(LS_CRED),
  knownAddress: localStorage.getItem(LS_ADDR) as Address | null,
  busy: null,
  lastCeremonyMs: null,
  devSeed: readDevSeed(),
  error: null,

  liveFan() {
    const { fan } = get();
    if (!fan) return null;
    if (fan.expiresAt <= Date.now()) {
      fan.end();
      set({ fan: null });
      return null;
    }
    return fan;
  },

  liveDoor(event) {
    const door = get().doors[eventKey(event)];
    if (!door) return null;
    if (door.expiresAt <= Date.now()) {
      door.end();
      set((s) => {
        const doors = { ...s.doors };
        delete doors[eventKey(event)];
        return { doors };
      });
      return null;
    }
    return door;
  },

  async create() {
    const { devSeed, rpId } = get();
    set({ busy: "create", error: null });
    try {
      if (devSeed) {
        const fan = devFan(devSeed, Date.now());
        remember(fan);
        set({ fan, knownCredentialId: fan.credentialId, knownAddress: fan.address, lastCeremonyMs: 0 });
        return fan;
      }
      const started = performance.now();
      const result = await createIdentity({
        rpId,
        rpName: "Turnstile",
        user: { name: `turnstile-${short()}` },
      });
      const fan = wrap(result.account);
      remember(fan);
      set({
        fan,
        knownCredentialId: fan.credentialId,
        knownAddress: fan.address,
        lastCeremonyMs: Math.round(performance.now() - started),
      });
      return fan;
    } catch (error) {
      set({ error: describe(error) });
      throw error;
    } finally {
      set({ busy: null });
    }
  },

  async signIn() {
    const { devSeed, rpId } = get();
    set({ busy: "signin", error: null });
    try {
      if (devSeed) {
        const fan = devFan(devSeed, Date.now());
        remember(fan);
        set({ fan, knownCredentialId: fan.credentialId, knownAddress: fan.address, lastCeremonyMs: 0 });
        return fan;
      }
      const started = performance.now();
      const result = await signIn({ rpId });
      const fan = wrap(result.account);
      remember(fan);
      set({
        fan,
        knownCredentialId: fan.credentialId,
        knownAddress: fan.address,
        lastCeremonyMs: Math.round(performance.now() - started),
      });
      return fan;
    } catch (error) {
      set({ error: describe(error) });
      throw error;
    } finally {
      set({ busy: null });
    }
  },

  async ensureFan() {
    const live = get().liveFan();
    if (live) return live;
    return get().knownCredentialId ? get().signIn() : get().create();
  },

  async ensureDoor(event) {
    const live = get().liveDoor(event);
    if (live) return live;
    return get().renewDoor(event);
  },

  async renewDoor(event) {
    const key = eventKey(event);
    const { devSeed, rpId } = get();
    const fan = get().liveFan();
    set({ busy: "door", error: null });
    try {
      let door: DoorKeySession;
      if (devSeed) {
        door = devDoor(devSeed, event, Date.now());
      } else {
        const session = await deriveDoorKey({
          rpId,
          event,
          ...(fan ? { expectCredentialId: fan.credentialId } : {}),
        });
        door = {
          address: session.address,
          expiresAt: session.expiresAt,
          event,
          code: (input) => session.code(input),
          end: () => session.end(),
        };
      }
      // Swap only once the new key exists: a cancelled prompt keeps whatever is left of the old session.
      get().doors[key]?.end();
      set((s) => ({ doors: { ...s.doors, [key]: door } }));
      return door;
    } catch (error) {
      set({ error: describe(error) });
      throw error;
    } finally {
      set({ busy: null });
    }
  },

  async ensureVault() {
    const open = get().vault;
    if (open) return open;
    const { devSeed, rpId } = get();
    const fan = get().liveFan();
    set({ busy: "vault", error: null });
    try {
      let vault: VaultSession;
      if (devSeed) {
        vault = await devVault(devSeed);
      } else {
        const session = await openVault({
          rpId,
          ...(fan ? { expectCredentialId: fan.credentialId } : {}),
        });
        vault = {
          credentialId: session.credentialId,
          encrypt: (plaintext) => session.encrypt(plaintext),
          decryptJson: <T>(blob: string) => session.decryptJson<T>(blob),
          end: () => session.close(),
        };
      }
      set({ vault });
      return vault;
    } catch (error) {
      set({ error: describe(error) });
      throw error;
    } finally {
      set({ busy: null });
    }
  },

  closeVault() {
    get().vault?.end();
    set({ vault: null });
  },

  endSessions() {
    const { fan, doors, vault } = get();
    fan?.end();
    for (const d of Object.values(doors)) d.end();
    vault?.end();
    set({ fan: null, doors: {}, vault: null });
  },

  forgetDevice() {
    get().endSessions();
    localStorage.removeItem(LS_CRED);
    localStorage.removeItem(LS_ADDR);
    set({ knownCredentialId: null, knownAddress: null });
  },

  setDevSeed(seed) {
    get().endSessions();
    if (seed) localStorage.setItem(LS_DEV, seed);
    else localStorage.removeItem(LS_DEV);
    set({ devSeed: seed });
  },

  clearError() {
    set({ error: null });
  },
}));

function wrap(session: {
  address: Address;
  credentialId: string;
  expiresAt: number;
  account: LocalAccount;
  end(): void;
}): FanSession {
  return {
    address: session.address,
    credentialId: session.credentialId,
    expiresAt: session.expiresAt,
    account: session.account,
    dev: false,
    end: () => session.end(),
  };
}

function remember(fan: FanSession) {
  localStorage.setItem(LS_CRED, fan.credentialId);
  localStorage.setItem(LS_ADDR, fan.address);
}

function short(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function toEventRef(chainId: number, eventAddress: Address): EventRef {
  return { chainId, eventAddress };
}
