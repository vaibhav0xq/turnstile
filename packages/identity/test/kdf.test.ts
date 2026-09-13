import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import { ACCOUNT_PATH, ACCOUNT_SALT, PRESENCE_SALT, VAULT_SALT } from "../src/constants.ts";
import { fromHex, toHex } from "../src/encoding.ts";
import { isIdentityError } from "../src/errors.ts";
import {
  accountKeyFromPrf,
  accountMnemonicFromPrf,
  addressOfPrivateKey,
  doorKeyFromPrf,
  doorKeyInfo,
  type EventRef,
  vaultKeyBytesFromPrf,
} from "../src/kdf.ts";
import { kdfVector as V } from "./vectors.ts";

const prf = () => fromHex(V.prfOutput);
const isZero = (b: Uint8Array) => b.every((x) => x === 0);

describe("namespace salts", () => {
  it("are three distinct 32-byte constants", () => {
    for (const salt of [ACCOUNT_SALT, PRESENCE_SALT, VAULT_SALT]) assert.equal(salt.length, 32);
    assert.notEqual(toHex(ACCOUNT_SALT), toHex(PRESENCE_SALT));
    assert.notEqual(toHex(PRESENCE_SALT), toHex(VAULT_SALT));
    assert.notEqual(toHex(ACCOUNT_SALT), toHex(VAULT_SALT));
    // Pinned hex (sha256sum of the labels), so a typo in a label cannot pass unnoticed. The account salt is
    // Mera's documented default, so the account is the same one any Mera app derives from this passkey.
    assert.equal(toHex(ACCOUNT_SALT), "0x896d46ac4ac191885c46137439db7bb52fb05cff3ecd34af7cdae0a1e0c00db9");
    assert.equal(toHex(PRESENCE_SALT), "0xab8908a017dca7fbd515aad0dcb7b2e546e26bfa155593c9aed0199ede76586a");
    assert.equal(toHex(VAULT_SALT), "0xc87e94ff48d4a9835af48022d3003397abfa6d9dcfd5293190ee5f72ebafb3f9");
  });
});

describe("account namespace (vectors/kdf.json)", () => {
  it("derives the pinned private key and address, and zeroises its input", () => {
    const input = prf();
    const key = accountKeyFromPrf(input);
    assert.equal(toHex(key), V.account.privateKey);
    assert.equal(addressOfPrivateKey(key), V.account.address);
    assert.ok(isZero(input), "PRF input must be zeroised");
  });

  it("derives the pinned mnemonic, and the mnemonic re-derives the same key through standard BIP-39/44", () => {
    const mnemonic = accountMnemonicFromPrf(prf());
    assert.equal(mnemonic, V.account.mnemonic);
    assert.equal(mnemonic.split(" ").length, 24);
    // Independent path: what MetaMask/Rabby would do with the exported phrase.
    const node = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic)).derive(ACCOUNT_PATH);
    assert.ok(node.privateKey);
    assert.equal(toHex(node.privateKey), V.account.privateKey);
  });

  it("rejects a PRF output that is not 32 bytes", () => {
    assert.throws(
      () => accountKeyFromPrf(new Uint8Array(31)),
      (e: unknown) => isIdentityError(e) && e.code === "INPUT_INVALID",
    );
  });
});

describe("presence namespace → door keys (vectors/kdf.json)", () => {
  it("derives the pinned key for each event with the pinned HKDF info", () => {
    for (const vector of V.door) {
      const event: EventRef = vector.event;
      assert.equal(doorKeyInfo(event, 0), vector.hkdf.info);
      const input = prf();
      const key = doorKeyFromPrf(input, event);
      assert.equal(toHex(key), vector.privateKey);
      assert.equal(addressOfPrivateKey(key), vector.address);
      assert.ok(isZero(input));
    }
  });

  it("is case-insensitive in the event address", () => {
    const base = V.door[0]?.event as EventRef;
    const upper: EventRef = {
      chainId: base.chainId,
      eventAddress: base.eventAddress.toUpperCase().replace("0X", "0x") as `0x${string}`,
    };
    assert.equal(toHex(doorKeyFromPrf(prf(), base)), toHex(doorKeyFromPrf(prf(), upper)));
  });

  it("changes with the chain id and with the event address", () => {
    const base = V.door[0]?.event as EventRef;
    const otherChain = doorKeyFromPrf(prf(), { ...base, chainId: base.chainId + 1 });
    const otherEvent = doorKeyFromPrf(prf(), {
      ...base,
      eventAddress: "0x000000000000000000000000000000000000E0E2",
    });
    const same = doorKeyFromPrf(prf(), base);
    assert.notEqual(toHex(otherChain), toHex(same));
    assert.notEqual(toHex(otherEvent), toHex(same));
  });

  it("rejects malformed events", () => {
    const bad = [
      { chainId: 0, eventAddress: "0x000000000000000000000000000000000000E0E1" },
      { chainId: 1.5, eventAddress: "0x000000000000000000000000000000000000E0E1" },
      { chainId: 1, eventAddress: "0x1234" },
    ] as EventRef[];
    for (const event of bad) {
      assert.throws(
        () => doorKeyFromPrf(prf(), event),
        (e: unknown) => isIdentityError(e) && e.code === "INPUT_INVALID",
      );
    }
  });
});

describe("vault namespace (vectors/kdf.json)", () => {
  it("derives the pinned AES key bytes and zeroises its input", () => {
    const input = prf();
    const key = vaultKeyBytesFromPrf(input);
    assert.equal(toHex(key), V.vault.key);
    assert.ok(isZero(input));
  });
});

describe("namespace separation", () => {
  it("account, door and vault keys from one PRF output are unrelated", () => {
    const account = toHex(accountKeyFromPrf(prf()));
    const door = toHex(doorKeyFromPrf(prf(), V.door[0]?.event as EventRef));
    const vault = toHex(vaultKeyBytesFromPrf(prf()));
    assert.equal(new Set([account, door, vault]).size, 3);
  });
});
