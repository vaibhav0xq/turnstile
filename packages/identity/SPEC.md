# @turnstile/identity specification v1.4

Status: **frozen** (v1 12 Sep 2026; v1.1 additive, same day: §4.2 wording, §4.5 `BindDoorKey`; v1.2 additive, 13 Sep: §4.6 passport sync; v1.3 additive, 14 Sep: §4.3 compact entry code; v1.4 additive, 14 Sep: §4.3 base45 entry code). Everything below
is pinned by `vectors/kdf.json`, `vectors/entry.json` and `vectors/bind.json`; `pnpm vectors:check` fails in CI
when the code drifts, and `packages/contracts` re-verifies the same vectors on-chain (`forge test`). A change to any constant, KDF step, blob layout or
typed-data field is a **spec revision**: bump the `v1` in the affected label, regenerate the vectors, and
record the migration in this file. Never edit a `v1` value in place. It changes which keys people derive
from passkeys they already own.

Design origin: `docs/mera-spike-report.md` (Mera 0.2.0 API + 17 vectors), `docs/device-matrix.md`
(real-device evidence), `research/turnstile-build-plan.md` §8.

---

## 1. One passkey, many keys

A Turnstile user has exactly one passkey. Its WebAuthn **PRF** extension is evaluated with three different
salts; each salt is a namespace, and each namespace yields keys that are unrelated to the others by
construction (HMAC-style PRF, then domain-separated KDFs).

| Namespace | PRF salt (32 bytes) | Derived | Lifetime | Funded? |
|---|---|---|---|---|
| **account** | `sha256("mera.prf.salt.v1")` (Mera's default; no `prfSalt` is passed) | secp256k1 account key (BIP-39/44) | 15-min session | yes |
| **presence** | `sha256("turnstile/presence/v1")` | per-event **door key** (secp256k1) | ≤ 60-min session | **never** |
| **vault** | `sha256("turnstile/vault/v1")` | AES-256-GCM **passport key** | until `close()` | no |

Pinned salt values (hex): account `896d46ac…0db9`, presence `ab8908a0…586a`, vault `c87e94ff…b3f9`
(full values asserted in `test/kdf.test.ts`).

Why three: the account holds value and must stay portable (it is *exactly* the Mera default account, so the
recovery phrase imports into MetaMask/Rabby); presence must require a **fresh biometric at the door** and
must never be able to move funds; the vault key must be reproducible on a fresh device from the passkey alone
(stateless recovery) without ever touching the account key.

## 2. Key derivation

All PRF outputs are 32 bytes. Every KDF **consumes** its input: the implementation zeroises the PRF output
(and every intermediate secret) before returning. Inputs that are not exactly 32 bytes → `INPUT_INVALID`.

### 2.1 Account

```
entropy  = prfOutput                                  // 256 bits
mnemonic = BIP39.entropyToMnemonic(entropy, english)  // 24 words
seed     = BIP39.mnemonicToSeed(mnemonic, passphrase="")
key      = BIP32(seed).derive("m/44'/60'/0'/0/0").privateKey
```

`exportRecoveryPhrase()` returns `mnemonic`. It is the only path that ever shows a secret to the user.

### 2.2 Presence → door key

```
event    = (chainId, eventAddress)                    // the TurnstileEvent clone; lowercase hex address
info(c)  = "turnstile/door/v1|" + chainId + "|" + lowercase(eventAddress) + "|" + c
key(c)   = HKDF-SHA256(ikm = prfOutput, salt = "turnstile/door-key/v1", info = info(c), L = 32)
doorKey  = key(c) for the smallest c ≥ 0 such that key(c) is a valid secp256k1 scalar (1 ≤ k < n)
```

`c` is tried up to `DOOR_MAX_COUNTER = 8` times (probability of ever needing `c = 1` ≈ 2⁻¹²⁸); exhaustion →
`DERIVATION_FAILED`. `chainId` is decimal with no padding. The door key's **address** is what
`TurnstileEvent.bindDoorKey` stores and what `checkIn` recovers; the key itself never leaves memory and is
never funded, so a leaked door key can at worst produce entry codes for one event.

### 2.3 Vault → passport key

```
keyBytes = HKDF-SHA256(ikm = prfOutput, salt = "turnstile/vault-key/v1", info = "passport", L = 32)
key      = WebCrypto importKey("raw", keyBytes, AES-GCM-256, extractable = false, ["encrypt", "decrypt"])
```

`keyBytes` is zeroised after import.

## 3. Addressing rule (which passkey answers)

Presence and vault ceremonies are **discoverable**: the app passes **no** `allowCredentials`. The platform
sheet lists the passkeys for the RP and the user picks one. After the ceremony the library compares the
answering `credentialId` with the sign-in credential; a mismatch throws `DIFFERENT_PASSKEY` (PRF output
zeroised first). Rationale and device evidence: `docs/device-matrix.md` → "The run-1 failure, closed".
`signIn({ hint })` can still pass one credential, but it is discouraged and never used by the apps.

`credentialId` is base64url without padding, as Mera returns it.

## 4. Wire formats

### 4.1 EIP-712 `Entry`

```
domain  = { name: "Turnstile", version: "1", chainId, verifyingContract: <TurnstileEvent clone> }
type    = Entry(uint256 eventId,uint256 tokenId,uint64 slot)
digest  = keccak256(0x1901 ‖ domainSeparator ‖ structHash)
```

`ENTRY_TYPEHASH = 0x618c00eee859eabe457a85352232b00110aa50169f60cc14a0d31c8d514fcf06`.
Signatures are 65-byte `r ‖ s ‖ v`, `v ∈ {27, 28}`, low-s, RFC 6979 deterministic (so the vector is exact).
`vectors/entry.json` carries domain, message, every intermediate hash, the signer, the test-only door key and
the signature; `packages/contracts` reproduces it in Foundry (see the `foundry` notes in the vector).

### 4.2 Slots

`slot = floor(unixMs / 30000)` (`uint64`). A ticket screen re-signs every slot. The gate app accepts
`slot ∈ {current, current − 1}`, a 30 to 60 s validity window, replay-protected on-chain by the one-shot
`checkIn` per token.

*v1.1 note.* The contract (`TurnstileEvent.checkIn`) evaluates `slot` against `block.timestamp / 30` with a
tolerance of **±1** (`SLOT_TOLERANCE`): the previous slot covers inclusion latency and a code scanned at the end
of its window; the next slot covers a phone clock slightly ahead of block time. The gate app keeps the stricter
`{current, current − 1}` rule on its own clock. The chain is the last line, not the first. Neither key
derivation nor the wire format changes.

### 4.3 Entry code (what the QR carries)

Long form (v1):

```
TS1|<chainId>|<eventAddress lowercase>|<eventId>|<tokenId>|<slot>|<signature 0x-hex lowercase>
```

Seven ASCII fields, decimal integers, ≈ 200 characters (QR byte mode, version 10 at ECC M). Nothing in it is
secret. Parsing errors → `CODE_FORMAT_INVALID`; out-of-range fields are also `CODE_FORMAT_INVALID`.

Compact form (v1.3, additive: same seven fields, same order, same values):

```
TS2:<chainId>:<eventAddress hex UPPERCASE, no 0x>:<eventId>:<tokenId>:<slot>:<signature hex UPPERCASE, no 0x>
```

Every character is in the QR *alphanumeric* set (digits, `A` to `Z`, `:`), so the symbol packs 5.5 bits per
character instead of 8: ≈ 195 characters, version 8 at ECC M, two versions smaller than the long form, i.e.
larger modules on the same phone screen. Separators and case are part of the form: `TS1` is `|`-separated
lowercase `0x`-hex, `TS2` is `:`-separated bare uppercase hex; a decoder rejects a mix.

base45 form (v1.4, additive: same fields, same values; the two byte strings share one blob):

```
TS3:<chainId>:<eventId>:<tokenId>:<slot>:<base45(eventAddress ‖ signature)>
```

`base45` is RFC 9285 (alphabet: digits `0` to `9`, `A` to `Z`, space and `$ % * + - . / :`; two bytes → three characters, a final single
byte → two), the encoding designed for QR alphanumeric mode: 1.5 characters per byte instead of 2. The blob is
the 20 address bytes followed by the 65 signature bytes, 85 bytes → exactly 128 characters, and it is always
the last field because base45 can emit `:` (and a space). A decoder splits on the first five `:` only and
takes the remainder whole. ≈ 152 characters, version 6 at ECC M (version 5 at ECC L), two versions below
`TS2`. Decoding is strict: 128 characters, the RFC alphabet, no triplet above 65535 (`GGW`), and the same field
ranges as the other forms; everything else is `CODE_FORMAT_INVALID`. Decoders MUST accept all three forms;
tickets SHOULD render the base45 one. `vectors/entry.json` pins the three spellings of the same signature
(`entryCode`, `entryCodeCompact`, `entryCodeBase45`).

### 4.4 Passport blob

```
plaintext = UTF-8 JSON (or raw bytes)
iv        = 12 random bytes (crypto.getRandomValues), never reused, never caller-chosen outside tests
ct‖tag    = AES-256-GCM(key, iv, plaintext, aad = "turnstile/passport/v1")
blob      = "v1." + base64url(iv) + "." + base64url(ct‖tag)      // base64url without padding
```

`parseBlob` rejects anything else (`BLOB_FORMAT_INVALID`); authentication failure of any kind (wrong key,
wrong passkey, tampering, foreign AAD) → `DECRYPT_FAILED`. Decrypted bytes are zeroised after JSON parse.
Blobs are safe to store anywhere (Envio-indexed events, S3, localStorage): the key exists only in memory.

### 4.5 EIP-712 `BindDoorKey` (v1.1)

Binding a door key normally happens right after purchase through the relayer (`bindDoorKey(tokenId, doorKey)`
over ERC-2771, the holder's account key signing the forward request). When that did not happen (the holder
reaches the door without a bound key, or rotated passkeys on the way), the holder's **account key** authorises
the binding off-chain and the gate carries it in one transaction (`checkInWithBind`). Same domain as `Entry`;
different signer (account key, never the door key).

```
domain  = { name: "Turnstile", version: "1", chainId, verifyingContract: <TurnstileEvent clone> }
type    = BindDoorKey(uint256 tokenId,address doorKey,uint256 nonce,uint256 deadline)
nonce   = TurnstileEvent.bindNonceOf(tokenId)  (bumped by every successful bind, any path)
deadline= unix seconds; rejected after
```

`BIND_TYPEHASH = 0xd6a0a17acd5ddc08a28de306e4e27753fddd43b527873ee04d2900eb40531422`.
`vectors/bind.json` binds the door key from `vectors/entry.json` to token 42 with nonce 0, signed by the account
key from `vectors/kdf.json`; Foundry verifies it through `checkInWithBind` together with the entry signature.
How the fallback code carries `(doorKey, deadline, bindSignature)` next to the `TS1` entry code is defined with
the gate app (`TS1B…`, not yet frozen).

### 4.6 Passport sync (v1.2)

A blob is useless if it only lives on the device that wrote it, so a fan may park it with a store. The
relayer exposes `PUT/GET /api/passport/:address`. The store holds ciphertext and a watermark, nothing else.

```
message  = "turnstile/passport-sync/v1" ‖ "\n" ‖ lowercase(address) ‖ "\n" ‖ keccak256(utf8(blob)) ‖ "\n" ‖ issuedAt
sig      = EIP-191 personal_sign(message) by the account key of `address`
write    = { blob, issuedAt, signature }   // blob "" clears the passport
```

The store accepts a write iff the recovered signer is `address`, `|issuedAt − now| ≤ 5 min`, `issuedAt` is
greater than the stored watermark (replaying an older capture cannot roll a passport back; a cleared
passport keeps its watermark as a tombstone), and the blob is at most 16 KiB and shaped as §4.4. Reads are
public: a blob reveals nothing without the passkey, and the address already links tickets on-chain.

## 5. Prompt budget and sessions

Every exported ceremony is **one** platform prompt (two at `createIdentity` on authenticators without
create-time PRF, where Mera falls back to an assertion; the fake authenticator covers both paths).

| Ceremony | Prompt | Yields | Lifetime |
|---|---|---|---|
| `createIdentity` / `signIn` | 1 | `AccountSession` (viem `LocalAccount`) | 15 min (`ACCOUNT_SESSION_TTL_MS`) |
| `deriveDoorKey(event)` | 1 | `DoorSession` | 60 min (`DOOR_SESSION_TTL_MS`), configurable ≤ |
| `openVault` | 1 | `Vault` | until `close()` |
| `exportRecoveryPhrase` | 1 | mnemonic string | none |

Journey budget (from the build plan): buy = 1 prompt (sign-in), relayed calls inside the session cost none;
enter = 1 prompt (door), codes rotate without prompts for the whole session; open passport = 1 prompt.

Session states: `end()` zeroises the key (`SESSION_ENDED` afterwards); using a session past `expiresAt` ends
it and throws `SESSION_EXPIRED`. `withAccountSession` applies both rules and maps Mera's `SESSION_ENDED`.

## 6. Error states

`IdentityError { code, message, ms?, causeName?, details? }`; `USER_MESSAGES[code]` holds the product copy.

| Code | When |
|---|---|
| `WEBAUTHN_UNAVAILABLE` | no `PublicKeyCredential` (only checked when no `webAuthnClient` is injected) |
| `NOT_SECURE_CONTEXT` | `isSecureContext === false` |
| `PRF_UNAVAILABLE` | authenticator/provider has no PRF (Mera `PRF_UNAVAILABLE`) |
| `CEREMONY_FAILED` | the prompt failed or was dismissed; `causeName` = DOMException name, `ms` = elapsed |
| `DIFFERENT_PASSKEY` | answering credential ≠ `expectCredentialId`; `details = { expected, answered }` |
| `SESSION_ENDED` / `SESSION_EXPIRED` | §5 |
| `DECRYPT_FAILED` / `BLOB_FORMAT_INVALID` | §4.4 |
| `CODE_FORMAT_INVALID` | §4.3 |
| `DERIVATION_FAILED` | §2.2 counter exhausted |
| `CRYPTO_UNAVAILABLE` | no WebCrypto |
| `INPUT_INVALID` | caller bug (lengths, ranges, malformed event) |

## 7. Versioning

Revision log: **v1** (12 Sep 2026) initial freeze. **v1.1** (12 Sep 2026) additive: §4.2 on-chain tolerance
note, §4.5 `BindDoorKey`, `vectors/bind.json`; no derived key, label or existing vector changed. **v1.2** (13 Sep 2026)
additive: §4.6 passport sync, an EIP-191 message and store rules around the unchanged §4.4 blob; no key
material, label or vector touched. **v1.3** (14 Sep 2026) additive: §4.3 compact `TS2:` spelling of the entry
code; `vectors/entry.json` gains `entryCodeCompact`, every existing field is unchanged. **v1.4** (14 Sep 2026)
additive: §4.3 base45 `TS3:` spelling (RFC 9285 blob for address ‖ signature); `vectors/entry.json` gains
`entryCodeBase45`, every existing field is unchanged; `TS1` and `TS2` decode exactly as before.

Labels carry the version (`…/v1`). A revision that must change a derived key introduces `v2` labels beside
`v1`, keeps `v1` derivation available for migration, and documents the migration here. The EIP-712 domain
`version` follows the contract, not this package. Mera is pinned to an exact version (`0.2.0`) because its
default salt and session semantics are part of this spec.
