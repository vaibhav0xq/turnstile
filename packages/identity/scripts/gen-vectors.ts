// Regenerates vectors/kdf.json, vectors/entry.json and vectors/bind.json from the constants in src/. The committed files are
// the frozen truth: `--check` fails when the code drifts from them (CI runs it), so a KDF or EIP-712 change
// has to be a deliberate SPEC revision that regenerates the vectors.
//
//   node scripts/gen-vectors.ts          # write
//   node scripts/gen-vectors.ts --check  # compare, exit 1 on drift

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createSecp256k1SigningSession } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { hexToBytes, hexToSignature } from "viem";
import {
  BIND_TYPE_STRING,
  BIND_TYPES,
  type BindDoorKeyMessage,
  bindDoorKeyHashes,
  bindDoorKeyTypedData,
} from "../src/bind.ts";
import {
  ACCOUNT_PATH,
  ACCOUNT_SALT_LABEL,
  DOOR_HKDF_SALT,
  EIP712_NAME,
  EIP712_VERSION,
  MONAD_MAINNET,
  MONAD_TESTNET,
  PRESENCE_SALT_LABEL,
  VAULT_AAD,
  VAULT_HKDF_INFO,
  VAULT_HKDF_SALT,
  VAULT_SALT_LABEL,
} from "../src/constants.ts";
import { toHex, utf8 } from "../src/encoding.ts";
import {
  ENTRY_TYPE_STRING,
  ENTRY_TYPES,
  type EntryMessage,
  encodeEntryCode,
  entryHashes,
  entryTypedData,
} from "../src/entry.ts";
import {
  accountKeyFromPrf,
  accountMnemonicFromPrf,
  addressOfPrivateKey,
  doorKeyFromPrf,
  doorKeyInfo,
  type EventRef,
  vaultKeyBytesFromPrf,
} from "../src/kdf.ts";
import { encryptBlobWithIv, importVaultKey } from "../src/vault.ts";

// ---- fixed inputs (test-only; a real PRF output never looks like this) ----------------------------
const PRF = Uint8Array.from({ length: 32 }, (_, i) => i + 1); // 0x0102…20
const EVENTS: readonly EventRef[] = [
  { chainId: MONAD_TESTNET, eventAddress: "0x000000000000000000000000000000000000E0E1" },
  { chainId: MONAD_MAINNET, eventAddress: "0x1111111111111111111111111111111111111111" },
];
const ENTRY: EntryMessage = { eventId: 1n, tokenId: 42n, slot: 59_640_000n };
// Gate-fallback authorisation for the same ticket: the account key binds the door key from door[0].
// deadline = the entry slot's start + 10 minutes (unix seconds).
const BIND_DEADLINE = 59_640_000n * 30n + 600n;
const VAULT_IV = Uint8Array.from({ length: 12 }, (_, i) => i); // 0x0001…0b
const PASSPORT_JSON =
  '{"kind":"turnstile.private-passport","v":1,"owner":"account","stubs":[{"event":"Sample Club Night","seat":"GA-042","note":"first row, right of the booth"}]}';

const prf = () => new Uint8Array(PRF);

async function build() {
  // account
  const accountKey = accountKeyFromPrf(prf());
  const account = {
    salt: `sha256("${ACCOUNT_SALT_LABEL}") — Mera default; no prfSalt is passed`,
    derivation: `BIP-39 (PRF output = 256-bit entropy, no passphrase) → BIP-32 ${ACCOUNT_PATH}`,
    mnemonic: accountMnemonicFromPrf(prf()),
    privateKey: toHex(accountKey),
    address: addressOfPrivateKey(accountKey),
  };

  // presence → door keys
  const door = EVENTS.map((event) => {
    const key = doorKeyFromPrf(prf(), event);
    return {
      event: { chainId: event.chainId, eventAddress: event.eventAddress },
      hkdf: { hash: "SHA-256", salt: DOOR_HKDF_SALT, info: doorKeyInfo(event, 0), length: 32 },
      counter: 0,
      privateKey: toHex(key),
      address: addressOfPrivateKey(key),
    };
  });

  // vault
  const vaultKeyBytes = vaultKeyBytesFromPrf(prf());
  const vaultKeyHex = toHex(vaultKeyBytes);
  const vaultKey = await importVaultKey(vaultKeyBytes); // zeroises vaultKeyBytes
  const blob = await encryptBlobWithIv(vaultKey, utf8(PASSPORT_JSON), VAULT_IV);

  const kdf = {
    $comment:
      "Frozen by packages/identity/SPEC.md. Regenerate ONLY as part of a spec revision: node scripts/gen-vectors.ts",
    prfOutput: toHex(PRF),
    namespaces: {
      account: `sha256("${ACCOUNT_SALT_LABEL}")`,
      presence: `sha256("${PRESENCE_SALT_LABEL}")`,
      vault: `sha256("${VAULT_SALT_LABEL}")`,
    },
    account,
    door,
    vault: {
      hkdf: { hash: "SHA-256", salt: VAULT_HKDF_SALT, info: VAULT_HKDF_INFO, length: 32 },
      key: vaultKeyHex,
      cipher: "AES-256-GCM, 12-byte IV, 16-byte tag",
      aad: VAULT_AAD,
      iv: toHex(VAULT_IV),
      plaintextJson: PASSPORT_JSON,
      blob,
    },
  };

  // entry (shared with packages/contracts)
  const event = EVENTS[0] as EventRef;
  const doorVector = door[0] as (typeof door)[number];
  const hashes = entryHashes(event, ENTRY);
  const session = createSecp256k1SigningSession({ privateKey: hexToBytes(doorVector.privateKey) });
  const signature = await toViemAccount(session).signTypedData(entryTypedData(event, ENTRY));
  session.end();
  const { r, s, v } = hexToSignature(signature);
  const entry = {
    $comment:
      "Shared EIP-712 vector for packages/contracts (Foundry) and apps. Frozen by packages/identity/SPEC.md §4.",
    domain: {
      name: EIP712_NAME,
      version: EIP712_VERSION,
      chainId: event.chainId,
      verifyingContract: event.eventAddress,
    },
    types: ENTRY_TYPES,
    primaryType: "Entry",
    typeString: ENTRY_TYPE_STRING,
    message: {
      eventId: ENTRY.eventId.toString(),
      tokenId: ENTRY.tokenId.toString(),
      slot: ENTRY.slot.toString(),
    },
    typeHash: hashes.typeHash,
    domainSeparator: hashes.domainSeparator,
    structHash: hashes.structHash,
    digest: hashes.digest,
    signer: doorVector.address,
    doorKeyPrivateKey: doorVector.privateKey,
    doorKeyDerivation: `vectors/kdf.json → door[0] (prfOutput ${toHex(PRF)}, ${doorVector.hkdf.info})`,
    signature,
    r,
    s,
    v: Number(v),
    entryCode: encodeEntryCode({ event, message: ENTRY, signature }),
    entryCodeCompact: encodeEntryCode({ event, message: ENTRY, signature }, "compact"),
    entryCodeBase45: encodeEntryCode({ event, message: ENTRY, signature }, "base45"),
    foundry: [
      "bytes32 digest = keccak256(abi.encodePacked(hex'1901', domainSeparator, structHash)); assertEq(digest, vector.digest);",
      "(uint8 v, bytes32 r, bytes32 s) = vm.sign(uint256(doorKeyPrivateKey), digest); // RFC 6979 → identical r, s, v",
      "assertEq(ECDSA.recover(digest, signature), signer);",
      "domainSeparator assumes the TurnstileEvent clone lives at verifyingContract on chainId — use vm.chainId + deployCodeTo, or compare structHash/typeHash only.",
    ],
  };

  // bind (account key authorises the door key for token 42 — consumed by checkInWithBind / bindDoorKeyWithSig)
  const bindMessage: BindDoorKeyMessage = {
    tokenId: ENTRY.tokenId,
    doorKey: doorVector.address,
    nonce: 0n,
    deadline: BIND_DEADLINE,
  };
  const bindHashes = bindDoorKeyHashes(event, bindMessage);
  const accountSession = createSecp256k1SigningSession({ privateKey: hexToBytes(account.privateKey) });
  const bindSignature = await toViemAccount(accountSession).signTypedData(
    bindDoorKeyTypedData(event, bindMessage),
  );
  accountSession.end();
  const bindSig = hexToSignature(bindSignature);
  const bind = {
    $comment:
      "Shared EIP-712 vector for the gate fallback (checkInWithBind) and bindDoorKeyWithSig. Signed by the ACCOUNT key from vectors/kdf.json; binds the door key from vectors/entry.json. Frozen by packages/identity/SPEC.md §4.5.",
    domain: entry.domain,
    types: BIND_TYPES,
    primaryType: "BindDoorKey",
    typeString: BIND_TYPE_STRING,
    message: {
      tokenId: bindMessage.tokenId.toString(),
      doorKey: bindMessage.doorKey,
      nonce: bindMessage.nonce.toString(),
      deadline: bindMessage.deadline.toString(),
    },
    typeHash: bindHashes.typeHash,
    domainSeparator: bindHashes.domainSeparator,
    structHash: bindHashes.structHash,
    digest: bindHashes.digest,
    signer: account.address,
    signerPrivateKey: account.privateKey,
    signerDerivation: "vectors/kdf.json → account (the ticket holder's Mera account key = ownerOf(tokenId))",
    signature: bindSignature,
    r: bindSig.r,
    s: bindSig.s,
    v: Number(bindSig.v),
    foundry: [
      "mint tokenId to signer, warp to <= deadline, then checkInWithBind(tokenId, doorKey, deadline, signature, entry.slot, entry.signature) from a GATE_ROLE account",
      "bindNonceOf(tokenId) must be 0 when the signature is checked (fresh ticket).",
    ],
  };

  return { kdf, entry, bind };
}

const here = (name: string) => fileURLToPath(new URL(`../vectors/${name}`, import.meta.url));
const render = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const { kdf, entry, bind } = await build();
const files: Array<[string, string]> = [
  ["kdf.json", render(kdf)],
  ["entry.json", render(entry)],
  ["bind.json", render(bind)],
];

if (process.argv.includes("--check")) {
  let drift = false;
  for (const [name, content] of files) {
    let current = "";
    try {
      current = readFileSync(here(name), "utf8");
    } catch {
      /* missing file counts as drift */
    }
    if (current !== content) {
      drift = true;
      console.error(`vectors/${name} differs from what src/ produces`);
    }
  }
  if (drift) {
    console.error("Vector drift: either revert the code change or revise SPEC.md and run `pnpm vectors`.");
    process.exit(1);
  }
  console.log("vectors match src/");
} else {
  for (const [name, content] of files) {
    writeFileSync(here(name), content);
    console.log(`wrote vectors/${name}`);
  }
}
