// Ceremony flows against the in-memory authenticator: the exact user journeys from docs/device-matrix.md,
// including the failure states the product copy is written for.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import { privateKeyToAccount } from "viem/accounts";
import { ACCOUNT_PATH, ACCOUNT_SESSION_TTL_MS, DOOR_SESSION_TTL_MS, SLOT_MS } from "../src/constants.ts";
import { toHex } from "../src/encoding.ts";
import { decodeEntryCode, isSlotAcceptable, verifyEntry } from "../src/entry.ts";
import { isIdentityError } from "../src/errors.ts";
import {
  createIdentity,
  deriveDoorKey,
  exportRecoveryPhrase,
  openVault,
  signIn,
  withAccountSession,
} from "../src/identity.ts";
import type { EventRef } from "../src/kdf.ts";
import { FakeAuthenticator } from "./fake-authenticator.ts";

const rpId = "turnstile.test";
const event: EventRef = { chainId: 10143, eventAddress: "0x000000000000000000000000000000000000E0E1" };
const code = (c: string) => (e: unknown) => isIdentityError(e) && e.code === c;

function clock(start = 1_789_200_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("create → sign in", () => {
  it("creates a passkey with one prompt and opens an account session bound to that credential", async () => {
    const auth = new FakeAuthenticator();
    const c = clock();
    const { credential, account, ms, created } = await createIdentity({
      rpId,
      webAuthnClient: auth.client,
      now: c.now,
    });
    assert.equal(created, true);
    assert.equal(auth.prompts, 1);
    assert.ok(ms >= 0);
    assert.deepEqual(credential.transports, ["internal", "hybrid"]);
    assert.equal(credential.credentialId, auth.idOf(auth.store[0] as never));
    assert.equal(account.kind, "account");
    assert.match(account.address, /^0x[0-9a-fA-F]{40}$/);
    assert.equal(account.credentialId, credential.credentialId);
    assert.equal(account.expiresAt - account.createdAt, ACCOUNT_SESSION_TTL_MS);
    assert.equal(account.ended, false);
    account.end();
    assert.equal(account.ended, true);
  });

  it("falls back to a second prompt when the authenticator has no create-time PRF, with the same result", async () => {
    const auth = new FakeAuthenticator();
    auth.prfOnCreate = false;
    const created = await createIdentity({ rpId, webAuthnClient: auth.client });
    assert.equal(auth.prompts, 2);
    const again = await signIn({ rpId, webAuthnClient: auth.client });
    assert.equal(again.account.address, created.account.address);
  });

  it("discoverable sign-in (no allowCredentials) returns the same account and credential", async () => {
    const auth = new FakeAuthenticator();
    const created = await createIdentity({ rpId, webAuthnClient: auth.client });
    const back = await signIn({ rpId, webAuthnClient: auth.client });
    assert.equal(back.created, false);
    assert.equal(back.credential.credentialId, created.credential.credentialId);
    assert.equal(back.account.address, created.account.address);
    assert.equal(auth.prompts, 2);
  });

  it("stateless recovery: a second device with the synced passkey gets the same account, door key and vault", async () => {
    const phone = new FakeAuthenticator();
    const created = await createIdentity({ rpId, webAuthnClient: phone.client });
    const door1 = await deriveDoorKey({ rpId, webAuthnClient: phone.client, event });
    const vault1 = await openVault({ rpId, webAuthnClient: phone.client });
    const blob = await vault1.encrypt({ stubs: ["club-night"] });

    const laptop = new FakeAuthenticator(phone.store); // same credential, no local state
    const back = await signIn({ rpId, webAuthnClient: laptop.client });
    assert.equal(back.account.address, created.account.address);
    const door2 = await deriveDoorKey({ rpId, webAuthnClient: laptop.client, event });
    assert.equal(door2.address, door1.address);
    const vault2 = await openVault({ rpId, webAuthnClient: laptop.client });
    assert.deepEqual(await vault2.decryptJson(blob), { stubs: ["club-night"] });
  });
});

describe("door sessions", () => {
  it("derive a per-event key distinct from the account, sign Entry codes the gate can verify, and rotate per slot", async () => {
    const auth = new FakeAuthenticator();
    const c = clock();
    const { account, credential } = await createIdentity({ rpId, webAuthnClient: auth.client, now: c.now });
    const door = await deriveDoorKey({
      rpId,
      webAuthnClient: auth.client,
      event,
      expectCredentialId: credential.credentialId,
      now: c.now,
    });
    assert.equal(door.kind, "door");
    assert.notEqual(door.address, account.address);
    assert.equal(door.credentialId, credential.credentialId);
    assert.equal(door.expiresAt - door.createdAt, DOOR_SESSION_TTL_MS);

    const signed = await door.signEntry({ eventId: 1n, tokenId: 42n });
    assert.equal(signed.message.slot, BigInt(Math.floor(c.now() / SLOT_MS)));
    assert.equal(signed.slotEndsAt, Number(signed.message.slot + 1n) * SLOT_MS);
    assert.equal(await verifyEntry(event, signed.message, signed.signature, door.address), true);
    assert.equal(await verifyEntry(event, signed.message, signed.signature, account.address), false);
    assert.ok(isSlotAcceptable(signed.message.slot, c.now()));

    const text = await door.code({ eventId: 1n, tokenId: 42n });
    assert.ok(text.startsWith("TS3:"), "tickets render the base45 form by default");
    const decoded = decodeEntryCode(text);
    assert.equal(decoded.signature, signed.signature.toLowerCase());
    assert.equal(decoded.event.chainId, event.chainId);
    assert.ok((await door.code({ eventId: 1n, tokenId: 42n, form: "long" })).startsWith("TS1|"));
    assert.ok((await door.code({ eventId: 1n, tokenId: 42n, form: "compact" })).startsWith("TS2:"));

    c.advance(SLOT_MS);
    const next = await door.signEntry({ eventId: 1n, tokenId: 42n });
    assert.equal(next.message.slot, signed.message.slot + 1n);
    assert.notEqual(next.signature, signed.signature);

    // Same event key across two door ceremonies (deterministic), so a re-derive never invalidates a binding.
    const doorAgain = await deriveDoorKey({ rpId, webAuthnClient: auth.client, event, now: c.now });
    assert.equal(doorAgain.address, door.address);
    // Another event → another key.
    const other = await deriveDoorKey({
      rpId,
      webAuthnClient: auth.client,
      event: { ...event, eventAddress: "0x000000000000000000000000000000000000E0E2" },
    });
    assert.notEqual(other.address, door.address);
  });

  it("refuse a different passkey when one was expected (DIFFERENT_PASSKEY)", async () => {
    const auth = new FakeAuthenticator();
    const first = await createIdentity({ rpId, webAuthnClient: auth.client });
    await createIdentity({ rpId, webAuthnClient: auth.client }); // a second passkey on the same device; now selected
    await assert.rejects(
      deriveDoorKey({
        rpId,
        webAuthnClient: auth.client,
        event,
        expectCredentialId: first.credential.credentialId,
      }),
      (e: unknown) => {
        assert.ok(isIdentityError(e));
        assert.equal(e.code, "DIFFERENT_PASSKEY");
        assert.equal(e.details?.["expected"], first.credential.credentialId);
        assert.notEqual(e.details?.["answered"], first.credential.credentialId);
        return true;
      },
    );
    await assert.rejects(
      openVault({ rpId, webAuthnClient: auth.client, expectCredentialId: first.credential.credentialId }),
      code("DIFFERENT_PASSKEY"),
    );
  });

  it("expire and end with designed states", async () => {
    const auth = new FakeAuthenticator();
    const c = clock();
    await createIdentity({ rpId, webAuthnClient: auth.client });
    const door = await deriveDoorKey({
      rpId,
      webAuthnClient: auth.client,
      event,
      now: c.now,
      sessionTtlMs: 1_000,
    });
    await door.signEntry({ eventId: 1n, tokenId: 1n });
    c.advance(1_000);
    await assert.rejects(door.signEntry({ eventId: 1n, tokenId: 1n }), code("SESSION_EXPIRED"));
    assert.equal(door.ended, true);
    await assert.rejects(door.signEntry({ eventId: 1n, tokenId: 1n }), code("SESSION_ENDED"));

    const door2 = await deriveDoorKey({ rpId, webAuthnClient: auth.client, event });
    door2[Symbol.dispose]();
    await assert.rejects(door2.code({ eventId: 1n, tokenId: 1n }), code("SESSION_ENDED"));
  });
});

describe("account sessions", () => {
  it("sign without prompts while live; SESSION_EXPIRED ends them; SESSION_ENDED afterwards", async () => {
    const auth = new FakeAuthenticator();
    const c = clock();
    const { account } = await createIdentity({ rpId, webAuthnClient: auth.client, now: c.now });
    const sig = await withAccountSession(account, (a) => a.signMessage({ message: "gm" }), { now: c.now });
    assert.match(sig, /^0x[0-9a-f]{130}$/);
    assert.equal(auth.prompts, 1);

    c.advance(ACCOUNT_SESSION_TTL_MS);
    await assert.rejects(
      withAccountSession(account, (a) => a.signMessage({ message: "gm" }), { now: c.now }),
      code("SESSION_EXPIRED"),
    );
    assert.equal(account.ended, true);
    await assert.rejects(
      withAccountSession(account, (a) => a.signMessage({ message: "gm" }), { now: c.now }),
      code("SESSION_ENDED"),
    );
    // Mera's own error from a stale account object is mapped too.
    await assert.rejects(account.account.signMessage({ message: "gm" }));
  });

  it("the account matches the exported recovery phrase through a plain BIP-44 wallet", async () => {
    const auth = new FakeAuthenticator();
    const { account, credential } = await createIdentity({ rpId, webAuthnClient: auth.client });
    const { mnemonic, credentialId } = await exportRecoveryPhrase({
      rpId,
      webAuthnClient: auth.client,
      expectCredentialId: credential.credentialId,
    });
    assert.equal(credentialId, credential.credentialId);
    const node = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic)).derive(ACCOUNT_PATH);
    assert.ok(node.privateKey);
    assert.equal(privateKeyToAccount(toHex(node.privateKey)).address, account.address);
  });
});

describe("vault", () => {
  it("closes cleanly", async () => {
    const auth = new FakeAuthenticator();
    await createIdentity({ rpId, webAuthnClient: auth.client });
    const vault = await openVault({ rpId, webAuthnClient: auth.client });
    const blob = await vault.encrypt("x");
    assert.equal(vault.closed, false);
    vault.close();
    assert.equal(vault.closed, true);
    await assert.rejects(vault.decrypt(blob), code("SESSION_ENDED"));
  });
});

describe("failure states", () => {
  it("PRF_UNAVAILABLE when the authenticator cannot do PRF", async () => {
    const auth = new FakeAuthenticator();
    auth.prfSupported = false;
    await assert.rejects(createIdentity({ rpId, webAuthnClient: auth.client }), code("PRF_UNAVAILABLE"));
  });

  it("CEREMONY_FAILED keeps the DOMException name and the elapsed time", async () => {
    const auth = new FakeAuthenticator();
    await createIdentity({ rpId, webAuthnClient: auth.client });
    auth.failNextWith = "NotAllowedError";
    await assert.rejects(signIn({ rpId, webAuthnClient: auth.client }), (e: unknown) => {
      assert.ok(isIdentityError(e));
      assert.equal(e.code, "CEREMONY_FAILED");
      assert.equal(e.causeName, "NotAllowedError");
      assert.ok(typeof e.ms === "number" && e.ms >= 0);
      return true;
    });
  });

  it("a sign-in with no passkey for the rp fails as a ceremony failure, not a crash", async () => {
    const auth = new FakeAuthenticator();
    await assert.rejects(signIn({ rpId, webAuthnClient: auth.client }), code("CEREMONY_FAILED"));
  });

  it("WEBAUTHN_UNAVAILABLE outside a browser when no client is injected", async () => {
    await assert.rejects(signIn({ rpId }), code("WEBAUTHN_UNAVAILABLE"));
  });
});
