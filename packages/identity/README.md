# @turnstile/identity

One passkey, many keys. The identity layer of Turnstile: passkey ceremonies (via
[`@category-labs/mera`](https://www.npmjs.com/package/@category-labs/mera) 0.2.0), the three key namespaces,
the EIP-712 `Entry` message that door keys sign, and the encrypted private passport.

Behaviour is frozen in [`SPEC.md`](./SPEC.md) and pinned by [`vectors/`](./vectors).

```ts
import { createIdentity, signIn, deriveDoorKey, openVault, withAccountSession } from "@turnstile/identity";

// Buy: one prompt, then relayed calls inside a 15-minute session cost none.
const { credential, account } = await signIn({ rpId: "turnstile.example" });
await withAccountSession(account, (acct) => relayer.buy({ signer: acct, eventId, tier }));

// Enter: one fresh biometric at the door → a never-funded per-event key; codes rotate every 30 s.
const door = await deriveDoorKey({ rpId, event, expectCredentialId: credential.credentialId });
const qr = await door.code({ eventId, tokenId }); // "TS2:10143:…:1:42:59640000:…" (or { form: "long" } → "TS1|…")

// Passport: one prompt → AES-GCM key; blobs are safe to store anywhere.
const vault = await openVault({ rpId, expectCredentialId: credential.credentialId });
const blob = await vault.encrypt({ name: "Vee", notes: { "10143:0xevent:42": { text: "…", at } } });
// Park it with a store the fan cannot be locked out of: the account key signs for the write (SPEC §4.6).
const signature = await account.signMessage({ message: passportSyncMessage(account.address, blob, Date.now()) });
```

Pure sub-modules for the gate, relayer and contracts (no WebAuthn): `@turnstile/identity/entry`,
`/kdf`, `/vault`, `/errors`; `vectors/entry.json` is the shared vector for Foundry.

## Commands

```
pnpm test            # node:test, 39 tests, runs the .ts sources directly (Node ≥ 24)
pnpm typecheck
pnpm vectors:check   # fails when src/ no longer reproduces vectors/*.json
pnpm vectors         # regenerate — only as part of a SPEC revision
pnpm build           # dist/ (ESM + d.ts)
```

## Layout

```
src/constants.ts   frozen labels, salts, TTLs, chain ids
src/kdf.ts         PRF output → account / door / vault keys
src/entry.ts       EIP-712 Entry, slots, TS1 / TS2 entry-code strings
src/vault.ts       passport blob format (AES-256-GCM)
src/passport.ts    passport sync message + blob shape check (SPEC §4.6)
src/identity.ts    ceremonies + sessions (Mera wrapper)
src/errors.ts      IdentityError, codes, product copy
test/              fake authenticator + flows; vector pins
scripts/           gen-vectors.ts (--check)
```
