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

Copy `.env.example` to `.env` and provide keys. For local Anvil, run `pnpm dev:chain` at the repository
root (which deploys and seeds events), then `pnpm --filter @turnstile/relayer dev`.

The viem clients poll receipts every 400 ms (Monad's block time); with the default 4 s a relayed buy or
check-in would report ~4 s instead of well under a second.

## Smoke test

`pnpm smoke` (root) runs `scripts/smoke.mjs` against a live relayer + chain: it derives a dev identity
(the same PRF seeds the web app uses with `?dev=<seed>`), picks the first free seat, signs the ERC-2771
`ForwardRequest`s for `buy` and `bindDoorKey`, posts them to `/api/relay`, mints a rotating entry code,
looks it up and checks it in through `/api/gate/*`, and asserts a replay is refused with `ALREADY_CHECKED_IN`.
Flags: `--relayer <url>` (or `RELAYER_URL`), `--rpc <url>`, `--seed fan-2`, `--event <index>`, `--seat <id>`,
`--gate-token <token>` (or `GATE_TOKEN`), `--no-gate` to stop after the bind. On anvil the whole flow takes
about two seconds.

## API

```sh
curl localhost:8787/api/health
curl localhost:8787/api/config
curl localhost:8787/api/events
curl localhost:8787/api/events/0xEventAddress/42
curl -X POST localhost:8787/api/relay -H 'content-type: application/json' -d '{"request":{...}}'
curl 'localhost:8787/api/gate/lookup?code=TS1%7C...'
curl -X POST localhost:8787/api/gate/check-in -H 'content-type: application/json' -d '{"code":"TS1|..."}'
curl -X POST localhost:8787/api/drip -H 'content-type: application/json' \
  -d '{"to":"0x90F79bf6EB2c4f870365E785982E1f101E93b906"}'
```

All responses are JSON and all big integers are decimal strings. Gate check-in accepts
`Authorization: Bearer <GATE_TOKEN>` when configured.

| Relayed action | Forward request gas | Transaction gas |
| --- | ---: | ---: |
| `buy(uint256)` | 200000 | 320000 |
| `bindDoorKey(uint256,address)` | 110000 | 250000 |
| `list(uint256,uint96)` | 90000 | 240000 |
| `delist(uint256)` | 40000 | 190000 |