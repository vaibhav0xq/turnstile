// The Postgres backend against a real database: same contract as the file backend, plus the write-side
// watermark check that makes two relayer processes safe. Skipped without DATABASE_URL (CI has none).
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { passportSyncMessage } from "@turnstile/identity";
import { privateKeyToAccount } from "viem/accounts";
import { PassportStore } from "../src/passport.ts";
import { PostgresPassportBackend } from "../src/passport-postgres.ts";

const url = process.env["DATABASE_URL"];
// A throwaway account per run so parallel or repeated runs never collide on the primary key.
const owner = privateKeyToAccount(
  `0x${Array.from({ length: 64 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("")}`,
);
const BLOB = "v1.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBB";
const NOW = 1_800_000_000_000;

async function write(store: PassportStore, blob = BLOB, issuedAt = NOW, now = NOW) {
  const signature = await owner.signMessage({ message: passportSyncMessage(owner.address, blob, issuedAt) });
  return store.put(owner.address, { blob, issuedAt, signature }, now);
}

describe("passport store on postgres", { skip: url ? false : "DATABASE_URL not set" }, () => {
  let backend: PostgresPassportBackend;
  before(async () => {
    backend = await PostgresPassportBackend.open(url as string);
  });
  after(async () => {
    await backend.close();
  });

  it("stores, serves, clears and refuses replays across store instances", async () => {
    const store = new PassportStore(backend);
    assert.equal(await store.get(owner.address), undefined);
    assert.equal((await write(store)).status, 200);
    assert.deepEqual(await store.get(owner.address), { blob: BLOB, issuedAt: NOW, updatedAt: NOW });
    assert.equal((await write(store)).status, 409, "same issuedAt again is a replay");
    assert.equal((await write(store, "", NOW + 1)).status, 200);
    assert.equal(await store.get(owner.address), undefined, "cleared passports read as absent");
    assert.equal(await backend.get(owner.address).then((r) => r?.blob), "", "but the tombstone stays");
    const other = new PassportStore(backend);
    assert.equal((await write(other, BLOB, NOW)).status, 409, "an old capture cannot resurrect it");
    assert.equal((await write(other, BLOB, NOW + 2)).status, 200);
    assert.equal((await store.get(owner.address))?.blob, BLOB);
  });

  it("decides the watermark in the upsert, not in memory", async () => {
    const record = { blob: BLOB, issuedAt: NOW + 10, updatedAt: NOW + 10 };
    assert.equal(await backend.putIfNewer(owner.address, record), true);
    assert.equal(await backend.putIfNewer(owner.address, record), false, "equal issuedAt loses");
    assert.equal(await backend.putIfNewer(owner.address, { ...record, issuedAt: NOW + 9 }), false);
    assert.equal(await backend.putIfNewer(owner.address, { ...record, issuedAt: NOW + 11 }), true);
    assert.ok((await backend.count()) >= 1);
  });
});
