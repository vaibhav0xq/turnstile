# Deploying Turnstile to Monad testnet (10143)

Checklist and exact commands for the first deployment. Everything here was rehearsed on a fork of the live
testnet (`anvil --fork-url https://testnet-rpc.monad.xyz`) on 12 Sep 2026; gas and MON figures below come from
that run. Verification and faucet facts come from `docs.monad.xyz` and the explorer APIs as of the same day.

Live facts checked on 12 Sep 2026: chain id `10143`, base fee **100 gwei** (protocol minimum), suggested
priority fee 2 gwei, block gas limit 150M, client `Monad/0.16.2`, MonadVision Sourcify API answering for chains
143 and 10143 (v1 and v2 endpoints).

Done on 14 Sep 2026. Addresses, blocks and what was actually charged are in `packages/contracts/README.md`
and `research/notes.md`; the deployer key was read from a secret store (`--private-key "$VAR"`) instead of a
keystore because the deploy ran on a shared sandbox disk. Kept here as the procedure for mainnet/redeploys.

Two Monad rules shape everything below:

- **Gas is charged on the gas *limit*, not gas used.** A transaction with a 1M limit that uses 100k gas pays
  for 1M. Tight limits matter on every wallet, and Foundry's default `--gas-estimate-multiplier 130` is 30 %
  overpay by design.
- **A transaction is only accepted if `balance ≥ gas_limit × max_fee_per_gas + value`.** Forge bids
  `max_fee = 2 × base_fee + tip` (≈ 203 gwei today), so the deployer needs roughly *twice* the MON it will
  actually spend, per transaction, at the moment it sends.

---

## 1. Wallets and accounts

| Wallet | Kind | Where the key lives | Role on chain |
| --- | --- | --- | --- |
| **deployer** | Foundry keystore (`cast wallet import`), password-protected | `~/.foundry/keystores/deployer` on your machine only | Sends the 3 deployment txs. Also the **organiser** of the two seed events (`msg.sender` of `createEvent` gets `DEFAULT_ADMIN_ROLE` and receives ticket proceeds) |
| **relayer** | Hot EOA (`cast wallet new`) | Replit Secrets as `RELAYER_PRIVATE_KEY` when `packages/relayer` exists; password manager until then | Calls `ERC2771Forwarder.execute` for fans (`buy` on free tiers, `bindDoorKey`, `list`, `delist`). No on-chain role |
| **gate** | Hot EOA (`cast wallet new`) | Replit Secrets as `GATE_SIGNER_PRIVATE_KEY`; password manager until then | Holds `GATE_ROLE` on each event; calls `checkIn` / `checkInWithBind` |
| **demo buyer** (optional) | Any wallet you control (MetaMask on Monad testnet, or a second keystore) | your wallet | Buys paid tiers directly for demos. Paid tiers are not relayed (the relayer would have to front the MON) |

Not needed: an organiser wallet separate from the deployer (testnet), a multisig, a Privy/embedded wallet.
Fan accounts are passkey-derived keys and never hold MON.

Rules: never paste a private key into a `.env` that could be committed; the repo `.gitignore` covers `.env` but
not your shell history. Keystores and hot keys are chain identities, unrelated to git identity. Commits stay
under `vaibhav0xq` as always.

### Create them

```bash
# deployer: fresh key straight into an encrypted keystore (prompts for a password, so keep it)
cast wallet import deployer --private-key $(cast wallet new | grep 'Private key:' | awk '{print $3}')
cast wallet address --account deployer            # → DEPLOYER address; write it down

# relayer and gate: plain hot keys. Copy "Private key" into your password manager / Replit Secrets NOW;
# it is printed once.
cast wallet new                                   # → RELAYER address + key
cast wallet new                                   # → GATE address + key
```

Optional but useful: the three contract addresses are known before you deploy (CREATE, deployer nonce 0/1/2):

```bash
D=$(cast wallet address --account deployer)
cast compute-address $D --nonce 0   # forwarder
cast compute-address $D --nonce 1   # implementation
cast compute-address $D --nonce 2   # factory
```

(Only valid while the deployer has never sent a transaction on 10143. Faucet claims *to* the address do not
change its nonce.)

## 2. Deployer wallet requirements

- Foundry ≥ 1.8 (`forge --version`; `foundry.toml` already has `network = "monad"`, solc 0.8.28, `prague`).
- Nonce 0 on 10143 if you want the pre-computed addresses; otherwise irrelevant.
- Balance: see §5. Minimum that gets all three deployment txs accepted at today's fees: **1.5 MON**.
  Comfortable, including the two seed events and one retry: **3 MON**.
- The keystore password at hand (forge prompts; or `--password-file`).

## 3. Relayer wallet requirements

- Plain EOA, no role, no contract interaction other than `forwarder.execute(request)`.
- Sets **hard-coded gas limits per inner call** (Monad charges the limit). Measured with the Monad gas model
  (forge 1.8.1, `network = "monad"`), `execute` including the forwarder's own work; the "tx gas" column adds the
  21k intrinsic cost and ≈ 8k of calldata for a signed request:

  | relayed call | `execute` gas measured | ≈ tx gas | limit to send | cost @ 102 gwei |
  | --- | --- | --- | --- | --- |
  | `buy` (free tier) | 238 587 | 268 k | **320 000** | 0.033 MON |
  | `buy` (paid tier, value forwarded) | 230 585 | 260 k | 320 000 | 0.033 MON |
  | `bindDoorKey` | 180 230 | 209 k | **250 000** | 0.026 MON |
  | `list` | 168 522 | 198 k | **240 000** | 0.024 MON |
  | `delist` | 125 625 | 155 k | **190 000** | 0.019 MON |

  The forwarder adds ≈ 100k on top of the direct call (EIP-712 recovery, nonce, the inner `CALL`, event).
  `req.gas` inside the signed request should be the direct-call figure plus margin (`buy` 147k → 200 000,
  `bindDoorKey` 76k → 110 000, `list` 64k → 90 000, `delist` 21k → 40 000); the outer tx limit is the column above.
  The forwarder insists on `gasleft ≥ req.gas × 64/63` at the inner call and burns everything otherwise, so the
  outer limit must stay ≥ `req.gas × 64/63 + ~50k`, which is true for every pair above.
- Simulates before sending (`eth_call` the exact `execute`), because OZ's `ERC2771Forwarder.execute` reports an
  inner revert only as `FailedCall()`.
- Uses `eth_maxPriorityFeePerGas` (2 gwei today) and `max_fee = base_fee + tip`, not forge's 2× bid.
- Balance alert at 1 MON; never let it reach 0 mid-demo. It cannot because the reserve floor below stops
  sponsorship first.

### 3a. Spend safety (relayer and gate)

The relayer pays for every forwarded action, every testnet drip and every check-in, so it brakes on its own
(`apps/relayer/src/spend-guard.ts`, knobs in `.env.example`, all optional):

| Brake | Default | Refusal |
| --- | --- | --- |
| Reserve floor per wallet: no send whose worst-case cost (gas limit × price; drips are sent with a fixed 21k limit) would leave the wallet below it, counting the cost already held back for work in flight; an unreadable balance also pauses | relayer 1 MON (`RELAYER_RESERVE_WEI`), gate 0.2 MON (`GATE_RESERVE_WEI`) | `503 SPONSOR_PAUSED` |
| Class budgets per rolling hour / day: `relay` (forwarded fan actions), `drip`, `gate` | relay 60 / 300, drip 10 / 40, gate 300 / 2000 (`*_HOURLY_LIMIT`, `*_DAILY_LIMIT`) | `429 BUDGET_EXHAUSTED` |
| Per-address quota per rolling day: the fan's `from` for relay, the recipient for drip | relay 24, drip 2 (`RELAY_DAILY_PER_ADDRESS`, `DRIP_DAILY_PER_ADDRESS`) | `429 QUOTA_EXCEEDED` |
| Bounded queue per wallet: sends stay sequential (that is what keeps nonces in order); past `TX_QUEUE_MAX` pending a request is refused at once, and one that has waited `TX_QUEUE_MAX_WAIT_MS` is refused on its own timer, even if the send ahead of it is hanging on the RPC | 8 pending, 20 s | `503 BUSY` |
| Per-IP limits: 30 relay, 10 drip, 20 passport writes per minute; the address is the proxy-written `X-Forwarded-For` entry (the `TRUSTED_PROXY_HOPS`-th public hop from the right, default 1, internal hops skipped), never one the client sent | | `429 RATE_LIMITED` |

Worst case at the defaults: 60 relays × 0.033 + 10 drips × 0.1 ≈ 3 MON an hour, ≈ 14 MON a day, and the
floor ends it before the wallet is empty. Every refusal carries `Retry-After` and a `retryAfterSec` in the body;
the web app shows the reason and auto-retries only `RATE_LIMITED` / `BUSY`.

Everything is in memory: budgets restart empty and the queue only orders one process. The deployment must run a
**single instance** (autoscale max machines 1, or a reserved VM). Two processes sharing the relayer key would
race nonces and double every budget. `GET /api/health` reports:

- `instance`: a random per-process id; call it a few times, one id means one process;
- `sponsorship.wallets.{relayer,gate}`: `balanceWei`/`balanceMon`, `reserveWei`, `inflight` (charged sends
  not yet settled) and `reservedWei` (the worst-case cost held back for them, each at its own class's
  estimate), `ok` (balance minus the reservation is still above the floor);
- `sponsorship.budgets.{relay,drip,gate}`: `hour`/`day` `{ used, limit }` and `perAddressDay`;
- `sponsorship.spentWei`: estimated spend of the last hour / day from settled receipts (gas limit × price paid);
- `sponsorship.queue.{relayer,gate}`: `{ pending, max }`; `sponsorship.paused` when either wallet is at its floor.

Public addresses and on-chain balances only; no key material or provider URL appears anywhere in it.
`GET /api/ip` echoes what the limiter sees for the caller (`ip`, `source`, `forwardedEntries`,
`forwardedPattern`: the chain's shape as `public`/`internal`/`invalid` per entry, addresses withheld,
and `trustedProxyHops`). Loopback and private hops (the path router in front of the process) are skipped
automatically, and a connection whose socket peer is a public address is keyed by that peer with its
headers ignored (it did not come through the proxy chain).

`TRUSTED_PROXY_HOPS` must equal the number of public entries in that chain, read from a client that sent
no forwarding header (then the leftmost public entry is the client, every public entry after it is a
proxy, and the limiter counts public entries from the right (1 is the rightmost). `pnpm preflight
--origin …` checks exactly that and prints the value to set, and it sends a forged `X-Forwarded-For`
expecting it ignored. The two origins differ: the dev origin's chain is `client, private hop, loopback`
(1 public → hops 1); the published origin sits behind Google's load balancer and the platform's proxies,
which append three public addresses after the client: `client, P, P, P` (4 public → **hops 4**, verified
15 Sep 2026 from two outside networks). Too low is fail-closed but keys visitors by a proxy's address,
a rotating one on the published origin, so one visitor's requests land in unrelated buckets and the
per-minute limits mean nothing; too high would take a client-sent entry. The published chain *appends* to
a client-sent header rather than replacing it (the dev origin replaces), so the forged-entry check matters
there. Repeat both checks on every new origin and after any platform change to the proxy layout.

## 4. Gate signer requirements

- Plain EOA with `GATE_ROLE` on every event it scans for. The seed script grants it at creation
  (`GATE_ADDRESS`); for events created later the organiser grants it:

  ```bash
  cast send $EVENT "grantRole(bytes32,address)" $(cast keccak "GATE_ROLE") $GATE \
    --account deployer --rpc-url monad_testnet --gas-limit 80000
  ```

- Gas limits: `checkIn` measures 115 k (≈ 139 k as a tx with intrinsic + calldata) → send **180 000**;
  `checkInWithBind` 171 k (≈ 197 k) → send **250 000**. ≈ 0.018 / 0.026 MON per scan at 102 gwei.
- The gate wallet's key lives in the gate app's backend, never in the browser scanner. Slot tolerance on chain is
  ±1 slot (30 s each); the scanner still applies `{current, current − 1}` on its own clock.
- Balance alert at 0.5 MON; check-ins pause below the 0.2 MON reserve floor (§3a).

## 5. Funding on Monad testnet

Measured on the testnet fork at base fee 100 gwei (`max_fee` bid 203 gwei, forge default multiplier 130 %):

| Step | Gas used | Gas limit (charged) | Needs in wallet to be accepted | Actually charged (≈ 102 gwei) |
| --- | --- | --- | --- | --- |
| `ERC2771Forwarder` | 874 869 | 1 137 329 | 0.23 MON | 0.116 MON |
| `TurnstileEvent` implementation | 3 885 095 | 5 050 623 | **1.03 MON** | 0.515 MON |
| `TurnstileFactory` | 574 129 | 746 367 | 0.15 MON | 0.076 MON |
| Deploy total | 5 334 093 | 6 934 319 | ≥ 1.5 MON at start | **≈ 0.71 MON** |
| Seed event "Neon Night" | 624 577 | 811 950 | 0.17 MON | 0.083 MON |
| Seed event "Act III" | 648 752 | 865 477 | 0.18 MON | 0.088 MON |

Recommended balances before you start:

| Wallet | Fund | Covers |
| --- | --- | --- |
| deployer | **3 MON** | deploy (0.71) + seed events (0.17) + one full retry, and passes every per-tx balance check |
| relayer | **5 MON** | ≈ 150 relayed txs at 320k limit, a full demo run plus development |
| gate | **2 MON** | ≈ 100 check-ins at 180k limit |
| demo buyer | 1 MON | booth 0.05 MON + gas for a handful of paid buys |

Total ≈ 11 MON. Faucets (all rate-limited, so start claiming into the **deployer** now and redistribute later):

- Official `https://faucet.monad.xyz`: enter address; connecting X / Discord raises the amount.
- Alchemy `https://www.alchemy.com/faucets/monad-testnet`: 1 MON / 24 h, no account.
- QuickNode `https://faucet.quicknode.com/monad/testnet`: one claim / 12 h, needs a dust ETH balance on Ethereum mainnet.
- Chainstack `https://faucet.chainstack.com/monad-testnet-faucet`: 0.5 MON / 24 h, sign-in.

Redistribute from the deployer once it holds enough:

```bash
cast send $RELAYER --value 5ether --account deployer --rpc-url monad_testnet --gas-limit 21000
cast send $GATE    --value 2ether --account deployer --rpc-url monad_testnet --gas-limit 21000
cast balance $RELAYER --rpc-url monad_testnet --ether
```

Thin-wallet variant (≈ 1.0 MON is enough): bid closer to the base fee and trim the multiplier. Check the
base fee first; if it has moved above your bid the tx is rejected, nothing is lost.

```bash
cast base-fee --rpc-url monad_testnet          # expect 100000000000 (100 gwei)
forge script script/Deploy.s.sol --rpc-url monad_testnet --account deployer --broadcast --slow \
  --with-gas-price 105gwei --priority-gas-price 2gwei --gas-estimate-multiplier 115 \
  --verify --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/ --retries 10 --delay 10
```

## 6. RPC and environment variables

`packages/contracts/foundry.toml` already defines the aliases used below:

```toml
[rpc_endpoints]
monad_testnet = "https://testnet-rpc.monad.xyz"   # QuickNode public, 50 rps (25 rps eth_call / estimateGas), archive
monad         = "https://rpc.monad.xyz"
```

Alternatives if the public endpoint rate-limits you: `https://rpc.ankr.com/monad_testnet` (no `debug_*`),
`https://rpc-testnet.monadinfra.com` (20 rps, no batching), or your Alchemy/QuickNode app URL
(`ALCHEMY_MONAD_RPC` / `QUICKNODE_MONAD_RPC` in `.env`). Pass any of them as `--rpc-url <url>`.

Environment read by the scripts (export in the shell or put in `packages/contracts/.env` and `source` it, since forge
does not load `.env` on its own):

| Variable | Used by | Value |
| --- | --- | --- |
| `FORWARDER` | `Deploy.s.sol` | leave **unset** for the first deployment; set to reuse an existing forwarder when redeploying only implementation + factory |
| `GATE_ADDRESS` | `CreateDemoEvent.s.sol` | the gate EOA, which grants `GATE_ROLE` at creation |
| `START_IN` | `CreateDemoEvent.s.sol` | seconds until the seed events start. Use **`3888000`** (45 days) so sales stay open while `apps/web` is built; the default 2 h closes sales an hour later |
| `BASE_URI` | `CreateDemoEvent.s.sol`, `SetBaseURI.s.sol` | `https://<your-web-host>/api/events/`: placeholder is fine at seeding; `SetBaseURI.s.sol` re-points every event you administer once the host exists (done 14 Sep 2026 for the staging origin; re-pointed 15 Sep 2026 to `https://turnstile.work/api/events/`: club `0xe8a6e7…019a`, theatre `0xc00f34…a24c`, 87 258 gas each) |
| `MONADSCAN_API_KEY` | only the Monadscan fallback in §7 | free key from monadscan.com |

Nothing else: no `PRIVATE_KEY` variable anywhere. The deployer is a keystore, `--account deployer`.

Pre-flight:

```bash
cd packages/contracts
forge --version                                   # ≥ 1.8.0
forge soldeer install && forge test               # 61 green
cast chain-id --rpc-url monad_testnet             # 10143
cast base-fee --rpc-url monad_testnet             # ~100000000000
cast balance $(cast wallet address --account deployer) --rpc-url monad_testnet --ether   # ≥ 1.5, ideally 3
ls deployments/                                   # only .gitkeep, no stale 10143.json
```

## 7. Verification settings

Primary: **MonadVision (Sourcify)**. No API key. Works with our `bytecode_hash = "none"` / `cbor_metadata = false`
(the bytecode carries no metadata hash, so Sourcify records a *runtime match*, shown as verified; an
"exact match" would need the CBOR trailer back, which changes bytecode and gas, so it is not worth it).

| Setting | Value |
| --- | --- |
| `--verifier` | `sourcify` |
| `--verifier-url` | `https://sourcify-api-monad.blockvision.org/`: **keep the trailing slash**; forge appends `v2/verify/…` |
| `--chain` | `10143` |
| API key | none |
| Explorer | `https://testnet.monadvision.com/address/<address>` |

Forge 1.8 speaks Sourcify API v2, and the MonadVision instance serves both v1 and v2 (checked:
`POST /v2/verify/10143/<addr>` validates input, `GET /check-by-addresses` answers). Verification runs inside the
deploy command (`--verify`) for all three contracts; constructor args are taken from the broadcast automatically.

Fallback per contract (same result, run after the fact, for example if the explorer's RPC lagged during the deploy):

```bash
S="--chain 10143 --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/"
forge verify-contract $FORWARDER dependencies/@openzeppelin-contracts-5.6.1/metatx/ERC2771Forwarder.sol:ERC2771Forwarder $S
forge verify-contract $IMPLEMENTATION src/TurnstileEvent.sol:TurnstileEvent $S
forge verify-contract $FACTORY src/TurnstileFactory.sol:TurnstileFactory $S
```

Secondary: **Monadscan (Etherscan-compatible)**, needs constructor args and an API key:

```bash
E="--chain 10143 --verifier etherscan --verifier-url https://api-testnet.monadscan.com/api --etherscan-api-key $MONADSCAN_API_KEY --watch"
forge verify-contract $FORWARDER dependencies/@openzeppelin-contracts-5.6.1/metatx/ERC2771Forwarder.sol:ERC2771Forwarder \
  --constructor-args $(cast abi-encode "constructor(string)" "Turnstile Forwarder") $E
forge verify-contract $IMPLEMENTATION src/TurnstileEvent.sol:TurnstileEvent \
  --constructor-args $(cast abi-encode "constructor(address)" $FORWARDER) $E
forge verify-contract $FACTORY src/TurnstileFactory.sol:TurnstileFactory \
  --constructor-args $(cast abi-encode "constructor(address)" $IMPLEMENTATION) $E
```

Event clones are EIP-1167 proxies to the verified implementation; explorers show them as proxies. Nothing to verify per event.

## 8. Deploy: exact command

```bash
cd packages/contracts
forge script script/Deploy.s.sol \
  --rpc-url monad_testnet --account deployer --broadcast --slow \
  --verify --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/ \
  --retries 10 --delay 10
```

`--slow` sends each tx only after the previous one is mined (three dependent deployments; costs seconds).
Forge prompts for the keystore password, simulates, prints the estimate, broadcasts, then verifies.

Expected console (addresses will be yours):

```
== Logs ==
  chainId          10143
  forwarder        0x…
  implementation   0x…
  factory          0x…
  wrote deployments/10143.json
Estimated total gas used for script: 6934319
Estimated amount required: 1.4076… MON          ← this is the max-fee bid; actual charge ≈ 0.71 MON
ONCHAIN EXECUTION COMPLETE & SUCCESSFUL.
Transactions saved to: …/broadcast/Deploy.s.sol/10143/run-latest.json
##
Start verification for (3) contracts
…
Contract successfully verified            ← ×3
```

Immediately after:

```bash
cat deployments/10143.json
F=$(jq -r .factory deployments/10143.json); I=$(jq -r .implementation deployments/10143.json); W=$(jq -r .forwarder deployments/10143.json)
cast call $F "implementation()(address)"   --rpc-url monad_testnet    # = $I
cast call $F "trustedForwarder()(address)" --rpc-url monad_testnet    # = $W
cast call $F "eventCount()(uint256)"       --rpc-url monad_testnet    # 0
for A in $F $I $W; do curl -s "https://sourcify-api-monad.blockvision.org/v2/contract/10143/$A"; echo; done   # "runtimeMatch":"match" ×3
# (the v1 check-by-addresses endpoint on this instance answers status "false" even for verified contracts, so ignore it)
```

## 9. Seed events: exact command

```bash
cd packages/contracts
export GATE_ADDRESS=0x…                                   # the gate EOA from §1
export START_IN=3888000                                   # 45 days
export BASE_URI=https://turnstile.example/api/events/    # placeholder until apps/web has a host
forge script script/CreateDemoEvent.s.sol --rpc-url monad_testnet --account deployer --broadcast --slow
```

Expected: `club 0x…`, `theatre 0x…`, `Estimated total gas used for script: ~1677000`, `Estimated amount required: ~0.23 MON`
(actual ≈ 0.17 MON). The addresses are deterministic (`predictEventAddress(1)` / `(2)` on the factory) and the
`EventCreated` events are what the indexer will pick up first.

Sanity checks:

```bash
cast call $F "eventCount()(uint256)" --rpc-url monad_testnet          # 2
CLUB=$(cast call $F "eventAt(uint256)(address)" 1 --rpc-url monad_testnet)
cast call $CLUB "name()(string)" --rpc-url monad_testnet               # "Neon Night at Metropolis"
cast call $CLUB "hasRole(bytes32,address)(bool)" $(cast keccak "GATE_ROLE") $GATE_ADDRESS --rpc-url monad_testnet   # true
cast call $CLUB "tierAt(uint256)((string,uint96,uint32,uint32))" 0 --rpc-url monad_testnet
cast call $CLUB "salesEndAt()(uint64)" --rpc-url monad_testnet         # = startsAt ≈ now + 45 d (club sales run until doors; theatre closes 30 min before)
```

Then fund the relayer and gate (§5) and, once `.env` exists for the apps, record the public addresses:
`RELAYER_ADDRESS`, `GATE_ADDRESS`, and the event addresses for the demo pages.

## 10. Output files

| File | Written by | Contents |
| --- | --- | --- |
| `packages/contracts/deployments/10143.json` | `Deploy.s.sol` (during simulation, before broadcast) | `chainId, forwarder, implementation, factory, deployedAtBlock, deployedAt, solc`: the single source of truth for indexer, relayer and web |
| `packages/contracts/broadcast/Deploy.s.sol/10143/run-latest.json` + `run-<timestamp>.json` | forge | tx hashes, gas, receipts, contract addresses, deployer address. No secrets |
| `packages/contracts/broadcast/CreateDemoEvent.s.sol/10143/run-latest.json` + `run-<timestamp>.json` | forge | same for the two `createEvent` txs; event addresses in `additionalContracts` |
| `packages/contracts/cache/Deploy.s.sol/10143/run-latest.json` | forge | "sensitive" run data: **ignored**, never commit |
| `~/.foundry/keystores/deployer` | cast | encrypted key, never leaves your machine |

Because `deployments/10143.json` is written before the broadcast, a failed or interrupted broadcast leaves a file
that names contracts that may not exist: delete it (or re-run and let it be overwritten). See §12.

## 11. What to commit afterwards

```
packages/contracts/deployments/10143.json
packages/contracts/broadcast/Deploy.s.sol/10143/run-latest.json
packages/contracts/broadcast/Deploy.s.sol/10143/run-<ts>.json
packages/contracts/broadcast/CreateDemoEvent.s.sol/10143/run-latest.json
packages/contracts/broadcast/CreateDemoEvent.s.sol/10143/run-<ts>.json
packages/contracts/README.md          ← fill the "Deployments" table (addresses + explorer links + block)
README.md                             ← status line: "deployed to Monad testnet <date>, verified on MonadVision"
research/notes.md                     ← dated entry: addresses, gas actually charged, anything that deviated from this doc
```

Suggested commit message: `Deploy Turnstile v0.1.0 to Monad testnet (10143)`. Nothing under `broadcast/**/dry-run/`,
`cache/`, `out/`, `dependencies/` or any `.env`, which are all ignored already. Send me the three addresses (or the JSON)
and I will wire them into the indexer config and `apps/web` from the sandbox side.

## 12. Failure and debug checklist

| Symptom | Cause | Fix |
| --- | --- | --- |
| `insufficient funds for gas * price + value` at broadcast | balance < `gas_limit × max_fee` for that tx (the implementation tx alone needs ≈ 1.03 MON present) | top up, or use the thin-wallet variant in §5; then `--resume` (below) |
| `max fee per gas less than block base fee` | you passed `--with-gas-price` below the current base fee | `cast base-fee`, raise the bid, re-run |
| Broadcast stopped after 1 or 2 txs | RPC hiccup, rate limit, or funds ran out mid-way | `forge script script/Deploy.s.sol --rpc-url monad_testnet --account deployer --resume --verify …` continues with the remaining txs and keeps the same addresses. Then compare `deployments/10143.json` with `broadcast/…/run-latest.json`; delete the JSON and redeploy fully only if they disagree |
| `nonce too low` / `already known` | the deployer sent something else meanwhile, or a previous attempt landed | `cast nonce $D --rpc-url monad_testnet`; `--resume` if the earlier txs are on chain, otherwise delete `broadcast/Deploy.s.sol/10143/` and start over (addresses will differ from the pre-computed ones) |
| Rate-limited (`429`, `too many requests`) | public RPC (25 rps for `eth_call`/`estimateGas`) | `--slow` is already on; switch `--rpc-url` to Ankr or your Alchemy app URL |
| Deploy succeeded, verification failed or timed out | explorer indexer lag, or the missing trailing slash on `--verifier-url` | run the §7 fallback commands; check with `curl …/check-by-addresses…`. Nothing on chain needs to change |
| `Contract source code already fully verified` | fine, a previous attempt succeeded | nothing |
| Verification says bytecode mismatch | local build differs from what was deployed (edited a source after deploying, different solc/optimizer, or `forge clean` with a changed `foundry.toml`) | check out the deployed commit, `forge build`, re-verify; if truly different, redeploy. Never edit `deployments/*.json` by hand to paper over it |
| `buy` reverts `SalesClosed` a few hours after seeding | `START_IN` was left at its 2 h default, so the club's sales window (which ends at `startsAt`) has passed | seed again with `START_IN=3888000`; the old events stay on chain and are harmless, or extend with `setSalesEnd` (≤ `startsAt`) |
| `CreateDemoEvent`: `vm.readFile` permission / file not found | run from `packages/contracts`, `deployments/10143.json` must exist | `cd packages/contracts`; the `fs_permissions` in `foundry.toml` cover `./deployments` |
| Gate `checkIn` reverts `AccessControlUnauthorizedAccount` | `GATE_ADDRESS` was unset/wrong at creation | grant with the `grantRole` command in §4 |
| `checkIn` reverts `SlotOutOfWindow` | phone/gate clock more than one slot from block time | check NTP on the scanning device; the app signs `floor(Date.now()/30000)` |
| Relayer sees `FailedCall()` | inner call reverted (wrong price, sales closed, not holder, expired signature) | simulate with `cast call $EVENT "<fn>" … --from $HOLDER`; forwarder swallows the reason by design |
| Tx "pending" much longer than a second | Monad has no public mempool; a rejected tx just disappears | `cast receipt <hash>`; if nothing after ~10 s, it was dropped. Re-send with a correct nonce/fee |
| Anything unclear in a trace | | `forge script … -vvvv` (simulation only), `cast run <txhash> --rpc-url monad_testnet` for a mined tx, or open the hash in Tenderly (`dashboard.tenderly.co/explorer`) |

Rehearsal without spending anything: `anvil --fork-url https://testnet-rpc.monad.xyz --port 8546` in one shell, then
the §8/§9 commands with `--rpc-url http://127.0.0.1:8546 --private-key 0xac09…ff80` (anvil's funded account 0)
and without `--verify`. Delete `deployments/10143.json` and `broadcast/*/10143/` afterwards. The real
deployment must not inherit rehearsal files.
