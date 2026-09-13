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
apps/web                 ticket + passport app (React/R3F)            — not started
apps/gate                door-scanner PWA                              — not started
packages/identity        passkey ceremonies, KDFs, EIP-712 Entry + BindDoorKey, vault — ✅ 0.2.0, 45 tests
packages/contracts       TurnstileFactory / TurnstileEvent (Foundry)   — ✅ implemented, 61 tests, not deployed
packages/indexer         Envio HyperIndex                              — not started
packages/relayer         sponsored calls + gate signer                 — not started
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
forge test              # 61 tests incl. the shared-vector suite; `forge build` also lints
```

The spike is standalone: `cd spike && npm ci && npm run build && npm run verify` (headless Chromium, 17 checks).

`pnpm verify` is the commit gate: `pnpm install --frozen-lockfile`, `pnpm check` (biome, tsc, node tests, forge
tests, vector check), `pnpm build`, then the contracts' own `check` (`forge fmt --check`, `forge lint`, build,
tests, gas-snapshot check). Every commit on `main` is made from a tree that passed it; CI re-runs the same steps.

## Status

12 Sep 2026 — identity package done and vector-pinned; spike gate met on Android Chrome + Google Password
Manager and Windows via hybrid QR (`docs/device-matrix.md`). Contracts written and tested (unit, ERC-2771,
shared vectors, invariants; scripts exercised on anvil and on a fork of the live testnet); SPEC v1.1 adds
`BindDoorKey`. Deployment runbook: `docs/deploy-monad-testnet.md`. Next: deploy to Monad testnet
(`deployments/10143.json`), then `apps/web`.

## License

MIT — see `LICENSE`.
