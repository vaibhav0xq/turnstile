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
- **Passport** — a name and a line about each night, encrypted client-side with the vault key and parked with
  the relayer as ciphertext it cannot read (writes are signed by the account key). The key exists only in
  memory and is re-derived on any device from the passkey alone: wipe the phone, sign in, it is all back.

## Repository

```
apps/web                 city → venue → seat → ticket → door, resale, organiser (React 19 / R3F / Vite) — ✅ on anvil
apps/relayer             sponsored ERC-2771 calls, gate verifier + checkIn, testnet drip, passport store (Hono) — ✅ + live smoke
apps/gate                door scanner — lives in apps/web at /gate/:address
packages/identity        passkey ceremonies, KDFs, EIP-712 Entry + BindDoorKey, vault + passport sync — ✅ 0.2.0, 54 tests
packages/contracts       TurnstileFactory / TurnstileEvent (Foundry)   — ✅ 62 tests, live on Monad testnet
packages/indexer         Envio HyperIndex: events, seats, fans, door feed, stats — ✅ handlers + 5 tests, web Live layer wired, hosted deploy pending
spike/                   Mera 0.2.0 spike (17 vectors, device pages)   — frozen evidence
docs/                    runbooks (testnet deploy, final domain, Envio), storyboard, spike report, device matrix
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
pnpm seed:night                         # optional: a crowd, two booths, a resale and check-ins on the newest event
```

**Judge mode** — the button on the city page (`/city`, or `/city?tour=auto`) walks the whole thing in about two
minutes: city → seat → checkout → ticket → door → your seat lit green under a followspot, with the mint /
bind / admit transaction hashes on the last card. The tour only advances when the chain says the seat is
checked in; it presses the buttons for you except the one that opens the passkey prompt, which is yours.
`pnpm --filter @turnstile/web run judge -- --base <origin>` runs that path headless (a virtual platform
authenticator answers the prompts; `--seed x` uses a dev identity on dev builds) and prints the per-step
timings; frames land in `apps/web/shots/`. The demo video follows it: `docs/demo-video-storyboard.md`.

On a small machine (≤ 2 GB) build the web app with `pnpm --filter @turnstile/web build:lite` and let the
relayer serve it (`STATIC_DIR=../web/dist-lite`); `apps/web/README.md` has the details and the headless
screenshot tooling.

## Deployments

| Chain | Forwarder | Factory | Implementation | Events |
| --- | --- | --- | --- | --- |
| Monad testnet (10143) | [`0xf6b8…3F34`](https://testnet.monadvision.com/address/0xf6b8b8E2cF881b01fFbeb3e97004591201333F34) | [`0x5C6e…42B2`](https://testnet.monadvision.com/address/0x5C6e597E96cBDf408537611554E2a53Da75042B2) | [`0x7e17…Fa3f`](https://testnet.monadvision.com/address/0x7e17B9EE54e2F2058950181B09794590b87DFa3f) | club [`0x79a3…21B5`](https://testnet.monadvision.com/address/0x79a3e41Cbb8acd8c9A1A61a929bdBa302d3121B5) · theatre [`0x9c4b…3029`](https://testnet.monadvision.com/address/0x9c4b7a654680b5a4d382b22bdAA10FB05DC23029) |

Deployed 14 Sep 2026 from block 62 312 597, all three contracts verified on MonadVision (Sourcify, runtime
match). `packages/contracts/deployments/10143.json` is the source of truth for the relayer, the indexer and
the web app — read it, do not copy addresses around. Runbook and gas figures: `docs/deploy-monad-testnet.md`.

**Live** (web + relayer on Monad testnet, the submission origin since 15 Sep 2026): <https://turnstile.work>
— `/api/health` for the relayer, `pnpm smoke -- --relayer https://turnstile.work --rpc https://testnet-rpc.monad.xyz`
runs the full buy → bind → resale → check-in path against it. Both seed events' `baseURI` point here
(`https://turnstile.work/api/events/<id>/tickets/`, re-pointed 15 Sep 2026 with `script/SetBaseURI.s.sol`;
`tokenURI(1)` of the club resolves to live metadata). The relayer reads and writes through the Alchemy Monad
testnet RPC with the public RPC as read fallback (`/api/health` → `rpc.provider`). The same build also answers on
the rehearsal host `turnstile-michellecox8789.replit.app`, which the web labels `staging` on its own (an amber
chip in the header; any `*.replit.app` host gets it) — passkeys are per origin, so ones created there do not
work on `turnstile.work`. Token metadata carries an `image` (`…/tickets/<id>/image.svg`, a rendered card of the
seat in its tier, amber until check-in, green after) and an `external_url`; both are built from `PUBLIC_ORIGIN`
(set it on every deployed relayer), else from the request's own `Host`.

Two production knobs the relayer adds on top (`apps/relayer/.env.example`): `RPC_FALLBACK_URLS` /
`PUBLIC_RPC_FALLBACK_URLS` turn the relayer's and the browser's RPC into a viem `fallback` — reads fail over
to the next provider, transactions stay pinned to the primary so nonces never split across providers — and
`/api/health` reports the provider label, host and latency. With a custom `PUBLIC_ORIGIN`, `www.<apex>` and
any `REDIRECT_HOSTS` alias are redirected (301, 308 for non-GET) to the apex before anything is served, so
passkeys — which are scoped to the page's host — only ever exist on one host.

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
the gate (`pnpm smoke` covers the whole round trip with a second identity). Organiser page: publish an
event from a passkey (tiers, venue, resale rules; the deployment's gate key is granted on creation) and
watch sold / inside; the new room lights up in the city at once.
Envio indexer written and tested in-process (events, seats, fans, live feed, per-chain stats, minute
throughput, handovers); `config.yaml` already points at the testnet factory from `deployments/`. The web
app's Live layer reads it — organiser live board, city pulse, attendance record, seat provenance, each with
a freshness chip — and says "unavailable" until `VITE_ENVIO_GRAPHQL_URL` names the hosted deploy, which is
what is left.
Judge mode (guided two-minute run, finale on chain truth) and SPEC v1.3/v1.4's denser entry codes (`TS2:`
QR-alphanumeric, then `TS3:` with an RFC 9285 base45 blob: the ticket QR drops from 57 to 49 to 41 modules;
`TS1|` and `TS2:` still decode). Venue tiers are now derived from the seat rows.
Deployed to Monad testnet (`deployments/10143.json`, verified on MonadVision) with the two seed events; sales
stay open until 13 Nov 2026. Web + relayer live on the final domain <https://turnstile.work> since 15 Sep 2026
(custom domain, Alchemy RPC with public fallback, passports in Postgres, no environment label): the final-origin
preflight passes 24/25 (only the optional `www` forward is missing), `pnpm smoke` runs the whole path there in
13.2 s, and `pnpm --filter @turnstile/web run judge -- --base https://turnstile.work` lands on a lit seat in
45.9 s / 6 taps / 2 passkey prompts with three testnet transactions; both seed events' `baseURI` were re-pointed
the same day and `tokenURI` resolves to metadata whose `image.svg` renders. What remains before submission —
public website, Envio-powered live layer, device matrix, video — is ordered in `docs/remaining-work-plan.md`;
the runbooks it points at are `docs/final-domain-migration.md`, `docs/envio-hosted-handoff.md` and
`docs/demo-video-storyboard.md`.

## License

MIT — see `LICENSE`.
