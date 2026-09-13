import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fromHex, plainBuffer, utf8, utf8Decode } from "../src/encoding.ts";
import { isIdentityError } from "../src/errors.ts";
import {
  decryptBlob,
  decryptBlobJson,
  encryptBlob,
  encryptBlobWithIv,
  importVaultKey,
  parseBlob,
} from "../src/vault.ts";
import { kdfVector as V } from "./vectors.ts";

const vaultKey = () => importVaultKey(fromHex(V.vault.key));
const expectCode = (code: string) => (e: unknown) => isIdentityError(e) && e.code === code;

describe("passport blob format (vectors/kdf.json)", () => {
  it("decrypts the pinned blob to the pinned plaintext", async () => {
    const key = await vaultKey();
    assert.equal(utf8Decode(await decryptBlob(key, V.vault.blob)), V.vault.plaintextJson);
    assert.deepEqual(await decryptBlobJson(key, V.vault.blob), JSON.parse(V.vault.plaintextJson));
  });

  it("re-encrypts the pinned plaintext under the pinned IV to the identical blob (format is frozen)", async () => {
    const key = await vaultKey();
    const blob = await encryptBlobWithIv(key, utf8(V.vault.plaintextJson), fromHex(V.vault.iv));
    assert.equal(blob, V.vault.blob);
  });

  it("parses v1.<iv>.<ciphertext> and nothing else", () => {
    const parsed = parseBlob(V.vault.blob);
    assert.equal(parsed.version, "v1");
    assert.equal(parsed.iv.length, 12);
    const [, iv, ct] = V.vault.blob.split(".") as [string, string, string];
    const bad = [
      "",
      "v1",
      `v2.${iv}.${ct}`,
      `v1..${ct}`,
      `v1.${iv}.`,
      `v1.${iv}=.${ct}`, // padding → non-canonical
      `v1.${iv}.${ct}.more`,
      `v1.AAAA.${ct}`, // 3-byte iv
      `v1.${iv}.AAAA`, // no room for a tag
      `v1.${iv}.${ct.replace(/-/g, "+")}`, // wrong alphabet
    ];
    for (const blob of bad) assert.throws(() => parseBlob(blob), expectCode("BLOB_FORMAT_INVALID"), blob);
  });

  it("importVaultKey zeroises the raw key bytes and refuses wrong lengths", async () => {
    const raw = fromHex(V.vault.key);
    await importVaultKey(raw);
    assert.ok(raw.every((b) => b === 0));
    await assert.rejects(importVaultKey(new Uint8Array(16)), expectCode("INPUT_INVALID"));
  });
});

describe("encrypt / decrypt", () => {
  it("round-trips bytes, strings and objects with a fresh IV each time", async () => {
    const key = await vaultKey();
    const a = await encryptBlob(key, { hello: "world" });
    const b = await encryptBlob(key, { hello: "world" });
    assert.notEqual(a, b, "IVs must differ");
    assert.deepEqual(await decryptBlobJson(key, a), { hello: "world" });
    assert.deepEqual(await decryptBlobJson(key, b), { hello: "world" });
    assert.equal(utf8Decode(await decryptBlob(key, await encryptBlob(key, "plain text"))), "plain text");
    const bytes = Uint8Array.from([1, 2, 3]);
    assert.deepEqual(await decryptBlob(key, await encryptBlob(key, bytes)), bytes);
  });

  it("fails closed on tampering, on another key, and on another AAD", async () => {
    const key = await vaultKey();
    const blob = await encryptBlob(key, { secret: 1 });
    const [v, iv, ct] = blob.split(".") as [string, string, string];

    // Flip a character in the middle of the ciphertext: every bit of a middle base64url character is
    // significant (the last one carries padding bits that decoders ignore, which would make this flaky).
    const at = 5;
    const flipped = `${v}.${iv}.${ct.slice(0, at)}${ct[at] === "A" ? "B" : "A"}${ct.slice(at + 1)}`;
    await assert.rejects(decryptBlob(key, flipped), expectCode("DECRYPT_FAILED"));

    const otherIv = `${v}.${iv.slice(0, -1)}${iv.endsWith("A") ? "B" : "A"}.${ct}`;
    await assert.rejects(decryptBlob(key, otherIv), expectCode("DECRYPT_FAILED"));

    const otherKey = await importVaultKey(
      fromHex(V.vault.key.replace(/.$/, V.vault.key.endsWith("0") ? "1" : "0")),
    );
    await assert.rejects(decryptBlob(otherKey, blob), expectCode("DECRYPT_FAILED"));

    // Same key, same IV, but encrypted under a different AAD (as a naive client might) → must not open.
    const raw = await crypto.subtle.importKey(
      "raw",
      plainBuffer(fromHex(V.vault.key)),
      { name: "AES-GCM" },
      false,
      ["encrypt"],
    );
    const foreign = new Uint8Array(
      await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: plainBuffer(fromHex(V.vault.iv)),
          additionalData: plainBuffer(utf8("other/aad")),
        },
        raw,
        plainBuffer(utf8("{}")),
      ),
    );
    const foreignBlob = `v1.${V.vault.blob.split(".")[1]}.${Buffer.from(foreign).toString("base64url")}`;
    await assert.rejects(decryptBlob(key, foreignBlob), expectCode("DECRYPT_FAILED"));
  });

  it("reports non-JSON plaintext as a format error, not a crypto error", async () => {
    const key = await vaultKey();
    await assert.rejects(
      decryptBlobJson(key, await encryptBlob(key, "not json")),
      expectCode("BLOB_FORMAT_INVALID"),
    );
  });
});
