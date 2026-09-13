# Turnstile relayer

Hono service that publishes chain/event configuration, submits signed ERC-2771 fan actions, validates
rotating entry codes and submits gate check-ins, provides a development faucet, and serves ticket metadata.

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `RPC_URL` | yes | Private JSON-RPC endpoint |
| `PUBLIC_RPC_URL` | no | Browser endpoint; defaults to `RPC_URL` |
| `CHAIN_ID` | yes | Expected RPC and deployment chain |
| `DEPLOYMENTS_FILE` | no | Deployment JSON; defaults to the contracts deployment for the chain |
| `RELAYER_PRIVATE_KEY` | yes | Gas-paying relayer key |
| `GATE_SIGNER_PRIVATE_KEY` | yes | Account holding `GATE_ROLE` |
| `GATE_TOKEN` | no | Bearer token required by check-in |
| `DRIP_ENABLED` | no | `1` enables the development faucet |
| `DRIP_AMOUNT_WEI` | no | Faucet transfer, default 0.1 MON |
| `EXPLORER_URL` | no | Explorer returned to clients |
| `CORS_ORIGIN` | no | `*` or comma-separated origins |
| `PORT` | no | HTTP port, default 8787 |
| `STATIC_DIR` | no | Directory of a built `apps/web` to serve with SPA fallback (one deployable) |
| `DATABASE_URL` | no | Postgres for the passport store; unset = the JSON file below |
| `PASSPORT_FILE` | no | Passport JSON file without Postgres, default `.data/passports-<chainId>.json`; empty = memory only |

Copy `.env.example` to `.env` and provide keys. For local Anvil, run `pnpm dev:chain` at the repository
root (which deploys and seeds events), then `pnpm --filter @turnstile/relayer dev`.

The viem clients poll receipts every 400 ms (Monad's block time); with the default 4 s a relayed buy or
check-in would report ~4 s instead of well under a second.

## Smoke test

`pnpm smoke` (root) runs `scripts/smoke.mjs` against a live relayer + chain: it derives a dev identity
(the same PRF seeds the web app uses with `?dev=<seed>`), picks the first free seat, signs the ERC-2771
`ForwardRequest`s for `buy` and `bindDoorKey` and posts them to `/api/relay`, then runs the resale round
trip — an over-cap ask is refused with `PriceAboveCap`, the seat is listed at 0, the seller's own
`buyListing` is refused with `SelfPurchase`, a second identity (`<seed>-taker`) takes it through the relayer,
the door key is cleared and rebound, and the seller's old entry code is refused at the gate with
`BAD_SIGNATURE` — and finally mints the new holder's rotating entry code, looks it up and checks it in
through `/api/gate/*`, and asserts a replay is refused with `ALREADY_CHECKED_IN`.
Flags: `--relayer <url>` (or `RELAYER_URL`), `--rpc <url>`, `--seed fan-2`, `--event <index>`, `--seat <id>`,
`--gate-token <token>` (or `GATE_TOKEN`), `--no-resale`, `--no-gate` to stop after the bind, `--leave-listed`
to stop once listed (a passed-on seat stays on the map for the UI). On anvil the whole flow takes about
three seconds.

## API

```sh
curl localhost:8787/api/health
curl localhost:8787/api/config                 # add ?fresh=1 to skip the 15 s event cache
curl localhost:8787/api/events
curl localhost:8787/api/events/3/tickets/42    # tokenURI target; /api/events/0xEventAddress/42 also works
curl -X POST localhost:8787/api/relay -H 'content-type: application/json' -d '{"request":{...}}'
curl 'localhost:8787/api/gate/lookup?code=TS1%7C...'
curl -X POST localhost:8787/api/gate/check-in -H 'content-type: application/json' -d '{"code":"TS1|..."}'
curl -X POST localhost:8787/api/drip -H 'content-type: application/json' \
  -d '{"to":"0x90F79bf6EB2c4f870365E785982E1f101E93b906"}'
curl localhost:8787/api/passport/0x90F79bf6EB2c4f870365E785982E1f101E93b906          # → { blob, issuedAt, updatedAt } | 404
curl -X PUT localhost:8787/api/passport/0x90F7… -H 'content-type: application/json' \
  -d '{"blob":"v1.<iv>.<ct>","issuedAt":1789300000000,"signature":"0x…"}'
```

All responses are JSON and all big integers are decimal strings. Gate check-in accepts
`Authorization: Bearer <GATE_TOKEN>` when configured. Events are discovered from the factory
(`eventCount` / `eventAt`), so one published from the organiser page shows up without a restart.

The passport store (identity SPEC §4.6) holds each fan's private passport as the ciphertext blob their
vault key produced — the relayer cannot read it. A write must carry an EIP-191 signature from the account
key over `turnstile/passport-sync/v1 \n address \n keccak256(blob) \n issuedAt`, `issuedAt` within five
minutes and newer than the stored watermark (`409 REPLAYED` otherwise), and a blob of at most 16 KiB; an
empty blob clears the passport but keeps the watermark. Records live in Postgres when `DATABASE_URL` is set
— the watermark check runs inside the upsert, so several relayer processes and a host without a durable
disk are fine — and otherwise in `PASSPORT_FILE` (default `.data/passports-<chainId>.json`, git-ignored).
The schema is `db/schema.sql`; apply it once with `pnpm --filter @turnstile/relayer db:setup` — the relayer
refuses to start against a database without the table and never runs DDL itself. Reads are public, since a
blob says nothing without the passkey.

| Relayed action | Forward request gas | Transaction gas |
| --- | ---: | ---: |
| `buy(uint256)` | 200000 | 320000 |
| `buyListing(uint256)` — free listings only (value is always 0; a priced listing fails simulation with `WrongPrice` and the fan pays for it directly) | 200000 | 320000 |
| `bindDoorKey(uint256,address)` | 110000 | 250000 |
| `list(uint256,uint96)` | 90000 | 240000 |
| `delist(uint256)` | 40000 | 190000 |