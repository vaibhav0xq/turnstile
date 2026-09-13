# Research Notes: Monad Metropolis Hackathon — investigation before building

**Status:** complete — report at `research/monad-metropolis-report.md` (delivered 2026-09-12)
**Depth:** Deep (7 parallel research tracks + direct primary-source verification)
**Date:** 2026-09-12 (IST)

## Plan

- **Question:** What exactly are the Metropolis rules, deadlines, tracks, bounties and judging; what is everyone else building; which single idea should we build first; and what concrete visual/3D direction should the landing + demo take?
- **Scope:** Official Monad sources first (monad.xyz, hackathon.monad.xyz, Luma, Discord), then ecosystem/competitor scouting (X, GitHub, news, prior Monad hackathons), then sponsor bounty tech, then the 5 design inspiration sites + the attached UX/UI guides. Out of scope: writing any product code.
- **Audience:** Founder/builder deciding what to build and how to present it.
- **Deliverable:** 20-section investigation report (executive summary → next steps) saved as `research/monad-metropolis-report.md`.

## Verified so far (direct from official pages, 12 Sep 2026)

- Official name: **Metropolis** ("the Metropolis global hackathon", "Metropolis Hackathon on Monad"). Organizer: **Monad Foundation**. [@monad-metropolis-page] [@platform-home]
- Build window **1 Sep → 13 Oct 2026**, online, global. Registration opened 1 Sep. Judging 14–27 Oct. Winners 3 Nov. [@monad-metropolis-page]
- Platform (`hackathon.monad.xyz`) header countdown reads **"Oct 14 · 03:59 UTC"** and states "Program dates stay in UTC" → submission deadline is effectively **13 Oct 23:59 EDT = 14 Oct 03:59 UTC = 14 Oct 09:29 IST**. [@platform-prizes]
- Platform status today: **"Intake · Open"** — sign in with GitHub / Google / Discord; "One button signs you in or starts your registration." **No 13 Sep registration cutoff found anywhere official.** [@platform-home]
- Prize structure: 4 tracks × $30,000 (split $10k/$10k/$10k for 1st/2nd/3rd) + $25,000 Grand Champion + sponsor bounties stacked on top. Pick ONE primary track; add unlimited bounties. [@platform-prizes] [@monad-metropolis-page]
- Submission = working product + public project profile: demo, short write-up, link to code. Open source encouraged, not required; judges must be able to verify work done in the window. Existing team/context OK, but what is shown on 13 Oct must be built during the six weeks. Solo OK. [@monad-metropolis-page]
- Country restrictions: "listed in the official rules on the application platform" (login-gated). [@monad-metropolis-page]
- Chain shown on platform: **Monad, Chain ID 143 (mainnet)**. [@platform-home]

## Focus Areas

| # | Area | Status | Sources |
|---|---|---|---|
| 1 | Official rules, judging precedent, community channels | running | -- |
| 2 | Monad developer stack (Sep 2026) | running | -- |
| 3 | Sponsor bounties — what each requires | running | -- |
| 4 | Ecosystem / competitor scouting | running | -- |
| 5 | Design inspiration A (pryzm, feralui, jiro) | running | -- |
| 6 | Design inspiration B (skiper-ui, threeui) | running | -- |
| 7 | Attached UX/UI guides — keep vs ignore | running | -- |

## Coverage Checklist

- [x] Exact registration + submission deadline (with timezone)
- [x] Is 13 Sep a real cutoff? Is late registration possible?
- [x] Submission requirements (demo, video, repo, deployment, chain)
- [x] Judging criteria (official or by precedent)
- [x] All tracks + all sponsor bounties with requirements
- [x] Rules / disqualification risks
- [x] Monad tech: RPC, faucet, explorer, wallets, AA/passkeys, indexers, oracles
- [x] What others are building; crowded vs underserved
- [x] Concrete visual direction from the 5 inspiration sites
- [x] What in UX.md / UI.md is worth keeping

## Findings Log

_[@key] markers reference sources in research/sources.json._

(filled as subagent results arrive)

## Conflicts & Open Questions

- Rise In (unofficial aggregator) lists deadline "Oct 12, 2026" and start "Aug 31" — almost certainly a timezone artefact of the UTC times; official pages say 1 Sep–13 Oct. To verify against the platform countdown.
- Screenshot thread reads "@withAUSD: Best mobile trading app"; the brief typed "USDtb" — the sponsor is Agora (AUSD). To confirm.

## Gaps

(filled after gap analysis)


## Findings log (final, 2026-09-12)

- Deadline: platform countdown 2026-10-14T03:59Z (= 13 Oct 23:59 EDT = 14 Oct 09:29 IST). Judging 14–27 Oct; winners 3 Nov. No 13 Sep registration cutoff exists in any official source; Rise In dates are timezone artefacts.
- Prizes: 4 × $30k tracks (10/10/10) + $25k Grand + ≈$76.5k cash bounties + ≈$10k credits. Bounty sponsors verified from official HTML (both $10k bounties = Agora/AUSD; CVI/CVA = Cleanverse; Analytics/Risk = Perpl; Mera ×2 + Community Team = Monad Foundation; Agent Wallet Plugin = MetaMask).
- Judging: per track; no rubric; 18 judges, mostly VCs + Monad leadership + Nansen CEO + Perpl/Alchemy. Precedent criteria (Raingentic): idea, technical execution, presentation/documentation, wow factor.
- Rules: work must be built 1 Sep–13 Oct; working product + public profile (demo, write-up, code). Mainnet vs testnet, team cap, KYC, video requirement = login-gated.
- Stack: mainnet 143 / testnet 10143; 300ms blocks, 600ms finality; gas charged on limit; 7702 delegated EOAs keep 10 MON reserve; P256 precompile 0x0100; Mera passkeys (preview); Envio HyperSync 143; Phantom dropped Monad 26 Aug 2026.
- Competition (GitHub, 12 Sep): example ideas already cloned (Elapse live, Settle, Iris, TradeAgent, DeltaMon, ERC-8004 ×4+). Track 3 thinnest. Ticketing on Monad: only old demos, none live, none Metropolis-labelled.
- Design: ThreeUI = only true 3D benchmark; Skiper = motion library; Pryzm/Feral = atmosphere + tactile materials; Jiro = 2D catalogue. UX/UI docs: keep 24 rules as floor, ignore template anatomy.
- Recommendation: "Turnstile" — identity-bound tickets & access with a 3D venue seat picker (Track 3); runner-up "Depth" 3D risk terminal (Track 1).

## Conflicts noted

- Block gas limit 150M vs 200M across Monad docs (irrelevant to recommendation).
- Alchemy Monad mainnet support: product page says all mainnets; quickstart says testnet only.
- UK resale price cap: draft bill referenced in one source, delay reported in another (May 2026).
- Bounty sponsor labels on X thread vs official page (PingBusiness vs Agora) — official page wins.

## Gaps (login/sponsor-gated)

Exact rules text, team-size cap, KYC, video requirement, "Community Team" definition, Agora API access for hackers, track-change policy.

## 12 Sep (evening) — pre-spike checks while user registers
- Mera official authenticator matrix captured → sources/bounty-06-mera-authenticator-support.md. PRF confirmed on iOS 18 Safari/Chrome (iCloud Keychain), macOS 15 Safari/Chrome/Firefox, Android Chrome/Edge (Google Password Manager), desktop Chrome signed into Google Password Manager, Windows 11 25H2 Password Manager, 1Password, Proton Pass, YubiKey 5. NOT supported: desktop Chrome local profile, Bitwarden, Dashlane.
- Circle USDC addresses on Monad mainnet + testnet captured → sources/stack-05-usdc-monad-addresses.md. Testnet USDC exists → permit path can be proven on 10143 with the real token.
- Solo re-cut of the build plan applied (turnstile-build-plan.md §4, §12, §13). Awaiting gated rules/eligibility/bounty cards/submission fields from the user; then compare → adjust only where forced → confirm bounties → Mera spike on real devices.
- Filed official-resources.md (logged-in Resources page). No rules/deadlines/eligibility on it. Added §14 addendum to the build plan: claim Tenderly+QuickNode perks, QuickNode as secondary RPC, Tenderly for relayer alerts, Serwist PWA pattern, install Envio/Alchemy agent skills, Passport framed as early-supporter registry that pays, P256 precompile to verify before stretch. Scope unchanged. Mislabel noted: docs.monad.xyz/guides/mera is the passkey guide.

## 12 Sep 2026 (evening) — bounty cards filed; plan revised; spike starts
- Filed: official-07-bounty-{envio,mera-ux,mera-many-keys,community-team,alchemy,privy}.md, official-09-dashboard-status.md, official-10-prizes-judges.md.
- Forced change: Many-Keys card excludes wallet signing as the point → §8 redesigned to three PRF namespaces (account / presence→per-event door keys / vault→encrypted private passport); §5 `setPresenceKey` → `bindDoorKey` + ecrecover in `checkIn`. Old key 0/1/2 design retired.
- UX card: stateless test + TTFT + session scoping now explicit (§3, §8). Privy dropped; organisers on Mera; no injected-wallet fallback.
- Mera API facts (mera.category.xyz/reference): `getPasskeyPrfOutput({ rpId, credential?, prfSalt?, timeout? })` — prfSalt is a caller-supplied 32-byte salt, default sha256("mera.prf.salt.v1"); one ceremony = one prompt = one salt; output = f(credential, rpId, salt). `createPasskeyWithPrfOutput({ rp, user, prfSalt? })` returns { credentialId, prfSalt, prfOutput }; discoverable credential; user.id random per call. Secret vaults: AES-256-GCM, fresh random salt stored in the vault, `createSecretVaultWithNewPasskey / decryptSecretVaultWithPasskey / parseSecretVault`. Error codes: PASSKEY_OPERATION_FAILED, CRYPTO_UNAVAILABLE, PRF_UNAVAILABLE, SESSION_ENDED, DECRYPT_FAILED, INPUT_INVALID, VAULT_FORMAT_INVALID.
- Final bounty targets: Mera UX, Mera Many-Keys, Envio, Alchemy (low effort); Community Team conditional on an onboarded group in the profile dropdown; Privy removed; Aurora stretch (select later if built).
- Submission opens 22 Sep 09:29 IST; rules/eligibility still unpublished; standard requirements = public repo + demo video + deployed on Monad (testnet accepted by Mera card).
- Next: Mera spike on real devices needs an HTTPS origin the phone can open → move to a Replit Project; repo commits/pushes stay under vaibhav0xq's identity.
- Spike built in-sandbox (user declined project move, asked to build here): spike/src/main.js → spike/dist/index.html (248 KB, self-contained); spike/verify.mjs = headless Chromium 152 + CDP virtual authenticator (ctap2_1, RK, UV, hasPrf) → 14/14 checks pass (create/sign-in/door/Entry/vault/stateless/SESSION_ENDED/negative control). Mera 0.2.0 has no deriveEvmKey export — derivation per guide with @scure/bip32+bip39. Docs: docs/device-matrix.md, docs/mera-spike-report.md. Real-device rows pending (needs HTTPS origin: GitHub Pages / Netlify Drop / tunnel).

### 12 Sep, late — first real-device row (Android Chrome 153, GPM) and spike v2
- Device-B/stateless run on `delicate-bienenstitch-69f66f.netlify.app`: capabilities all true (`extension:prf`, hybridTransport, platform authenticator, secure context). Discoverable sign-in ✅ 4931 ms → same account as device A (`0x57fA…BFD2`). Vault ceremony ❌ `PASSKEY_OPERATION_FAILED`. Door step not run. Row NOT marked.
- Code review: spike did not lose the credential — it stored the id returned by the discoverable sign-in and passed it as `credential` → Mera `allowCredentials:[{id, type}]` (no transports; assertions don't carry them). Mera does not need `credential` at all (optional on every call; only effect = `allowCredentials`). So the change between pass and fail = allowCredentials present (+ salt), and the spike had thrown away `ms` and `cause.name` on failure — its own gap.
- Spike v2: failures record elapsed ms + DOMException name/message; steps 3/5 have a ceremony-mode select (discoverable default → same-credential check by id; `id`; `id+transports`); step-5 "Probe all 3 modes"; link/stateless hash carries `c=`/`t=`. Headless 17/17 incl. all three modes passing and unknown-id → `NotAllowedError` @ 14 ms.
- Design rule frozen in report §3: namespaces are addressed discoverably; same-passkey is enforced post-hoc by credentialId equality; allowCredentials is an optional per-platform hint gated by the probe.
- Next: user redeploys `dist/index.html` to the same Netlify site (same rpId keeps the passkeys), reruns Android: discover → 3 → probe → JSON.

### 12 Sep, night — spike gate met on real devices
- Android Chrome 153 + GPM, `bejewelled-gumdrop-74aa24.netlify.app`, spike v2.1: phone flow ✅ (link carried account, door key, 368-char blob, credential w/ transports ["hybrid","internal"]); stateless recovery ✅ — discoverable sign-in 6664 ms, same account + credential id; presence discoverable 5151 ms → same door key; vault discoverable 4210 ms, same credential. Decrypt/Entry not pressed after wipe; probe not run. JSON filed at `docs/device-reports/2026-09-12-android-chrome-gpm-stateless-v2.1.json`.
- Windows laptop via hybrid QR with the same phone: passed per user; no JSON, browser not recorded.
- Matrix: Android row + hybrid row GREEN (with evidence notes). Run-1 by-id failure: closed in design (discoverable + credentialId equality), cause unattributed (probe not run) — note for Category Labs, not blocking.
- Report §4: blockers 1 and 5 cleared; 7 (prompt count) still open. §5 repo setup unblocked. Plan §0 status line added.
- Next: repo — monorepo root + `packages/identity` first (spike port to TS, SPEC.md, KDF vectors, tests with an injected `webAuthnClient`), all git under the user's identity.

### 12 Sep, late night — monorepo root + `packages/identity` written
- Repo at `turnstile/` (delivered as `turnstile-repo.zip`, no git yet — all commits under vaibhav0xq). pnpm 10 workspace (`apps/*`, `packages/*`), Node ≥ 24 running `.ts` directly (type stripping, `.ts` imports rewritten by tsc for `dist/`), Biome 2.5.13, strict TS (exactOptionalPropertyTypes, noUncheckedIndexedAccess, erasableSyntaxOnly). Root `pnpm check` = lint + typecheck + test + vectors:check; CI workflow does the same (`forge` job commented out until contracts exist).
- `@turnstile/identity` 0.1.0: `constants` (frozen labels/salts/TTLs), `kdf` (account BIP-39/44 = Mera default salt; door HKDF `turnstile/door-key/v1` / info `turnstile/door/v1|chainId|addr|counter`; vault HKDF `turnstile/vault-key/v1` / `passport`), `entry` (EIP-712 `Entry(uint256 eventId,uint256 tokenId,uint64 slot)`, typehash `0x618c00ee…cf06`, slots, `TS1|…` code string), `vault` (AES-256-GCM, `v1.<iv>.<ct>`, AAD `turnstile/passport/v1`), `identity` (Mera 0.2.0 wrapper: `createIdentity`, `signIn`, `deriveDoorKey`, `openVault`, `exportRecoveryPhrase`, `withAccountSession`; discoverable ceremonies + credentialId equality → `DIFFERENT_PASSKEY`), `errors` (13 codes + product copy).
- Tests: 39 `node:test` cases incl. an in-memory authenticator (HMAC PRF, discoverable selection, allowCredential, prompt counting, DOMException failures) covering create → discoverable sign-in, stateless second device (same account/door key/vault), DIFFERENT_PASSKEY, expiry/end states, PRF_UNAVAILABLE, CEREMONY_FAILED with cause name + ms, recovery phrase → same address via plain BIP-44.
- Vectors: `vectors/kdf.json` (PRF 0x01..0x20 → account `0x50B2…a8F9`, door keys for 10143/`…E0E1` and 143/`0x1111…`, vault key + fixed-IV blob) and `vectors/entry.json` (domain/typeHash/domainSeparator/structHash/digest, signer `0x29bd…7108`, deterministic signature v=28, entry code, Foundry notes). EIP-712 pieces re-derived by hand (abi.encode + keccak) in tests, independent of viem's typed-data path.
- SPEC.md v1 frozen (namespaces, KDFs, addressing rule, wire formats, prompt budget, error states, versioning). Fresh-clone check: `pnpm install --frozen-lockfile && pnpm check && pnpm build` green; spike `npm ci && npm run build && npm run verify` 17/17.
- Research pruned for the repo: reports, plan, notes, sources.json, subagent syntheses, `sources/official-*` only (≈6 MB of vendor/design scrapes left out).
- Next: `packages/contracts` (Foundry: Factory + Event clones, `bindDoorKey`, one-shot `checkIn` over the vector), then `apps/web`.

### 12 Sep, later — `packages/contracts` written, tested, scripts exercised on anvil
- Toolchain: Foundry 1.8.1 (`foundryup`), deps via Soldeer (`forge soldeer install` → `dependencies/`, gitignored; `soldeer.lock` committed; hand-written `remappings.txt`): forge-std 1.14.0, OpenZeppelin contracts + upgradeable 5.6.1. `foundry.toml`: solc 0.8.28, `evm_version = "prague"`, `network = "monad"` (MIP-8 gas model, needs Foundry ≥ 1.8), `[lint]` tuned (tests ignored; false positives from `_msgSender()`-as-external-call excluded), `[rpc_endpoints]` monad_testnet/monad.
- OZ 5.6.1 facts: no `ReentrancyGuardUpgradeable` → `ReentrancyGuardTransient` (tstore, clone-safe); `Initializable` in `contracts/proxy/utils`; `ERC2771ContextUpgradeable` takes the forwarder as a constructor immutable (shared by all clones); `EIP712Upgradeable` hashes `address(this)` per call → correct domain per clone; `ERC2771Forwarder.execute` does NOT bubble inner reverts (`FailedCall()`), relayer must simulate first.
- Design as agreed: ERC-721 per seat; transfers locked except `buyListing` (transient flag around `_update`); approvals disabled; `bindDoorKey` (holder, via ERC-2771) + `bindDoorKeyWithSig` (holder's EIP-712 `BindDoorKey(tokenId,doorKey,nonce,deadline)`); per-token bind nonce bumped on every bind; `checkIn` by `GATE_ROLE`, slot ±1 of `block.timestamp/30`, once per token, clears listings; `checkInWithBind` = atomic fallback; resale inside the event (cap bps of face value, fee bps to organiser, instant push payouts, closes at `startsAt`, clears door key); comps face value 0; native MON only.
- Tests: 61 green — unit (factory/config/tiers, buy/mintTo, lock/approvals, bind/rebind/withSig/expiry/replay, checkIn window/keys/once/gate-only/listing-cleared, checkInWithBind atomicity, resale list/delist/fill/splits/cap/comp/closed/payout-failure, fuzz splits + slot window), ERC-2771 (relayed free buy, paid buy with value, bind, list/delist, non-holder rejected, untrusted suffix ignored), **shared vectors** (`entry.json` + new `bind.json` verified at `0x…E0E1` on 10143: digests, recover, `vm.sign` reproduces the exact TS signatures; checks in via `checkIn` and via `checkInWithBind`; slot- and chain-bound), invariants (owner only changes via fill, one check-in per token, bind nonce = bind count, listings ≤ cap, contract balance 0, sold = mints; 64 runs × depth 128, resale fills observed).
- Scripts: `Deploy.s.sol` (forwarder → impl → factory, `FORWARDER=` reuse, writes `deployments/<chainId>.json`), `CreateDemoEvent.s.sol` (club: 300 free GA + 12 booths 0.05 MON, cap 110 %, fee 5 %; theatre: 3 priced tiers, face-value resale, fee 10 %; `GATE_ADDRESS`, `START_IN`, `BASE_URI`). Both ran end to end on anvil (31337).
- Identity 0.2.0: `src/bind.ts` (`BIND_TYPEHASH = 0xd6a0a17a…1422`, typed data / digest / hashes / recover), `vectors/bind.json` (account key `0x50B2…a8F9` binds door key `0x29bd…7108` to token 42, nonce 0, deadline slot-start + 600 s, v = 27), 6 new tests (45 total), SPEC v1.1 additive (§4.2 on-chain ±1 note, §4.5 BindDoorKey, §7 revision log). `kdf.json` / `entry.json` byte-identical. Fixed a flaky vault test (flipped the padding bits of the last base64url char — now flips a middle char).
- Repo wiring: `@turnstile/contracts` package (scripts go through `scripts/forge.mjs` so root `pnpm test` skips cleanly without Foundry), `.gitignore` (`packages/contracts/dependencies/`), CI `contracts` job (foundry-toolchain v1.8.1, soldeer install, fmt, lint, build --sizes, test under `FOUNDRY_PROFILE=ci`, snapshot check ±1 %), `.gas-snapshot` committed, root README status.
- Sizes: TurnstileEvent 17.6 KB runtime, factory 2.3 KB. Gas (`forge test --gas-report`, max of successful calls): `createEvent` 625 k, `buy` 147 k, `bindDoorKey` 76 k, `bindDoorKeyWithSig` 93 k, `checkIn` 115 k, `checkInWithBind` 171 k, `list` 64 k, `delist` 21 k, `buyListing` 133 k, forwarder `execute` 91–240 k depending on the inner call. Monad charges the gas *limit*, so the relayer/gate should set limits from this table + ~25 %, not a blanket 1 M.
- Next: user runs `forge soldeer install && forge test` locally, deploys to Monad testnet (`deployments/10143.json`, verify on Sourcify/MonadVision), then `apps/web` (seat picker → buy → bind via relayer → ticket screen with rotating code → gate scanner).

### 13 Sep — Monad testnet deployment path researched and rehearsed (`docs/deploy-monad-testnet.md`)
- Live testnet (12–13 Sep): chain 10143, client `Monad/0.16.2` (docs page still says v0.15.2 / MONAD_NINE), base fee 100 gwei = protocol minimum, `eth_maxPriorityFeePerGas` 2 gwei, `cast gas-price` 102 gwei, block gas limit 150M (docs: 200M), tx gas limit 30M. Gas is charged on the **limit**; a tx is accepted only if `balance ≥ limit × max_fee + value`, and forge bids `max_fee = 2 × base + tip ≈ 203 gwei`, so the deployer needs ~2× what it spends, per tx.
- Rehearsal on `anvil --fork-url https://testnet-rpc.monad.xyz` (picks up the live hardfork; anvil account 0): `Deploy.s.sol` = 3 txs, 5 334 093 gas used / 6 934 319 limit (forwarder 875k/1.14M, implementation 3.89M/5.05M, factory 574k/746k); forge "amount required" 1.41 MON at the 203 gwei bid, actual charge ≈ 0.71 MON at 102 gwei. `CreateDemoEvent.s.sol`: club 624 577 / 811 950, theatre 648 752 / 865 477 → ≈ 0.17 MON. Local `--gas-report` figures match the fork within 0.1 % (createEvent 624 765 local vs 624 577 fork).
- Relayer gas measured with the Monad model, `execute` incl. forwarder work: buy free 238 587, buy paid 230 585, bindDoorKey 180 230, list 168 522, delist 125 625 (+21k intrinsic + ~8k calldata as a tx). Forwarder overhead ≈ 100k over the direct call. Limits chosen: 320k / 320k / 250k / 240k / 190k; gate: checkIn 180k, checkInWithBind 250k. OZ forwarder requires `gasleft ≥ req.gas × 64/63` at the inner call.
- Funding plan: deployer 3 MON (min 1.5 — the implementation tx alone needs 1.03 MON present), relayer 5, gate 2, demo buyer 1 ≈ 11 MON. Faucets: official faucet.monad.xyz (more with X/Discord), Alchemy 1 MON/24 h, QuickNode /12 h (needs mainnet ETH dust), Chainstack 0.5/24 h → claim into the deployer, redistribute with `cast send`. Thin-wallet variant: `--with-gas-price 105gwei --priority-gas-price 2gwei -g 115` deploys on ≈ 1 MON.
- Verification: MonadVision Sourcify `https://sourcify-api-monad.blockvision.org/` serves chains 143 + 10143 on both v1 (`/verify`, `/check-by-addresses`) and v2 (`POST /v2/verify/{chain}/{addr}`, `GET /v2/contract/…`) — forge 1.8.1 uses v2 and concatenates `v2/verify/…` onto the URL, so the **trailing slash is required** (fixed in README + script comments). With `cbor_metadata = false` expect a runtime match, not an exact match. Monadscan (`https://api-testnet.monadscan.com/api`, key + constructor args) kept as fallback; clones need no verification.
- Doc covers the 12 requested items (wallets, deployer/relayer/gate requirements, funding, env/RPC, verification, exact deploy + seed commands with expected output, output files, commit list, failure table). Also added: `--slow` on both scripts, `--retries 10 --delay 10`, `START_IN=3888000` (45 d; the 2 h default closes club sales at `startsAt`), `cast compute-address` for addresses ahead of time, `--resume` semantics, `deployments/10143.json` is written during simulation (delete on a failed broadcast), rehearsal recipe on the fork.
- Files: `docs/deploy-monad-testnet.md` (new), `packages/contracts/README.md` (deploy section + empty Deployments table), `script/Deploy.s.sol` + `script/CreateDemoEvent.s.sol` (comments only), `.env.example` (contracts-deploy block, `RELAYER_ADDRESS`), root `README.md` status. No contract or test changes; snapshot unaffected.
- Next: user creates wallets + claims faucets, deploys per the doc, commits `deployments/10143.json` + broadcast JSONs; then `apps/web` against the real addresses (or anvil fork meanwhile).

### 13 Sep — repo live at github.com/vaibhav0xq/turnstile; Replit pushes directly
- Workflow change: no more zip round-trips. The sandbox tree is a git clone; commits are authored and committed as `Vaibhav <108121691+vaibhav0xq@users.noreply.github.com>` (GitHub links both to vaibhav0xq); pushes use a fine-grained token scoped to this repo (Contents + Workflows read/write, Actions read) held in Replit Secrets and handed to git through an askpass helper — never in URLs, `.git/config` or the tree.
- Gate before every commit: root `pnpm verify` = `pnpm install --frozen-lockfile && pnpm check && pnpm build && pnpm --filter @turnstile/contracts check` (≈ 40 s here). CI runs the same steps.
- `f157182` "Initial import: identity package, contracts, deployment runbook" (102 files, supersedes the local-only commit "Add identity and contracts foundation"); `d7b46ae` bumps checkout/setup-node to v7 and pnpm/action-setup to v6 after GitHub's Node 20 deprecation annotation. Both CI runs green (node + contracts jobs).
- Never committed: `.env*` except `.env.example`, keystores, `deployments/31337.json`, `broadcast/**/dry-run/`.

## 13 Sep 2026 — web + relayer on anvil

- `apps/web` is a single Vite SPA: city (point-cloud downtown, one beacon per event) → venue (club or theatre
  layout derived from the on-chain venue id) → seat → ticket (rotating code) → door. Seats are instanced per
  section; the seat card is a DOM element anchored to the projected seat each frame (`scene/anchor.ts`).
- Relayer + web clients poll receipts at 400 ms (Monad block time); viem's 4 s default made every relayed
  action look four times slower than the chain.
- `apps/relayer/scripts/smoke.mjs` reproduces the fan flow without a browser (same PRF-seeded dev identities
  as `?dev=<seed>`): buy 131–148k gas, bind ≈ 98k, check-in 79–96k, full flow ≈ 1.7 s on anvil; a second buy
  of a taken seat comes back as `SeatTaken` (409) from the relayer's simulation.
- Sandbox lessons: Vite's production build needs ~600 MB, so `build:lite` (esbuild + Tailwind CLI) is the
  low-memory path; headless Chromium (SwiftShader) renders the scenes correctly but an HTML layer with a
  backdrop filter inside the canvas container blacks out the WebGL layer in screenshots — one more reason the
  seat card lives in the overlay.
