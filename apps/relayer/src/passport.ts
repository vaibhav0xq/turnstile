// The private passport store (identity SPEC §4.6): ciphertext blobs keyed by account, written only with the
// account key's signature, watermarked so an old capture cannot roll a passport back. The relayer holds no
// key and can read nothing; a JSON file is persistence enough for one relayer process.
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

export type PassportResult = { status: number; body: unknown };

const fail = (status: number, code: string, message: string): PassportResult => ({
  status,
  body: { error: { code, message } },
});

export class PassportStore {
  private readonly records = new Map<string, PassportRecord>();
  private readonly file: string | null;

  constructor(file: string | null) {
    this.file = file;
    if (file && existsSync(file)) {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as Record<string, PassportRecord>;
      for (const [address, record] of Object.entries(parsed)) this.records.set(address, record);
    }
  }

  /** The stored blob for an account, or undefined when nothing (readable) is there. */
  get(address: string): PassportRecord | undefined {
    if (!isAddress(address)) return undefined;
    const record = this.records.get(getAddress(address));
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
    const previous = this.records.get(owner);
    if (previous && body.issuedAt <= previous.issuedAt) {
      return fail(409, "REPLAYED", "a newer passport is already stored for this account");
    }
    const message = passportSyncMessage(owner, body.blob, body.issuedAt);
    let valid = false;
    try {
      valid = await verifyMessage({ address: owner, message, signature: body.signature });
    } catch {
      valid = false;
    }
    if (!valid) return fail(401, "NOT_OWNER", "the signature is not from this account's key");
    const record: PassportRecord = { blob: body.blob, issuedAt: body.issuedAt, updatedAt: now };
    this.records.set(owner, record);
    this.persist();
    return { status: 200, body: { ok: true, updatedAt: now, cleared: body.blob === "" } };
  }

  get size(): number {
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
