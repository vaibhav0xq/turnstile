# packages/indexer

Envio HyperIndex for Turnstile. One factory, every night it creates, every seat, every fan — as a GraphQL API
the organiser page, the door feed and the passport can read without an RPC in sight.

## What it indexes

| Entity     | Keyed by                     | Holds                                                                                    |
| ---------- | ---------------------------- | ---------------------------------------------------------------------------------------- |
| `Event`    | event contract address       | organiser, name, venue, doors; sold / comps / inside / listed / resales; primary & resale volume, fees |
| `Ticket`   | `<event>-<tokenId>`          | tier, holder, face value, current door key, listing price, check-in time, handovers      |
| `Fan`      | passkey account address      | seats held, seats ever taken, nights attended, first / last seen — the attendance record behind the passport |
| `Activity` | `<chain>-<block>-<logIndex>` | the live feed: `MINT · BIND · LIST · DELIST · RESALE · CHECKIN`, actor, counterparty, amount, tx |

`TurnstileFactory.EventCreated` registers each clone dynamically (`context.chain.TurnstileEvent.add`), so a
night published from `/organise` is indexed from its first block. `DoorKeyCleared` (emitted inside a resale)
updates the seat without a feed row — the `RESALE` row tells that story.

## Layout

```
config.yaml            chains + events; the chains block is generated (see below)
schema.graphql         the four entities above
src/handlers/          the handlers (HyperIndex v3 API: indexer.onEvent / indexer.contractRegister)
test/handlers.test.ts  the life of one seat replayed through the real handlers with simulated logs
scripts/sync-config.mjs  writes the factory address + start block from packages/contracts/deployments/<chainId>.json
```

## Commands

```sh
pnpm codegen       # regenerate .envio/ types from config.yaml + schema.graphql
pnpm sync-config   # point config.yaml at the deployed factory (run after every deployment)
pnpm typecheck     # sync-config --check, codegen, tsc
pnpm test          # 5 tests, no Docker: createTestIndexer() runs the handlers in-process
pnpm dev           # local HyperIndex + Hasura (needs Docker — not part of the sandbox loop)
```

## Deployment

The indexer targets Monad testnet (`10143`) through HyperSync (`monad-testnet.hypersync.xyz`), so it needs
the testnet factory first: deploy (`docs/deploy-monad-testnet.md`), commit `deployments/10143.json`, run
`pnpm sync-config`, then deploy this directory to Envio's hosted service from the GitHub repo (root
`packages/indexer`, `config.yaml`). The relayer and the web app keep working without it; once the endpoint
exists, the organiser page and the passport can read their history from it instead of scanning logs.
