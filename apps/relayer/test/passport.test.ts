import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { passportSyncMessage } from "@turnstile/identity";
import { privateKeyToAccount } from "viem/accounts";
import { PassportStore } from "../src/passport.ts";

const owner = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const other = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const BLOB = "v1.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBB";
const NOW = 1_800_000_000_000;

async function write(store: PassportStore, signer = owner, blob = BLOB, issuedAt = NOW, now = NOW) {
  const signature = await signer.signMessage({ message: passportSyncMessage(owner.address, blob, issuedAt) });
  return store.put(owner.address, { blob, issuedAt, signature }, now);
}

describe("passport store", () => {
  it("stores a blob signed by the account and serves it back", async () => {
    const store = new PassportStore(null);
    assert.equal(store.get(owner.address), undefined);
    const result = await write(store);
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.deepEqual(store.get(owner.address), { blob: BLOB, issuedAt: NOW, updatedAt: NOW });
    assert.equal(store.get(owner.address.toLowerCase()), store.get(owner.address));
  });

  it("rejects another key, a tampered blob, a stale clock and a replay", async () => {
    const store = new PassportStore(null);
    assert.equal((await write(store, other)).status, 401);
    const signature = await owner.signMessage({ message: passportSyncMessage(owner.address, BLOB, NOW) });
    const tampered = `${BLOB.slice(0, -1)}C`;
    assert.equal(
      (await store.put(owner.address, { blob: tampered, issuedAt: NOW, signature }, NOW)).status,
      401,
    );
    assert.equal((await write(store, owner, BLOB, NOW - 6 * 60_000)).status, 400);
    assert.equal((await write(store)).status, 200);
    assert.equal((await write(store)).status, 409, "same issuedAt again is a replay");
    assert.equal((await write(store, owner, BLOB, NOW - 1)).status, 409, "older issuedAt is a replay");
    assert.equal((await write(store, owner, BLOB, NOW + 1)).status, 200);
  });

  it("rejects malformed input without touching the signature", async () => {
    const store = new PassportStore(null);
    assert.equal((await store.put("0xnope", {}, NOW)).status, 400);
    assert.equal(
      (await store.put(owner.address, { blob: "v2.x.y", issuedAt: NOW, signature: "0x" }, NOW)).status,
      400,
    );
    assert.equal(
      (await store.put(owner.address, { blob: BLOB, issuedAt: "now", signature: "0x" }, NOW)).status,
      400,
    );
    assert.equal(
      (await store.put(owner.address, { blob: BLOB, issuedAt: NOW, signature: "nope" }, NOW)).status,
      400,
    );
  });

  it("clears with an empty blob but keeps the watermark, and survives a restart", async () => {
    const dir = mkdtempSync(join(tmpdir(), "passport-"));
    const file = join(dir, "nested", "passports.json");
    try {
      const store = new PassportStore(file);
      assert.equal((await write(store)).status, 200);
      assert.equal((await write(store, owner, "", NOW + 1)).status, 200);
      assert.equal(store.get(owner.address), undefined, "cleared passports read as absent");
      const again = new PassportStore(file);
      assert.equal(again.size, 1, "the tombstone persisted");
      assert.equal((await write(again, owner, BLOB, NOW)).status, 409, "an old capture cannot resurrect it");
      assert.equal((await write(again, owner, BLOB, NOW + 2)).status, 200);
      assert.equal(new PassportStore(file).get(owner.address)?.blob, BLOB);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
