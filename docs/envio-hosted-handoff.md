# Envio hosted indexer: handoff checklist

`packages/indexer` is a complete HyperIndex indexer for the testnet factory; it has never been deployed
because Envio Cloud needs a GitHub-linked account, which only you can create. This is what exists, what to
click, what to check, and what to wire up afterwards so the bounty's "actually driving a feature" line is met.

## What exists

| Piece | Where | State |
|-------|-------|-------|
| Chains + contracts | `packages/indexer/config.yaml` | Monad testnet `10143`, factory `0x5C6e…42B2`, start block `62312572` (generated from `deployments/10143.json` by `pnpm sync-config`; `TurnstileEvent` clones register dynamically from `EventCreated`) |
| Schema | `schema.graphql` | `Event`, `Ticket`, `Fan`, `Activity`, per-chain `Stats`, minute throughput `EventMinute`, and immutable resale `Handover` rows (+ `ActivityKind`: MINT · BIND · UNBIND · LIST · DELIST · RESALE · CHECKIN) |
| Handlers | `src/handlers/turnstile.ts` | `EventCreated` plus every seat-lifecycle event (`TicketMinted`, `DoorKeyBound`, `DoorKeyCleared`, `Listed`, `Delisted`, `ListingFilled`, `CheckedIn`); the admin settings events `SalesEndUpdated` / `BaseURIUpdated` are deliberately not indexed. `DoorKeyCleared` inside a resale updates the seat without a feed row |
| Tests | `test/handlers.test.ts` | 5 in-process tests (`createTestIndexer`), no Docker; run by `pnpm verify` |
| Runtime | `package.json` | `envio ^3.5.0` (lock resolves 3.10.0), Node ≥ 24, pnpm 10, all inside Envio Cloud's requirements (≥ 2.21.5, not 2.29.x, pnpm 10.32-compatible) |
| Repo size | | ~0.6 MB packed; the 100 MB limit is not a concern |

The web app's Live layer (`apps/web/src/live/`, 14 Sep 2026) consumes the GraphQL endpoint when
`VITE_ENVIO_GRAPHQL_URL` is set: organiser live board, city pulse, attendance record, seat provenance, each
with the freshness chip. Until the hosted deploy exists the variable stays unset and those surfaces say
"unavailable"; the relayer and the seat map still read chain state over RPC.

The current generated chains block contains Monad testnet only. Once a Monad mainnet deployment exists,
`sync-config` can add chain `143` beside `10143`; chain-qualified entity ids let both networks share one
indexer without deterministic event or account addresses colliding.

## 1. Account and first deployment (you)

Source: <https://docs.envio.dev/docs/HyperIndex/hosted-service-deployment>.

**Done 15 Sep 2026 (12:00 to 12:12 UTC).** Indexer `turnstile` in org `vaibhav0xq`, development tier, public;
root `packages/indexer`, config `config.yaml`, deployment branch **`envio-deploy`** (not `main`: on the
development tier every deployment has its own URL and every push to the branch re-indexes, so the branch only
moves when the indexer changes). First deployment = commit `6f13b3d`, endpoint
`https://indexer.dev.hyperindex.xyz/1aff1ac/v1/graphql`. Note the id `1aff1ac` changes with each new
deployment. Two things the docs do not say: Envio ignores pushes that touch nothing under the root directory
(an empty commit did not register; a README change under `packages/indexer` did), and the build + sync took
under three minutes (38 events from block 62 312 967, caught up at 12:12:18 UTC).

- [x] <https://envio.dev/app/login> → *Log in with GitHub* (the `vaibhav0xq` account that owns the repo).
- [x] Select the personal organisation; install the **Envio Deployments GitHub App** with access to
      `vaibhav0xq/turnstile` (that repo only is fine).
- [x] *Add Indexer*:
      - repository `vaibhav0xq/turnstile`
      - **root directory** `packages/indexer`
      - **config file** `config.yaml` (relative to the root directory)
      - **deployment branch** `envio-deploy` (was planned as `main`; see above)
      - name `turnstile`
- [x] Save; the first build starts from the first push that changes the root directory. Watch the build log to the end once. The
      likely trip-wire is the install step: `packages/indexer` is a pnpm workspace member, so `pnpm install`
      from that folder walks up to `pnpm-workspace.yaml` and installs the whole workspace. That works in CI
      here (esbuild and `@parcel/watcher` build scripts are already ignored in the workspace file). If the
      hosted build still fails on install, tell me the log line; the fallback is a dedicated deployment
      branch where `packages/indexer` carries its own lockfile (`pnpm install --ignore-workspace` in that
      folder, committed there only) and the indexer's *deployment branch* points at it.
- [x] Sync: the factory has a handful of events since block 62 312 572, so HyperSync is done in minutes.
      The dashboard shows *synced* and the GraphQL URL (`https://indexer.dev.hyperindex.xyz/<id>/v1/graphql`).

Development-plan rules that matter for the timeline (submission 22 Sep to 14 Oct, judging after):

- 3 indexers per organisation, 3 deployments per indexer (delete old ones in the dashboard to free a slot).
- **Deployments older than 30 days are deleted.** Every push to `main` creates a new deployment (full
  re-index from the start block, previous one keeps serving until the new one is synced) and restarts that
  clock. A normal cadence of commits keeps it alive; if `main` goes quiet, push a no-op before day 30.
- Soft limits: 100 000 events, 5 GB, or **no requests for 7 days** → 7-day grace, then read-only, then
  deletion. Once the web app queries it (§3) ordinary traffic covers this; until then run a query yourself
  once a week or set an uptime pinger on a `{ Event { id } }` POST.

## 2. Verify the endpoint

Point a GraphQL client (the playground the dashboard links to, or `curl`) at the URL and run these.
Expected values follow the chain: the club (`0x79a3e41cbb8acd8c9a1a61a929bdba302d3121b5`, eventId 1) has the
smoke-test seats plus one per judge run; the theatre (`0x9c4b…3029`, eventId 2) may still be at zero.

```graphql
# both seed events, with the counters the organiser page shows
{ Event(where: { chainId: { _eq: 10143 } }, order_by: { eventId: asc }) {
    id chainId address eventId name organiser startsAt sold comps checkedIn listed resales primaryVolume resaleVolume resaleFees } }

# every seat on the club, newest first
{ Ticket(where: { chainId: { _eq: 10143 }, event: { address: { _eq: "0x79a3e41cbb8acd8c9a1a61a929bdba302d3121b5" } } }, order_by: { tokenId: desc }) {
    id tokenId tier faceValue comp doorKey listedPrice checkedInAt mintedAt handovers holder { id } } }

# the attendance record behind the passport
{ Fan(where: { chainId: { _eq: 10143 } }, order_by: { checkIns: desc }, limit: 10) {
    id chainId address tickets bought checkIns firstSeenAt lastSeenAt } }

# the live feed
{ Activity(where: { chainId: { _eq: 10143 } }, order_by: { timestamp: desc }, limit: 20) {
    id kind actor counterparty amount timestamp txHash event { eventId } ticket { tokenId } } }
```

Checks:

- [x] `Event.sold` / `checkedIn` for the club equal the club entry's `sold` / `checkedIn` in
      `https://<origin>/api/events` (the relayer reads the contract directly).
- [x] The judge-run seat shows `checkedInAt` set and a `CHECKIN` row whose `counterparty` is the gate wallet
      (`0x6FA9…F9CF`) and whose `txHash` is the admit hash on the summary card.
- [x] The smoke test's resale shows as `LIST` → `RESALE` rows, `handovers: 1` on that seat, `doorKey: null`
      after the resale until the buyer rebinds.
- [x] Id casing: entity ids are prefixed by the chain id and their address portions are lower-case. Query the
      explicit `chainId` and lower-case `address` fields rather than constructing ids in clients.
- [x] Note the endpoint URL and the deployment id in `research/notes.md`.

## 3. Wire it into the app (me, once the URL exists)

The bounty wants Envio "powering real on-chain data driving a core feature", not installed. Two places
where the indexer does something the RPC path cannot, in the order worth doing them:

1. **Door feed and organiser feed from `Activity`.** Today the gate's *Tonight* list is this browser's own
   admissions and the organiser page shows `sold / inside` counters from the contract. With the indexer both
   become the venue's live feed across every device: `CHECKIN` rows on the gate page (`Seat 15 · General
   Admission · admitted · 1.2 s` for everyone, not just this scanner), the full `MINT · BIND · LIST · RESALE
   · CHECKIN` stream on `/organise`, with explorer links from `txHash`. Poll every ~4 s, which is simpler than
   subscriptions and plenty for the volume.
2. **Passport history from `Fan`.** `checkIns`, `bought`, `firstSeenAt` under the passkey's address on `/me`:
   "3 nights · since 14 Sep" is the attendance record the passport promises and it is pure chain history.

Mechanics:

- Env: `VITE_ENVIO_GRAPHQL_URL=https://indexer.dev.hyperindex.xyz/<id>/v1/graphql` in the production
  environment (build-time for Vite, so it needs a republish), plus the root `.env` for local dev. When unset
  the Live surfaces render an explicit "unavailable" line (the landing's city pulse simply stays hidden);
  no silent fake data. Done 14 Sep: `apps/web/src/live/` (client, queries, hooks, pure model + tests) and
  `apps/web/src/ui/live/` (LiveBoard, CityPulse, PassportHistory, Provenance, LiveChip); the queries below
  are the ones the client sends, `tokenId` travels as a string for the `numeric` column.
- The browser POSTs straight to Hasura (`{"query": "..."}`, no auth on the dev plan). If CORS turns out to
  be blocked from the origin, proxy through the relayer (`/api/feed/<event>` → indexer) instead; the relayer
  already has an outbound HTTP path.
- Tanstack Query hooks next to the existing seat-map hook; the `Activity` id is a stable cursor for
  "new since last poll".
- Tests: a fixture of the four queries' JSON shapes; the handler tests already pin the entity fields.
- README: "Indexer: deployed on Envio Cloud: `<url>`; the door feed, organiser stream and passport history
  read from it" and the bounty line; `docs/README.md` index; `.env.example` comment loses "later:".

### Web app queries

These are the four surfaces the web app's Live layer renders, enabled only when
`VITE_ENVIO_GRAPHQL_URL` is set. Every `$address` / `$addresses` variable must be lower-cased: the indexer
stores all address-valued fields lower-cased (see the schema header), so `_eq` is exact.

#### Organiser live board

```graphql
query OrganiserLiveBoard($chainId: Int!, $address: String!) {
  Event(where: { chainId: { _eq: $chainId }, address: { _eq: $address } }, limit: 1) {
    id
    chainId
    address
    name
    sold
    comps
    checkedIn
    listed
    resales
    primaryVolume
    resaleVolume
    resaleFees
  }
  Activity(
    where: { chainId: { _eq: $chainId }, event: { address: { _eq: $address } } }
    order_by: [{ timestamp: desc }, { block: desc }]
    limit: 20
  ) {
    id
    kind
    actor
    counterparty
    amount
    timestamp
    txHash
    ticket { tokenId tier }
  }
  EventMinute(
    where: { chainId: { _eq: $chainId }, event: { address: { _eq: $address } } }
    order_by: { minute: desc }
    limit: 30
  ) {
    minute
    mints
    checkIns
    resales
    volume
  }
}
```

#### Passport history

```graphql
query PassportHistory($chainId: Int!, $address: String!) {
  Fan(where: { chainId: { _eq: $chainId }, address: { _eq: $address } }, limit: 1) {
    id
    chainId
    address
    tickets
    bought
    checkIns
    firstSeenAt
    lastSeenAt
  }
  Activity(
    where: { chainId: { _eq: $chainId }, actor: { _eq: $address } }
    order_by: [{ timestamp: desc }, { block: desc }]
  ) {
    id
    kind
    amount
    timestamp
    txHash
    event { name address }
    ticket { tokenId }
  }
}
```

#### City pulse

```graphql
query CityPulse($chainId: Int!, $addresses: [String!]!) {
  Stats(where: { chainId: { _eq: $chainId } }, limit: 1) {
    events
    sold
    comps
    checkedIn
    resales
    fans
    primaryVolume
    resaleVolume
    resaleFees
    lastActivityAt
    lastBlock
  }
  Event(
    where: { chainId: { _eq: $chainId }, address: { _in: $addresses } }
    order_by: { startsAt: asc }
  ) {
    id
    address
    name
    sold
    comps
    checkedIn
    listed
    resales
    primaryVolume
    resaleVolume
  }
  Activity(
    where: { chainId: { _eq: $chainId }, event: { address: { _in: $addresses } } }
    order_by: [{ timestamp: desc }, { block: desc }]
    limit: 10
  ) {
    id
    kind
    actor
    amount
    timestamp
    event { name address }
    ticket { tokenId }
  }
}
```

#### Ticket provenance

```graphql
query TicketProvenance($chainId: Int!, $eventAddress: String!, $tokenId: numeric!) {
  Activity(
    where: {
      chainId: { _eq: $chainId }
      ticket: {
        chainId: { _eq: $chainId }
        tokenId: { _eq: $tokenId }
        event: { address: { _eq: $eventAddress } }
      }
    }
    order_by: [{ timestamp: asc }, { block: asc }]
  ) {
    id
    kind
    actor
    counterparty
    amount
    timestamp
    block
    txHash
    event { name address }
    ticket { tokenId tier }
  }
}
```

## 4. Bounty checklist (Best Use of Envio)

- [x] Public repo with `config.yaml`, `schema.graphql`, handlers: `packages/indexer`.
- [x] Deployed indexer (Envio Cloud URL in the README): §1.
- [ ] A feature that runs on it, visible in the demo: §3 (the door feed in scene 6 / the organiser feed as
      B-roll; a line in the voice-over: "the door feed comes from an Envio indexer, not from an RPC").
- [ ] Alive through judging: the 30-day and 7-day rules in §1.
