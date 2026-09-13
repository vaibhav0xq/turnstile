import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSecp256k1SigningSession } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { encodeAbiParameters, hexToBytes, keccak256, stringToHex } from "viem";
import {
  BIND_TYPEHASH,
  BIND_TYPES,
  type BindDoorKeyMessage,
  bindDoorKeyDigest,
  bindDoorKeyHashes,
  bindDoorKeyTypedData,
  recoverBindSigner,
} from "../src/bind.ts";
import { entryHashes } from "../src/entry.ts";
import { isIdentityError } from "../src/errors.ts";
import type { EventRef } from "../src/kdf.ts";
import { entryVector as E, kdfVector as K, bindVector as V } from "./vectors.ts";

const event: EventRef = { chainId: V.domain.chainId, eventAddress: V.domain.verifyingContract };
const message: BindDoorKeyMessage = {
  tokenId: BigInt(V.message.tokenId),
  doorKey: V.message.doorKey,
  nonce: BigInt(V.message.nonce),
  deadline: BigInt(V.message.deadline),
};

describe("EIP-712 BindDoorKey (vectors/bind.json)", () => {
  it("has the pinned type string and type hash", () => {
    assert.equal(V.typeString, "BindDoorKey(uint256 tokenId,address doorKey,uint256 nonce,uint256 deadline)");
    assert.equal(BIND_TYPEHASH, keccak256(stringToHex(V.typeString)));
    assert.equal(BIND_TYPEHASH, V.typeHash);
    assert.deepEqual(
      BIND_TYPES.BindDoorKey.map((f) => `${f.type} ${f.name}`),
      ["uint256 tokenId", "address doorKey", "uint256 nonce", "uint256 deadline"],
    );
  });

  it("ties the vector together: same event as Entry, door key from kdf, signer = account key", () => {
    assert.deepEqual(V.domain, E.domain);
    assert.equal(V.domainSeparator, E.domainSeparator);
    assert.equal(V.message.tokenId, E.message.tokenId);
    assert.equal(V.message.doorKey, K.door[0]?.address);
    assert.equal(V.message.doorKey, E.signer);
    assert.equal(V.signer, K.account.address);
    assert.equal(V.signerPrivateKey, K.account.privateKey);
  });

  it("reproduces structHash and digest — recomputed by hand the way Solidity does", () => {
    const structHash = keccak256(
      encodeAbiParameters(
        [
          { type: "bytes32" },
          { type: "uint256" },
          { type: "address" },
          { type: "uint256" },
          { type: "uint256" },
        ],
        [BIND_TYPEHASH, message.tokenId, message.doorKey, message.nonce, message.deadline],
      ),
    );
    assert.equal(structHash, V.structHash);
    const digest = keccak256(`0x1901${V.domainSeparator.slice(2)}${structHash.slice(2)}`);
    assert.equal(digest, V.digest);

    const hashes = bindDoorKeyHashes(event, message);
    assert.deepEqual(hashes, {
      typeHash: V.typeHash,
      domainSeparator: V.domainSeparator,
      structHash: V.structHash,
      digest: V.digest,
    });
    assert.equal(bindDoorKeyDigest(event, message), V.digest);
    assert.equal(
      entryHashes(event, { eventId: 1n, tokenId: 42n, slot: 59_640_000n }).domainSeparator,
      V.domainSeparator,
    );
  });

  it("the account key signs it deterministically and the signature recovers to the holder", async () => {
    const session = createSecp256k1SigningSession({ privateKey: hexToBytes(V.signerPrivateKey) });
    try {
      const signature = await toViemAccount(session).signTypedData(bindDoorKeyTypedData(event, message));
      assert.equal(signature, V.signature);
      assert.equal(await recoverBindSigner(event, message, signature), V.signer);
      assert.equal(signature.length, 2 + 130);
      assert.ok([27, 28].includes(V.v));
    } finally {
      session.end();
    }
  });

  it("a different nonce, deadline or door key changes the digest (no replay across binds)", () => {
    const base = bindDoorKeyDigest(event, message);
    assert.notEqual(bindDoorKeyDigest(event, { ...message, nonce: 1n }), base);
    assert.notEqual(bindDoorKeyDigest(event, { ...message, deadline: message.deadline + 1n }), base);
    assert.notEqual(
      bindDoorKeyDigest(event, { ...message, doorKey: K.door[1]?.address as `0x${string}` }),
      base,
    );
    assert.notEqual(bindDoorKeyDigest({ ...event, chainId: 143 }, message), base);
  });

  it("rejects malformed messages with INPUT_INVALID", () => {
    const expectInvalid = (fn: () => unknown) => {
      try {
        fn();
        assert.fail("expected INPUT_INVALID");
      } catch (error) {
        assert.ok(isIdentityError(error) && error.code === "INPUT_INVALID", String(error));
      }
    };
    expectInvalid(() => bindDoorKeyTypedData(event, { ...message, doorKey: `0x${"0".repeat(40)}` }));
    expectInvalid(() => bindDoorKeyTypedData(event, { ...message, doorKey: "0x1234" as `0x${string}` }));
    expectInvalid(() => bindDoorKeyTypedData(event, { ...message, tokenId: -1n }));
    expectInvalid(() => bindDoorKeyTypedData(event, { ...message, nonce: 1n << 256n }));
    expectInvalid(() => bindDoorKeyTypedData(event, { ...message, deadline: 5 as unknown as bigint }));
  });
});
