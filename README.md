# Turnstile

Identity-bound tickets and access on Monad. One passkey buys the ticket, opens the door and holds the
private passport — no seed phrase, no wallet app, no screenshot that can be resold.

Built solo for **Monad Metropolis** (1 Sep – 13 Oct 2026), Track 3 · Social, Attention & Culture.
Bounty targets: Mera UX, Mera "One Passkey, Many Keys", Envio, Alchemy.

## How it works

```
passkey ──PRF──┬── account namespace ──▶ secp256k1 account (15-min session)  buys, lists, receives splits
               ├── presence namespace ─▶ per-event door key (never funded)   signs rotating EIP-712 Entry codes
               └── vault namespace ────▶ AES-256-GCM passport key            encrypts the private stub archive
```

- **Buy** — one passkey prompt opens a 15-minute session; the relayer sponsors the calls.
- **Enter** — a fresh biometric at the door derives a key that can only produce entry codes for that event.
  The code rotates every 30 s; `checkIn` consumes it once, on-chain.
- **Passport** — stubs and memories are encrypted client-side; the key exists only in memory and is
  re-derived on any device from the passkey alone (stateless recovery, proven on real devices).

## Repository

```
apps/web                 city → venue → seat → ticket → door (React 19 / R3F / Vite) — ✅ running on anvil
apps/relayer             sponsored ERC-2771 calls, gate verifier + checkIn, testnet drip (Hono) — ✅ + live smoke
apps/gate                door scanner — lives in apps/web at /gate/:address
packages/identity        passkey ceremonies, KDFs, EIP-712 Entry + BindDoorKey, vault — ✅ 0.2.0, 45 tests
packages/contracts       TurnstileFactory / TurnstileEvent (Foundry)   — ✅ implemented, 62 tests, not deployed
packages/indexer         Envio HyperIndex                              — not started
spike/                   Mera 0.2.0 spike (17 vectors, device pages)   — frozen evidence
docs/                    spike report, device matrix, device reports
research/                hackathon report, build plan, notes, sources
```

`packages/identity/SPEC.md` freezes the derivation, wire formats and prompt budget; `vectors/*.json` pin
them for every other package (the contracts verify `vectors/entry.json` and `vectors/bind.json` in Foundry).

## Run

Requires Node ≥ 24 and pnpm 10 (`corepack enable`); Foundry ≥ 1.8 (`foundryup`) for `packages/contracts`.

```
pnpm install
pnpm test          # TypeScript packages (contracts run under forge, below)
pnpm typecheck
pnpm lint          # biome
pnpm vectors       # regenerate identity vectors (spec revision only) — `vectors:check` runs in CI

cd packages/contracts
forge soldeer install   # once: forge-std + OpenZeppelin 5.6.1 into dependencies/ (gitignored)
forge test              # 62 tests incl. the shared-vector suite; `forge build` also lints
```

The whole product on a local chain (three terminals):

```
anvil --chain-id 31337 --port 8545      # local Monad stand-in
pnpm dev:chain                          # deploy forwarder/factory + two seeded events → deployments/31337.json
pnpm dev:relayer                        # http://127.0.0.1:8787 (anvil keys in apps/relayer/.env)
pnpm dev:web                            # http://127.0.0.1:5173 — pick a seat, get a ticket, scan it at /gate/<event>
pnpm smoke                              # optional: buy → bind → resale round trip → entry code → check-in, live relayer
```

On a small machine (≤ 2 GB) build the web app with `pnpm --filter @turnstile/web build:lite` and let the
relayer serve it (`STATIC_DIR=../web/dist-lite`); `apps/web/README.md` has the details and the headless
screenshot tooling.

## Deployments

| Chain | Forwarder | Factory | Implementation | Events |
| --- | --- | --- | --- | --- |
| Monad testnet (10143) | _pending_ | _pending_ | _pending_ | _pending_ |

`packages/contracts/deployments/<chainId>.json` is the source of truth for the relayer and the web app;
the testnet file lands here with its broadcast once the deployer wallets are funded (`docs/deploy-monad-testnet.md`).

The spike is standalone: `cd spike && npm ci && npm run build && npm run verify` (headless Chromium, 17 checks).

`pnpm verify` is the commit gate: `pnpm install --frozen-lockfile`, `pnpm check` (biome, tsc, node tests, forge
tests, vector check), `pnpm build`, then the contracts' own `check` (`forge fmt --check`, `forge lint`, build,
tests, gas-snapshot check). Every commit on `main` is made from a tree that passed it; CI re-runs the same steps.

## Status

12 Sep 2026 — identity package done and vector-pinned; spike gate met on Android Chrome + Google Password
Manager and Windows via hybrid QR (`docs/device-matrix.md`). Contracts written and tested (unit, ERC-2771,
shared vectors, invariants; scripts exercised on anvil and on a fork of the live testnet); SPEC v1.1 adds
`BindDoorKey`. Deployment runbook: `docs/deploy-monad-testnet.md`.

13 Sep 2026 — `apps/relayer` and `apps/web` running end to end on anvil: seat picker → passkey → relayed
`buy` → `bindDoorKey` → rotating entry code → gate check-in (`pnpm smoke` ≈ 2 s on anvil, replay refused).

14 Sep 2026 — resale from the ticket: list at or under the cap / delist / pass a free seat on, all relayed;
taking a free listing is sponsored too. The sale clears the seller's door key and their old codes fail at
the gate (`pnpm smoke` covers the whole round trip with a second identity).
Next: Monad testnet deployment (`deployments/10143.json`), organiser view, Envio indexer, demo video.

## License

MIT — see `LICENSE`.
