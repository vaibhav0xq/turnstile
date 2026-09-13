// The private passport store (identity SPEC §4.6): ciphertext blobs keyed by account, written only with the
// account key's signature, watermarked so an old capture cannot roll a passport back. The relayer holds no
// key and can read nothing. Where the blobs live is a backend concern: a JSON file is persistence enough for
// one relayer process, Postgres (`passport-postgres.ts`) is for hosts whose disk does not survive a deploy.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { isPassportBlobShape, PASSPORT_MAX_SKEW_MS, passportSyncMessage } from "@turnstile/identity";
import { type Address, getAddress, isAddress, isHex, verifyMessage } from "viem";

export interface PassportRecord {
  /** `""` is a tombstone: cleared, but the watermark stays. */
  blob: string;
  issuedAt: number;
  updatedAt: number;
}

/** Storage for records, tombstones included; addresses arrive checksummed. */
export interface PassportBackend {
  get(address: Address): Promise<PassportRecord | undefined>;
  /** Stores the record unless one with the same or a later `issuedAt` is already there; says whether it did. */
  putIfNewer(address: Address, record: PassportRecord): Promise<boolean>;
  count(): Promise<number>;
}

export type PassportResult = { status: number; body: unknown };

const fail = (status: number, code: string, message: string): PassportResult => ({
  status,
  body: { error: { code, message } },
});

/** In memory, optionally mirrored to a JSON file after every write (loaded once at start). */
export class FilePassportBackend implements PassportBackend {
  private readonly records = new Map<string, PassportRecord>();
  private readonly file: string | null;

  constructor(file: string | null) {
    this.file = file;
    if (file && existsSync(file)) {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as Record<string, PassportRecord>;
      for (const [address, record] of Object.entries(parsed)) this.records.set(address, record);
    }
  }

  async get(address: Address): Promise<PassportRecord | undefined> {
    return this.records.get(address);
  }

  async putIfNewer(address: Address, record: PassportRecord): Promise<boolean> {
    const previous = this.records.get(address);
    if (previous && record.issuedAt <= previous.issuedAt) return false;
    this.records.set(address, record);
    this.persist();
    return true;
  }

  async count(): Promise<number> {
    return this.records.size;
  }

  private persist(): void {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(Object.fromEntries(this.records)));
    renameSync(tmp, this.file);
  }
}

export class PassportStore {
  private readonly backend: PassportBackend;

  /** A backend, or the JSON file path for the built-in one (`null` = memory only). */
  constructor(backend: PassportBackend | string | null) {
    this.backend =
      typeof backend === "string" || backend === null ? new FilePassportBackend(backend) : backend;
  }

  /** The stored blob for an account, or undefined when nothing (readable) is there. */
  async get(address: string): Promise<PassportRecord | undefined> {
    if (!isAddress(address)) return undefined;
    const record = await this.backend.get(getAddress(address));
    return record && record.blob !== "" ? record : undefined;
  }

  async put(address: string, input: unknown, now = Date.now()): Promise<PassportResult> {
    if (!isAddress(address)) return fail(400, "BAD_ADDRESS", "Not an address");
    const owner: Address = getAddress(address);
    const body = (input ?? {}) as { blob?: unknown; issuedAt?: unknown; signature?: unknown };
    if (!isPassportBlobShape(body.blob)) {
      return fail(400, "BAD_BLOB", "blob must be a v1 passport blob of at most 16 KiB (or empty to clear)");
    }
    if (typeof body.issuedAt !== "number" || !Number.isSafeInteger(body.issuedAt)) {
      return fail(400, "BAD_ISSUED_AT", "issuedAt must be a millisecond timestamp");
    }
    if (Math.abs(body.issuedAt - now) > PASSPORT_MAX_SKEW_MS) {
      return fail(400, "STALE", "issuedAt is more than 5 minutes from the store's clock");
    }
    if (typeof body.signature !== "string" || !isHex(body.signature)) {
      return fail(400, "BAD_SIGNATURE", "signature must be hex");
    }
    const replayed = fail(409, "REPLAYED", "a newer passport is already stored for this account");
    // Cheap early exit; the backend repeats the comparison atomically when it writes.
    const previous = await this.backend.get(owner);
    if (previous && body.issuedAt <= previous.issuedAt) return replayed;
    const message = passportSyncMessage(owner, body.blob, body.issuedAt);
    let valid = false;
    try {
      valid = await verifyMessage({ address: owner, message, signature: body.signature });
    } catch {
      valid = false;
    }
    if (!valid) return fail(401, "NOT_OWNER", "the signature is not from this account's key");
    const record: PassportRecord = { blob: body.blob, issuedAt: body.issuedAt, updatedAt: now };
    if (!(await this.backend.putIfNewer(owner, record))) return replayed;
    return { status: 200, body: { ok: true, updatedAt: now, cleared: body.blob === "" } };
  }

  count(): Promise<number> {
    return this.backend.count();
  }
}
