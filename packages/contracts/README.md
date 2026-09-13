# @turnstile/contracts

Foundry package. `TurnstileFactory` deploys one `TurnstileEvent` clone per event; a clone is an ERC-721 with
**one token per seat**, a **door key** per ticket, a **one-shot check-in** over the EIP-712 `Entry` code from
`@turnstile/identity`, and a **capped resale** path with instant payouts. Nothing else can move a ticket.

Status: implemented, 62 tests green (unit, ERC-2771, shared vectors, invariants). Not audited. Not yet deployed.

## What is on chain

```
ERC2771Forwarder ("Turnstile Forwarder")        OpenZeppelin, shared by every event; the relayer pays gas
        │ trusted by
TurnstileEvent (implementation, init-disabled)  ERC721 + AccessControl + EIP712 + ERC2771Context, ReentrancyGuardTransient
        │ cloned (EIP-1167, salt = eventId) by
TurnstileFactory                                permissionless createEvent(); registry eventAt / eventIdOf / predictEventAddress
```

### Ticket lifecycle

| Step | Who signs | Function | Notes |
| --- | --- | --- | --- |
| Buy a seat | holder (account key), via relayer or directly | `buy(seatId)` payable | exact face value in MON; free tiers are fully gasless through the forwarder; proceeds pushed to the organiser in the same tx |
| Comp | organiser | `mintTo(seatId, to)` | face value 0 → can be passed on at price 0, never sold |
| Bind door key (happy path) | holder, right after purchase, via relayer | `bindDoorKey(tokenId, doorKey)` | re-bind = rotation; every bind bumps `bindNonceOf(tokenId)` |
| Bind by signature | anyone submits, holder signed `BindDoorKey` | `bindDoorKeyWithSig(tokenId, doorKey, deadline, sig)` | EIP-712, same domain as `Entry`, see SPEC §4.5 |
| Enter | door key signs `Entry`, gate submits | `checkIn(tokenId, slot, sig)` | `GATE_ROLE` only; slot within ±1 of `block.timestamp / 30`; once per token; clears any listing |
| Enter without a bound key | holder signed `BindDoorKey`, door key signed `Entry`, gate submits | `checkInWithBind(tokenId, doorKey, deadline, bindSig, slot, entrySig)` | atomic bind + check-in; the fallback, not the default |
| Resell | holder | `list(tokenId, price)` / `delist(tokenId)` | `price ≤ faceValue × resaleCapBps / 10000`; closes at `startsAt`; `resaleCapBps = 0` disables resale |
| Buy a listing | buyer | `buyListing(tokenId)` payable | exact price; fee `resaleFeeBps` → organiser, rest → seller, both pushed now; door key cleared; the only transfer that succeeds |

`transferFrom` / `safeTransferFrom` revert `TransferLocked`; `approve` / `setApprovalForAll` revert
`ApprovalsDisabled`. `tokenURI = baseURI + tokenId` (organiser-settable).

### EIP-712

Domain `{ name: "Turnstile", version: "1", chainId, verifyingContract: <clone> }` — computed per clone by
`EIP712Upgradeable`, so a code signed for one event is meaningless at another (and on another chain).

- `Entry(uint256 eventId,uint256 tokenId,uint64 slot)` — `ENTRY_TYPEHASH = 0x618c00ee…cf06`, signer = bound door key.
- `BindDoorKey(uint256 tokenId,address doorKey,uint256 nonce,uint256 deadline)` — `BIND_TYPEHASH = 0xd6a0a17a…1422`, signer = current holder.

`test/Vectors.t.sol` etches a clone at `0x…E0E1` on chain 10143 and verifies `../identity/vectors/entry.json`
and `bind.json` byte for byte (digests, recovered signers, and `vm.sign` reproducing the exact signatures).

### Design notes

- **Per-seat ERC-721** so seat, owner, door key, check-in state and resale rule are one inspectable record and map
  1:1 onto the seat picker. Tiers (`tierAt`, `tierOf`) are contiguous seat ranges with a face value.
- **Slot tolerance ±1 on chain**, `{current, current − 1}` in the gate app (SPEC §4.2): the chain is the last
  line, not the first. Replay is impossible either way — one check-in per token.
- **Resale inside the event** instead of a separate market + splitter: the cap and the split are event rules, and
  the transfer lock has exactly one exception, guarded by a transient flag around `_update`.
- **Push payments** (`_pay`): the organiser is fixed at creation, the seller is the current holder; a recipient
  that rejects MON only blocks its own sale (`PayoutFailed`). The contract never holds funds (invariant).
- **Clones + ERC-2771**: the forwarder address is an immutable on the implementation, shared by all clones;
  `_msgSender()` is the holder when called through it. Only holder actions are relayed; `checkIn` is the gate's.
- **`ReentrancyGuardTransient`** (OZ 5.6) — no storage slot, clone-safe; `buy` and `buyListing` are guarded.
- Solidity 0.8.28, `evm_version = "prague"`, `network = "monad"` (Monad gas model, MIP-8), Foundry ≥ 1.8.

## Commands

```bash
# one-time: Foundry ≥ 1.8 (foundryup), then dependencies via Soldeer (no git submodules)
pnpm --filter @turnstile/contracts deps      # forge soldeer install → dependencies/ (gitignored, lock committed)
                                              # (root `pnpm build` / `pnpm test` install them on first run and skip when forge is absent)

forge build                                   # runs forge lint as well (config in foundry.toml)
forge test                                    # 62 tests; FOUNDRY_PROFILE=ci forge test for deeper fuzz/invariants
forge test --match-contract VectorsTest -vv  # the shared-vector conformance suite
forge fmt --check && forge lint
pnpm snapshot:check                           # .gas-snapshot (deterministic tests, whole-test gas) — regression guard
forge test --gas-report                       # per-function gas — the table below
forge build --sizes                           # TurnstileEvent ≈ 18.1 KB runtime
pnpm abi                                      # regenerate abi/index.ts from out/ (abi:check guards it)
```

Dependencies: `forge-std 1.14.0`, `@openzeppelin-contracts 5.6.1`, `@openzeppelin-contracts-upgradeable 5.6.1`
(`foundry.toml [dependencies]`, `soldeer.lock`, hand-written `remappings.txt`).

## Deploy

Full runbook — wallets, funding maths (Monad charges the gas *limit*; forge bids 2× base fee), verification,
expected output, what to commit, failure table: [`docs/deploy-monad-testnet.md`](../../docs/deploy-monad-testnet.md).

```bash
# keystore once: cast wallet import deployer --interactive   (never a raw key in .env)
forge script script/Deploy.s.sol --rpc-url monad_testnet --account deployer --broadcast --slow \
  --verify --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/ --retries 10 --delay 10
# → deployments/10143.json { forwarder, implementation, factory, deployedAtBlock … } — commit it
# (keep the trailing slash on --verifier-url: forge appends v2/verify/…)

GATE_ADDRESS=0x… START_IN=3888000 BASE_URI=https://<web>/api/events/ \
forge script script/CreateDemoEvent.s.sol --rpc-url monad_testnet --account deployer --broadcast --slow
# → "Neon Night at Metropolis" (300 free GA + 12 booths at 0.05 MON, cap 110 %, fee 5 %)
#   "The Metropolis Players: Act III" (Stalls / Circle / Balcony, face-value resale, fee 10 %)
# START_IN is seconds until doors; sales stay open until then, so use weeks, not the 2 h default.
```

Rehearsed on a fork of the live testnet (`anvil --fork-url https://testnet-rpc.monad.xyz`): deploy uses
5.33M gas across three txs (6.93M charged as limit, ≈ 0.71 MON at 102 gwei), each seed event ≈ 0.09 MON.
`[rpc_endpoints]` in `foundry.toml`: `monad_testnet` (10143, `https://testnet-rpc.monad.xyz`) and `monad`
(143, `https://rpc.monad.xyz`). Verification: MonadVision Sourcify (primary, no key) or Monadscan
(Etherscan-compatible, key + constructor args).

### Deployments

| Network | Forwarder | Implementation | Factory | Block | Verified |
| --- | --- | --- | --- | --- | --- |
| Monad testnet (10143) | — | — | — | — | — |

## Gas (max of successful calls, `forge test --gas-report`)

| `createEvent` | `buy` | `bindDoorKey` | `bindDoorKeyWithSig` | `checkIn` | `checkInWithBind` | `list` | `delist` | `buyListing` | forwarder `execute` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 625 k | 147 k | 76 k | 93 k | 115 k | 171 k | 64 k | 21 k | 133 k | 91–240 k |

Monad charges the gas **limit**, not the gas used: the relayer and the gate wallet should set limits from this
table plus ~25 %, never a blanket 1 M. `.gas-snapshot` (whole-test figures) guards regressions in CI.

## Interfaces the other packages rely on

- Indexer (Envio): `TurnstileFactory.EventCreated`, `TicketMinted`, `DoorKeyBound`, `DoorKeyCleared`, `CheckedIn`,
  `Listed`, `Delisted`, `ListingFilled`, `SalesEndUpdated`, `BaseURIUpdated`, plus ERC-721 `Transfer`.
- Relayer: forwards `buy` (free tiers), `bindDoorKey`, `list`, `delist` through `ERC2771Forwarder.execute`;
  simulate first — OZ's single `execute` reports an inner revert only as `FailedCall()`. Gate wallet holds
  `GATE_ROLE` and calls `checkIn` / `checkInWithBind`.
- Web: `entryDigest` / `bindDigest` / `isSlotAcceptable` views mirror the identity package; `predictEventAddress`
  lets the organiser flow show the event address before the transaction lands. `seatStates(firstSeat, count)`
  returns `{holder, doorKey, checkedInAt, listingPrice, listed}` for a range in one call (unsold and
  out-of-tier ids read as zeroes) — the seat picker paints a 400-seat room from three RPC calls, no indexer needed.
- Typed ABIs: `abi/index.ts` (`turnstileEventAbi`, `turnstileFactoryAbi`, `erc2771ForwarderAbi`, `as const`) is
  generated from the forge artifacts by `pnpm --filter @turnstile/contracts abi` and imported as
  `@turnstile/contracts/abi`; `abi:check` (part of `check` and CI) fails when it is stale.

## Follow-ups (not blocking the demo)

- USDC / AUSD pricing via `permit` (native MON only today).
- Organiser-initiated refunds / cancellation path (today: tickets are final; the organiser can `mintTo` replacements).
- Fallback code format `TS1B…` carrying `(doorKey, deadline, bindSignature)` — to be frozen with the gate app.
- Per-token metadata renderer on chain (today: `baseURI + tokenId`, served by the web app).
- Audit before mainnet; `resaleCapBps` / `resaleFeeBps` are immutable per event by design.
