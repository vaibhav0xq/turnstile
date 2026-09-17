# Mera / passkey spike — implementation requirements, blockers, repo setup

Date: 12 Sep 2026 · Mera `@category-labs/mera@0.2.0` · viem 2.56.3 · @scure/bip32 + bip39 · @noble/hashes 2.x

## 1. What the spike is and what it proved

`spike/` is a throwaway, client-only page (`spike/src/main.js`, bundled into one 251 KB `spike/dist/index.html`). It runs the exact primitives the product will use:

| # | Step | Primitive | Result (headless Chromium 152, virtual PRF authenticator) |
|---|---|---|---|
| 1 | Create passkey → account | `createPasskeyWithPrfOutput` (default salt) → BIP-39 entropy → BIP-32 `m/44'/60'/0'/0/0` → `createSecp256k1SigningSession` → `toViemAccount` | ✅ PRF returned at create time, address derived |
| 2 | Sign in → same account | `getPasskeyPrfOutput({ rpId, credential })` and the discoverable form `getPasskeyPrfOutput({ rpId })` | ✅ identical address both ways |
| 3 | Presence namespace → door key | `getPasskeyPrfOutput({ prfSalt: sha256("turnstile/presence/v1") })` → HKDF-SHA256(salt `turnstile/door-key/v1`, info `turnstile/door/v1|chainId|event|counter`) → secp256k1 session | ✅ deterministic, ≠ account |
| 4 | Entry typed data sign/verify | `toViemAccount(doorSession).signTypedData` over `Entry(uint256 eventId,uint256 tokenId,uint64 slot)`; `recoverTypedDataAddress` / `verifyTypedData` | ✅ recovered == door key (what `checkIn` will do with `ecrecover`) |
| 5 | Vault namespace encrypt/decrypt | `getPasskeyPrfOutput({ prfSalt: sha256("turnstile/vault/v1") })` → HKDF(info `passport`) → WebCrypto AES-256-GCM (non-extractable) + AAD `turnstile/passport/v1` | ✅ round-trip; ciphertext stored only as an opaque blob |
| 6 | Second device / stateless | `localStorage.clear()` + reload with expected values in the URL fragment → discoverable sign-in → 3 → 5 | ✅ same account, same door key, device-A blob decrypts, Entry re-verifies |
| 7 | Sessions | `session.end()` then sign | ✅ `SESSION_ENDED` |
| N | Negative control | second passkey on the same origin | ✅ different account; blob → `DECRYPT_FAILED` |

17/17 checks (`node spike/verify.mjs`, spike v2.1: adds the three ceremony-addressing modes, the same-credential check, and failure instrumentation).

**Real devices (12 Sep, spike v2.1) — the gate is met.** Android Chrome 153 + Google Password Manager on `bejewelled-gumdrop-74aa24.netlify.app`: phone flow ✅, phone stateless recovery ✅ (discoverable sign-in 6.7 s → same account and credential id; presence ceremony 5.2 s → same door key as before the wipe; vault ceremony 4.2 s, same credential), Windows laptop verification through the phone-QR (hybrid) sheet ✅ (user-reported, JSON pending). Details and the exact evidence per leg: `docs/device-matrix.md`. Still unmeasured: prompt counts (create 1 vs 2), iPhone/Safari rows.

## 2. Verified Mera 0.2.0 facts that change the plan's wording

- There is **no `deriveEvmKey` export**. The package exports `createPasskeyWithPrfOutput`, `getPasskeyPrfOutput`, `createSecp256k1SigningSession`, `createEd25519SigningSession`, `getEvmAddress`, `getSolanaAddress`, the secret-vault functions, `isMeraError`/`MeraError`; `toViemAccount` lives in `@category-labs/mera/viem`. Account derivation is the guide's snippet with `@scure/bip32` + `@scure/bip39` (we own it — put it in `packages/identity`).
- `getPasskeyPrfOutput({ rpId, credential?, prfSalt?, timeout? })`: `credential` optional → discoverable ceremony; `prfSalt` must be exactly 32 bytes; **one ceremony = one prompt = one salt**; output = f(credential, rpId, salt).
- `createPasskeyWithPrfOutput` returns `{ credentialId, transports, prfSalt, prfOutput }`; it may cost **two prompts** on authenticators that do not evaluate PRF at creation (fallback assertion). Record which of your devices do this.
- Signing sessions live in page memory; `end()` zeroises; `toViemAccount` provides `signTypedData`, `signMessage`, `signTransaction`, `sign` — enough for ERC-2771 forward requests, USDC `permit`, and the door `Entry`.
- Error codes to design for: `PRF_UNAVAILABLE`, `PASSKEY_OPERATION_FAILED` (includes user cancel and non-secure origins), `SESSION_ENDED`, `DECRYPT_FAILED`, `INPUT_INVALID`, `CRYPTO_UNAVAILABLE`, `VAULT_FORMAT_INVALID`.
- Capability probe that works: `PublicKeyCredential.getClientCapabilities()` → `'extension:prf'` (Chromium; Safari support to confirm on device). Use it to pre-warn before the first ceremony instead of failing after it.

## 3. Exact implementation requirements (freeze these in `packages/identity/SPEC.md`)

**Namespaces (final):**

| Namespace | PRF salt (32 B) | KDF | Output |
|---|---|---|---|
| account | Mera default `sha256("mera.prf.salt.v1")` | BIP-39 entropy→mnemonic→seed, BIP-32 `m/44'/60'/0'/0/0` | secp256k1 account (portable to MetaMask/Rabby via exported mnemonic) |
| presence | `sha256("turnstile/presence/v1")` | HKDF-SHA256, salt `"turnstile/door-key/v1"`, info `"turnstile/door/v1|<chainId>|<event address lowercase>|<counter>"`, L=32; counter increments only if the scalar is invalid (p≈2⁻¹²⁸) | per-event door key (secp256k1; never funded; only signs `Entry`) |
| vault | `sha256("turnstile/vault/v1")` | HKDF-SHA256, salt `"turnstile/vault-key/v1"`, info `"passport"`, L=32 | AES-256-GCM key, WebCrypto non-extractable, 12-byte random IV, AAD `"turnstile/passport/v1"`, blob format `v1.<iv b64url>.<ct b64url>` |

Rules: derived bytes are zeroised after use; nothing derived is ever persisted; `credentialId` in localStorage is a convenience only and every flow must work without it; rotating a door key = bump the `v1` in the info string and re-`bindDoorKey`.

**Addressing rule (added after the first Android run):** presence and vault ceremonies are **discoverable by default** — `getPasskeyPrfOutput({ rpId, prfSalt })` with no `credential` — and the app enforces "same passkey as sign-in" *after* the ceremony by comparing the returned `credentialId` with the sign-in one (a mismatch means the user picked another passkey in the sheet: surface "that's a different passkey — use the one you bought with", retry). `allowCredentials` is only a pre-selection hint, it proves nothing the credential-id comparison does not, and an assertion never carries `transports`, so after a discoverable sign-in the app can only ever name `{ id }`. Use `allowCredentials` on a platform only if the matrix probe shows `id` passing there; the security property never depends on it. Mera itself is indifferent: `credential` is optional on every call, and the only thing `credential` changes in the request is `allowCredentials` (`dist/webauthn.js`).

**Prompt budget (product):**
- Sign-in / first purchase: 1 prompt → 15-minute account session (holds, permit, buy, listing, `bindDoorKey`).
- Door: 1 presence prompt per venue visit; door session lives ≤ 60 min, codes rotate every 30 s in memory; `end()` on leaving the gate screen or `pagehide`.
- Passport: 1 vault prompt when opened.
- Because one ceremony evaluates one salt, **binding the door key at purchase costs a second prompt**. Decision: right after the purchase confirms, offer "Set up your door key — one Face ID" (uses the still-open account session to relay `bindDoorKey`, no third prompt). At the gate, if a ticket has no bound key yet, the gate screen binds it then (presence prompt + account prompt) — acceptable fallback, not the happy path. Optimisation for later, not MVP: WebAuthn PRF can evaluate `first` and `second` salts in one ceremony; Mera exposes only `first`, so this would need a custom `webAuthnClient` wrapper.

**Contracts (`packages/contracts`), matching the spike byte-for-byte:**
- EIP-712 domain `{ name: "Turnstile", version: "1", chainId, verifyingContract: <TurnstileEvent> }`; struct `Entry(uint256 eventId,uint256 tokenId,uint64 slot)`; OZ `EIP712` + `ECDSA.recover` (rejects malleable `s`).
- `bindDoorKey(uint256 tokenId, address doorKey)` — ticket owner via the ERC-2771 forwarder; emits `DoorKeyBound`; re-bind allowed (rotation), which invalidates codes from the old key.
- `checkIn(uint256 tokenId, uint64 slot, bytes sig)` — `GATE_ROLE` only; `slot ∈ {now/30s, now/30s − 1}`; recovered signer == bound key; once per token; emits `CheckedIn(tokenId, identity, block.timestamp)`.
- The gate submits `checkIn`; fans never send transactions themselves (forwarder + relayer for everything they sign).

**Web app (`apps/web`):**
- All WebAuthn calls inside a user gesture (iOS Safari requirement) — never on mount.
- Sessions in a module-scoped store (Zustand outside React state); UI reads only `address`/`expiresAt`; every signing path catches `SESSION_ENDED` → re-prompt sheet, never a dead button.
- Stateless by construction: state = chain (via Envio) + encrypted blobs. Blob store API: `GET /vault/:address` unauthenticated (ciphertext is safe to serve); `PUT /vault/:address` requires an EIP-191 signature from the account over `keccak(blob) || nonce` so strangers cannot overwrite.
- The original proposal included a public guided-run panel with TTFT, reset and second-device controls.
  Decision 17 Sep 2026: the public control was removed after freezes on a Redmi Note 11. The guided run
  remains developer tooling and is not a required product path.
- Capability pre-check with `getClientCapabilities()`; designed `PRF_UNAVAILABLE` state: "This browser can't hold a Turnstile passkey — use your phone, or sign in to Google Password Manager".
- Bundle: viem alone is ~240 KB minified — import from `viem` subpaths / rely on Next.js tree-shaking; keep Mera + viem out of the 3D landing chunk.

**Relayer (`packages/relayer`):** verifies ERC-2771 `ForwardRequest` typed data signed by the account session (same `signTypedData` primitive as step 4), simulates via Tenderly, submits with explicit `gas` (Monad charges the declared limit), exposes the gate signer for `checkIn`.

## 4. Blockers and risks, in order

1. ~~**Real-device PRF run is still pending.**~~ **Cleared 12 Sep** for the demo hardware: Android Chrome + GPM phone flow, phone stateless recovery, Windows laptop via hybrid QR (`docs/device-matrix.md`). iPhone/Safari rows are unfilled — a user-coverage question for later, not a hackathon gate, since the demo phone is Android.
1b. **Run-1 by-id failure — closed in design, cause unattributed.** Run 1 (spike v1) failed on the first ceremony addressed as `allowCredentials:[{id}]` (no transports) after a discoverable sign-in had passed; v2.1 on the same phone passed every namespace ceremony in `discoverable` mode after a wipe. Code review had already ruled out lost context (the spike stored and passed the id the sign-in returned; Mera round-trips it byte-for-byte via `base64urlnopad`; the only effect of `credential` is `allowCredentials`). The remaining hypotheses — Android Chrome/GPM not matching a local passkey named without `transports`, or a dismissed sheet — were not separated because the by-id probe was not run in the passing pass. Nothing in the product depends on `allowCredentials` now, so this is a note for Category Labs, not a blocker; the probe is one tap on the phone if you want the cause on record.
2. **Hosting the spike over HTTPS.** WebAuthn needs a secure context and both devices must hit the *same hostname* (`rpId`). Options: (a) GitHub Pages — push `spike/dist/index.html` as `index.html` to a `turnstile-spike` repo, enable Pages → `https://vaibhav0xq.github.io/turnstile-spike/` (stable, under your identity); (b) Netlify Drop / Vercel — drag the `dist` folder (stable, 1 minute); (c) local + tunnel — `npx serve spike/dist -l 3000` then `cloudflared tunnel --url http://localhost:3000` (fastest, but the hostname changes per run, so do the whole matrix in one sitting).
3. **Domain decision is now a product decision.** Passkeys are bound to the `rpId`; moving domains orphans accounts (recovery only via exported mnemonic). Pick the production registrable domain before the first real user; use `rpId = <registrable domain>` so `app.` and `gate.` subdomains share passkeys. Dev origins get their own throwaway passkeys — expected.
4. **Mera is 0.2.0.** Pin the exact version; wrap it in `packages/identity` (`createIdentity`, `signIn`, `withAccountSession`, `deriveDoorKey(event)`, `openVault`) so an API change is a one-file fix.
5. ~~**Hybrid (phone-QR) path and PRF.**~~ **Passed on your combo** (Windows laptop ← Android phone, user-reported). This is the judge's second-device demo path — the only one that works on a laptop that does not share your Google account. Keep a synced-passkey fallback in mind only if a judge's browser lacks hybrid.
6. **Desktop Chrome local profile / Bitwarden / Dashlane** have no PRF by Mera's own table; the failure state is designed, not fixed.
7. **Two-prompt creation** on some authenticators inflates the on-screen TTFT; **still unmeasured** — count prompts at create on the Android phone and file them in the matrix.

## 5. Repo setup tasks — **unblocked 12 Sep** (device rows passed)

1. Create `turnstile` on GitHub under `vaibhav0xq` (all commits/pushes by you). Layout: `apps/web` (Next.js 15 / React 19 / Tailwind 4 / R3F), `apps/gate` (Serwist PWA scanner), `packages/contracts` (Foundry, Solidity 0.8.28, `prague`, OZ 5), `packages/identity` (this spike, typed, with `SPEC.md`), `packages/indexer` (Envio HyperIndex), `packages/relayer` (Node, viem, Tenderly), `docs/` (this file, device matrix, ADRs), `research/` (moved as-is).
2. Toolchain: pnpm workspaces, Node 24, TypeScript strict, Biome, Foundry ≥ 1.8; `foundry.toml` with `evm_version = "prague"`, `solc = "0.8.28"`, `optimizer_runs = 200`; `viem/chains` `monadTestnet` (10143) and `monad` (143).
3. `packages/identity` first: port `spike/src/main.js` to TS behind the interface above; unit-test the KDFs with fixed PRF vectors (the spike's vectors are deterministic per credential, so test the KDF layer with a constant 32-byte input); export `ENTRY_TYPES` and the domain builder for both the app and the contracts' test vectors.
4. `packages/contracts` first contracts: `TurnstileForwarder` (ERC-2771), `TurnstileEvent` (ERC-721 tickets, `buy` with USDC `permit`, `bindDoorKey`, `checkIn`, transfer lock), `Passport` (ERC-5192); Foundry tests include an `Entry` signature produced by the identity package (shared vector file `packages/identity/vectors/entry.json`).
5. `.env.example`: `NEXT_PUBLIC_RP_ID`, `NEXT_PUBLIC_CHAIN_ID`, `ALCHEMY_MONAD_RPC`, `QUICKNODE_MONAD_RPC`, `TENDERLY_*`, `RELAYER_PRIVATE_KEY`, `GATE_SIGNER_PRIVATE_KEY`, `DATABASE_URL`, `ENVIO_GRAPHQL_URL`, `USDC_ADDRESS` (testnet `0x534b2f3A21130d7a60830c2Df862319e593943A3`, mainnet `0x754704Bc059F8C67012fEd69BC8A327a5aafb603`).
6. CI (GitHub Actions): `forge test`, `pnpm typecheck`, `pnpm test` (identity KDF vectors), `node spike/verify.mjs` kept as a smoke test until `packages/identity` has its own headless WebAuthn test.
7. Claim Tenderly + QuickNode vouchers; create Alchemy app on Monad; Envio account; fund relayer + gate signer on 10143 from `faucet.monad.xyz`.
8. Portal: paste the repo URL into the project once it is public; remove Privy; check the community dropdown; 22 Sep 09:29 IST — read the Rules text, file as `research/sources/official-05/06/08`.

## 6. Running the spike

```bash
cd spike
npm install
node build.mjs          # → dist/index.html (self-contained)
node verify.mjs         # headless proof, 17 checks (needs Chromium; CHROMIUM=/path/to/chrome to override)
npx serve dist -l 3000  # then expose over HTTPS — see §4.2
```
