import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSecp256k1SigningSession } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { encodeAbiParameters, type Hex, hexToBytes, keccak256, stringToHex } from "viem";
import { SLOT_MS } from "../src/constants.ts";
import { base45Decode, base45Encode, utf8, utf8Decode } from "../src/encoding.ts";
import {
  currentSlot,
  decodeEntryCode,
  ENTRY_TYPEHASH,
  ENTRY_TYPES,
  type EntryMessage,
  encodeEntryCode,
  entryCodeForm,
  entryDigest,
  entryHashes,
  entryTypedData,
  isSlotAcceptable,
  recoverEntrySigner,
  verifyEntry,
} from "../src/entry.ts";
import { isIdentityError } from "../src/errors.ts";
import type { EventRef } from "../src/kdf.ts";
import { entryVector as V } from "./vectors.ts";

const event: EventRef = { chainId: V.domain.chainId, eventAddress: V.domain.verifyingContract };
const message: EntryMessage = {
  eventId: BigInt(V.message.eventId),
  tokenId: BigInt(V.message.tokenId),
  slot: BigInt(V.message.slot),
};

describe("EIP-712 Entry (vectors/entry.json)", () => {
  it("has the pinned type string and type hash", () => {
    assert.equal(V.typeString, "Entry(uint256 eventId,uint256 tokenId,uint64 slot)");
    assert.equal(ENTRY_TYPEHASH, keccak256(stringToHex(V.typeString)));
    assert.equal(ENTRY_TYPEHASH, V.typeHash);
    assert.deepEqual(
      ENTRY_TYPES.Entry.map((f) => `${f.type} ${f.name}`),
      ["uint256 eventId", "uint256 tokenId", "uint64 slot"],
    );
  });

  it("reproduces domainSeparator, structHash and digest — recomputed by hand the way Solidity does", () => {
    // Independent of viem's typed-data code path: abi.encode + keccak, exactly what OZ EIP712 / the contract do.
    const domainTypeHash = keccak256(
      stringToHex("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
    );
    const domainSeparator = keccak256(
      encodeAbiParameters(
        [
          { type: "bytes32" },
          { type: "bytes32" },
          { type: "bytes32" },
          { type: "uint256" },
          { type: "address" },
        ],
        [
          domainTypeHash,
          keccak256(stringToHex(V.domain.name)),
          keccak256(stringToHex(V.domain.version)),
          BigInt(V.domain.chainId),
          V.domain.verifyingContract,
        ],
      ),
    );
    const structHash = keccak256(
      encodeAbiParameters(
        [{ type: "bytes32" }, { type: "uint256" }, { type: "uint256" }, { type: "uint64" }],
        [V.typeHash, message.eventId, message.tokenId, message.slot],
      ),
    );
    const digest = keccak256(`0x1901${domainSeparator.slice(2)}${structHash.slice(2)}` as Hex);

    assert.equal(domainSeparator, V.domainSeparator);
    assert.equal(structHash, V.structHash);
    assert.equal(digest, V.digest);

    const hashes = entryHashes(event, message);
    assert.deepEqual(hashes, {
      typeHash: V.typeHash,
      domainSeparator: V.domainSeparator,
      structHash: V.structHash,
      digest: V.digest,
    });
    assert.equal(entryDigest(event, message), V.digest);
  });

  it("signs deterministically (RFC 6979, low-s) to the pinned signature and recovers the pinned signer", async () => {
    const session = createSecp256k1SigningSession({ privateKey: hexToBytes(V.doorKeyPrivateKey) });
    const signature = await toViemAccount(session).signTypedData(entryTypedData(event, message));
    session.end();
    assert.equal(signature, V.signature);
    assert.equal(signature.length, 2 + 130);
    assert.equal(`0x${signature.slice(2, 66)}`, V.r);
    assert.equal(`0x${signature.slice(66, 130)}`, V.s);
    assert.equal(Number.parseInt(signature.slice(130), 16), V.v);
    assert.ok(V.v === 27 || V.v === 28);
    // low-s: s < n/2
    assert.ok(BigInt(V.s) < 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n);

    assert.equal(await recoverEntrySigner(event, message, signature), V.signer);
    assert.equal(await verifyEntry(event, message, signature, V.signer), true);
  });

  it("verification fails on any field change or a mangled signature", async () => {
    const tampered: EntryMessage[] = [
      { ...message, slot: message.slot + 1n },
      { ...message, tokenId: message.tokenId + 1n },
      { ...message, eventId: message.eventId + 1n },
    ];
    for (const m of tampered) assert.equal(await verifyEntry(event, m, V.signature, V.signer), false);
    const otherEvent: EventRef = { ...event, chainId: event.chainId + 1 };
    assert.equal(await verifyEntry(otherEvent, message, V.signature, V.signer), false);
    const mangled = `${V.signature.slice(0, -2)}00` as Hex;
    assert.equal(await verifyEntry(event, message, mangled, V.signer), false);
  });

  it("rejects out-of-range fields", () => {
    assert.throws(
      () => entryTypedData(event, { ...message, slot: 1n << 64n }),
      (e: unknown) => isIdentityError(e) && e.code === "INPUT_INVALID",
    );
    assert.throws(
      () => entryTypedData(event, { ...message, tokenId: -1n }),
      (e: unknown) => isIdentityError(e) && e.code === "INPUT_INVALID",
    );
  });
});

describe("slots", () => {
  it("are 30-second windows; the gate accepts the current and the previous one", () => {
    const now = 59_640_000 * SLOT_MS + 12_345;
    assert.equal(currentSlot(now), 59_640_000n);
    assert.equal(isSlotAcceptable(59_640_000n, now), true);
    assert.equal(isSlotAcceptable(59_639_999n, now), true);
    assert.equal(isSlotAcceptable(59_639_998n, now), false);
    assert.equal(isSlotAcceptable(59_640_001n, now), false);
  });
});

describe("entry code string", () => {
  it("round-trips and matches the pinned encoding", () => {
    const text = encodeEntryCode({ event, message, signature: V.signature });
    assert.equal(text, V.entryCode);
    assert.ok(text.length < 300, `code is ${text.length} chars`);
    const decoded = decodeEntryCode(text);
    assert.deepEqual(decoded, {
      event: { chainId: event.chainId, eventAddress: event.eventAddress.toLowerCase() },
      message,
      signature: V.signature.toLowerCase(),
    });
  });

  it("compact form is QR-alphanumeric, shorter, pinned, and decodes to the same code", () => {
    const long = encodeEntryCode({ event, message, signature: V.signature });
    const compact = encodeEntryCode({ event, message, signature: V.signature }, "compact");
    assert.equal(compact, V.entryCodeCompact);
    assert.match(compact, /^TS2:[0-9A-Z:]+$/, "only digits, A–Z and ':' — the QR alphanumeric set");
    assert.ok(compact.length < long.length, `${compact.length} vs ${long.length} chars`);
    assert.equal(entryCodeForm(compact), "compact");
    assert.equal(entryCodeForm(long), "long");
    assert.equal(entryCodeForm("TS2|nope"), null);
    assert.deepEqual(decodeEntryCode(compact), decodeEntryCode(long));
    assert.deepEqual(
      decodeEntryCode(`  ${compact}\n`),
      decodeEntryCode(long),
      "tolerates surrounding whitespace",
    );
  });

  it("base45 form is the densest spelling, pinned, and decodes to the same code", () => {
    const compact = encodeEntryCode({ event, message, signature: V.signature }, "compact");
    const dense = encodeEntryCode({ event, message, signature: V.signature }, "base45");
    assert.equal(dense, V.entryCodeBase45);
    assert.match(dense, /^TS3:[0-9A-Z $%*+\-./:]+$/, "only the QR alphanumeric set");
    assert.equal(dense.length, 152, "five decimal fields plus a fixed 128-character blob");
    assert.ok(dense.length < compact.length, `${dense.length} vs ${compact.length} chars`);
    assert.equal(entryCodeForm(dense), "base45");
    assert.equal(entryCodeForm("TS3|nope"), null);
    assert.deepEqual(decodeEntryCode(dense), decodeEntryCode(compact));
    assert.deepEqual(
      decodeEntryCode(`\n${dense}  `),
      decodeEntryCode(compact),
      "tolerates surrounding whitespace",
    );
    // The blob may contain ':' and ' ' (both are base45 digits) — the decoder must not split on them.
    const blob = dense.split(":").slice(5).join(":");
    assert.equal(blob.length, 128);
    assert.ok(blob.includes(":") || blob.includes(" "), "vector exercises the awkward digits");
  });

  it("base45 form is strict about its blob", () => {
    const dense = V.entryCodeBase45;
    const blob = dense.slice(dense.length - 128);
    const head = dense.slice(0, dense.length - 128);
    const bad = [
      `${head}${blob.slice(0, 127)}`, // short blob
      `${head}${blob}0`, // long blob
      `${head}${blob.toLowerCase()}`, // lowercase is outside the alphabet
      `${head}${"GGW".repeat(42)}00`, // GGW is 65536: over 16 bits (RFC 9285 §4)
      `${head}${blob.slice(0, 125)}#${blob.slice(126)}`, // '#' is not a base45 digit
      dense.replaceAll(":", "|"), // long-form separators
      dense.replace("TS3:", "TS3:0x"),
      dense.replace(":59640000:", ":18446744073709551616:"), // slot > uint64
    ];
    for (const text of bad) {
      assert.throws(
        () => decodeEntryCode(text),
        (e: unknown) => isIdentityError(e) && e.code === "CODE_FORMAT_INVALID",
        `should reject ${JSON.stringify(text.slice(0, 40))}…`,
      );
    }
  });

  it("base45 matches the RFC 9285 examples both ways and rejects what the RFC rejects", () => {
    assert.equal(base45Encode(utf8("AB")), "BB8");
    assert.equal(base45Encode(utf8("Hello!!")), "%69 VD92EX0");
    assert.equal(base45Encode(utf8("base-45")), "UJCLQE7W581");
    assert.equal(utf8Decode(base45Decode("QED8WEX0")), "ietf!");
    assert.equal(utf8Decode(base45Decode("%69 VD92EX0")), "Hello!!");
    assert.equal(base45Encode(new Uint8Array()), "");
    assert.deepEqual(base45Decode(""), new Uint8Array());
    for (const text of ["GGW", "A", ":::", "ZZZ", "bb8", "BB8!"]) {
      assert.throws(
        () => base45Decode(text),
        (e: unknown) => isIdentityError(e) && e.code === "INPUT_INVALID",
        text,
      );
    }
    // round trip over every byte value and both tail lengths
    for (const length of [1, 2, 3, 64, 65, 85, 256]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + length) & 0xff);
      assert.deepEqual(base45Decode(base45Encode(bytes)), bytes, `round trip ${length}`);
    }
  });

  it("long form still takes a checksummed address and keeps it as written (v1 behaviour)", () => {
    const checksummed = V.entryCode.replace(event.eventAddress.toLowerCase(), event.eventAddress);
    assert.notEqual(checksummed, V.entryCode, "vector address has uppercase letters when checksummed");
    const decoded = decodeEntryCode(checksummed);
    assert.equal(decoded.event.eventAddress, event.eventAddress);
    assert.deepEqual(decoded.message, message);
    assert.equal(decoded.signature, V.signature.toLowerCase());
    assert.throws(
      () => decodeEntryCode(V.entryCode.replace(V.signature.toLowerCase(), V.signature.toUpperCase())),
      (e: unknown) => isIdentityError(e) && e.code === "CODE_FORMAT_INVALID",
      "long-form signature is lowercase only, as in v1",
    );
  });

  it("does not let one spelling borrow the other's separators or case", () => {
    const compact = V.entryCodeCompact;
    const bad = [
      compact.replaceAll(":", "|"), // TS2 with long-form separators
      V.entryCode.replaceAll("|", ":"), // TS1 with compact separators
      compact.toLowerCase(), // compact is uppercase by definition
      compact.replace("TS2:", "TS2:0x"), // 0x prefix belongs to the long form only
    ];
    for (const text of bad) {
      assert.throws(
        () => decodeEntryCode(text),
        (e: unknown) => isIdentityError(e) && e.code === "CODE_FORMAT_INVALID",
        `should reject ${JSON.stringify(text.slice(0, 40))}`,
      );
    }
  });

  it("rejects anything that is not a Turnstile code", () => {
    const bad = [
      "",
      "hello",
      "TS0|10143|0x000000000000000000000000000000000000e0e1|1|42|1|0x00",
      V.entryCode.replace("TS1|", "TS1|x"),
      `${V.entryCode}|extra`,
      `${V.entryCodeCompact}:extra`,
      V.entryCode.replace(V.signature.toLowerCase(), "0xdead"),
      V.entryCode.replace("|59640000|", "|18446744073709551616|"), // slot > uint64
      V.entryCodeCompact.replace(":59640000:", ":18446744073709551616:"),
    ];
    for (const text of bad) {
      assert.throws(
        () => decodeEntryCode(text),
        (e: unknown) => isIdentityError(e) && e.code === "CODE_FORMAT_INVALID",
        `should reject ${JSON.stringify(text.slice(0, 40))}`,
      );
    }
  });
});
