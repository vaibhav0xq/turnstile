// The private passport, end to end: open the vault (one passkey prompt), fetch the blob the relayer holds
// for this account, decrypt it in memory; edits are encrypted with the vault key, signed with the account
// key and put back. Wipe the device, sign in anywhere, open the vault: the same name and notes come back.
import { passportSyncMessage } from "@turnstile/identity";
import { create } from "zustand";
import { useIdentity } from "../identity/store";
import { ApiError } from "../lib/api";
import { getPassport, putPassport } from "../relayer/client";
import { emptyPassport, type Passport, parsePassport, samePassport } from "./passport-model";

export type PassportStatus = "closed" | "opening" | "open" | "saving";

export interface PassportState {
  status: PassportStatus;
  /** Decrypted passport while open; null when closed. */
  data: Passport | null;
  /** When the relayer last accepted a write for this account (from the fetched record or our own put). */
  syncedAt: number | null;
  /** Address the open passport belongs to; closing on a different fan avoids showing someone else's notes. */
  owner: `0x${string}` | null;
  error: string | null;
  /** Sign in if needed, open the vault, fetch + decrypt. Resolves to the passport (empty when none stored). */
  open(): Promise<Passport>;
  /** Encrypt + sign + put. No-op when nothing changed. */
  save(next: Passport): Promise<void>;
  close(): void;
}

function explain(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "REPLAYED") return "Another device saved a newer passport — reopen to pick it up.";
    if (error.code === "STALE") return "This device's clock is off by more than five minutes.";
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

export const usePassport = create<PassportState>()((set, get) => ({
  status: "closed",
  data: null,
  syncedAt: null,
  owner: null,
  error: null,

  async open() {
    const identity = useIdentity.getState();
    set({ status: "opening", error: null });
    try {
      const fan = await identity.ensureFan();
      const vault = await identity.ensureVault();
      const record = await getPassport(fan.address);
      let data = emptyPassport();
      if (record) {
        data = parsePassport(await vault.decryptJson<unknown>(record.blob));
      }
      set({ status: "open", data, owner: fan.address, syncedAt: record?.updatedAt ?? null });
      return data;
    } catch (error) {
      set({ status: "closed", data: null, owner: null, error: explain(error) });
      throw error;
    }
  },

  async save(next) {
    const { data, owner, status } = get();
    if (status !== "open" || !owner) return;
    if (data && samePassport(data, next)) {
      set({ data: next });
      return;
    }
    set({ status: "saving", error: null });
    try {
      const identity = useIdentity.getState();
      const fan = await identity.ensureFan();
      if (fan.address !== owner) throw new Error("Signed in as a different passkey; reopen the passport.");
      const vault = await identity.ensureVault();
      const clean = parsePassport(next);
      const empty = clean.name === "" && Object.keys(clean.notes).length === 0;
      const blob = empty ? "" : await vault.encrypt(clean);
      const issuedAt = Date.now();
      const signature = await fan.account.signMessage({
        message: passportSyncMessage(fan.address, blob, issuedAt),
      });
      const result = await putPassport(fan.address, { blob, issuedAt, signature });
      set({ status: "open", data: clean, syncedAt: result.updatedAt });
    } catch (error) {
      set({ status: "open", error: explain(error) });
      throw error;
    }
  },

  close() {
    useIdentity.getState().closeVault();
    set({ status: "closed", data: null, owner: null, error: null });
  },
}));

// Closing the account session (End session / Forget this device) also closes the passport.
useIdentity.subscribe((state, previous) => {
  if (previous.fan && !state.fan && usePassport.getState().status !== "closed") {
    usePassport.setState({ status: "closed", data: null, owner: null, error: null });
  }
});
