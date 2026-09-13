import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { verifyMessage } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { isPassportBlobShape, PASSPORT_MAX_BYTES, passportSyncMessage } from "../src/passport.ts";

const ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

describe("passport sync message", () => {
  it("is deterministic, lowercases the address and hashes the blob", () => {
    const m = passportSyncMessage(ADDRESS, "v1.aaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbb", 1_700_000_000_000);
    assert.equal(
      m,
      [
        "turnstile/passport-sync/v1",
        "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266",
        "0x8239fe06df433bc38fa7f90cd3bc51ffc06007b10951279f05d8f2f5c67d918b",
        "1700000000000",
      ].join("\n"),
    );
    assert.equal(
      m,
      passportSyncMessage(
        ADDRESS.toLowerCase(),
        "v1.aaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbb",
        1_700_000_000_000,
      ),
    );
    assert.notEqual(m, passportSyncMessage(ADDRESS, "", 1_700_000_000_000));
  });

  it("verifies as an EIP-191 signature from the account key", async () => {
    const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
    const message = passportSyncMessage(account.address, "", Date.now());
    const signature = await account.signMessage({ message });
    assert.equal(await verifyMessage({ address: account.address, message, signature }), true);
    assert.equal(await verifyMessage({ address: ADDRESS, message: `${message}x`, signature }), false);
  });

  it("accepts the blob shape of §4.4 and the clear marker, rejects the rest", () => {
    assert.equal(isPassportBlobShape(""), true);
    assert.equal(isPassportBlobShape("v1.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBB"), true);
    assert.equal(isPassportBlobShape("v1.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBB"), false); // tag too short
    assert.equal(isPassportBlobShape("v2.AAAAAAAAAAAAAAAA.BBBBBBBBBBBBBBBBBBBBBB"), false);
    assert.equal(isPassportBlobShape("v1.AAAAAAAAAAAAAAAA.BBBB+BBBBBBBBBBBBBBBBBB"), false); // not base64url
    assert.equal(isPassportBlobShape(`v1.AAAAAAAAAAAAAAAA.${"B".repeat(PASSPORT_MAX_BYTES)}`), false);
    assert.equal(isPassportBlobShape(42), false);
  });
});
