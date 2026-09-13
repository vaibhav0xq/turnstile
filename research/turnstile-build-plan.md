# Turnstile — Build Plan

**Locked:** Turnstile — identity-bound tickets & access · **Track 3: Social, Attention & Culture** · Monad Metropolis 2026
**Prepared:** 12 Sep 2026 (IST) · **Submission target:** 12 Oct 2026 (hard close 14 Oct 09:29 IST) · **Source of scope:** `research/monad-metropolis-report.md` §14–19

---

## 0. Today, before any code (owner: you — these need your login)

**Status 12 Sep (night) — spike gate met:** Mera passkey spike v2.1 passed on real hardware: Android Chrome 153 + Google Password Manager phone flow, phone stateless recovery (discoverable sign-in → same account/credential id, presence → same door key, vault → same credential), and Windows laptop verification through the phone-QR (hybrid) sheet (user-reported). Design change adopted from the run-1 failure: namespace ceremonies are **discoverable** and the app enforces same-passkey by comparing credential ids after the ceremony; `allowCredentials` is not used. Evidence: `docs/device-matrix.md`, `docs/device-reports/`. Repo setup (`docs/mera-spike-report.md` §5) is unblocked. Open: prompt counts at create, laptop JSON, iPhone rows.

**Status 12 Sep (evening):** registered; profile complete; team + project "Turnstile" created on Track 3; bounties selected; dashboard 4/5. **Submission opens 22 Sep 09:29 IST** — final fields hidden until then. No rules / eligibility / KYC / country / team-size page exists anywhere in the portal yet; re-check on 22 Sep. Known standard submission requirements (from the Community Team card): **public repo, demo video, deployed on Monad** (the Mera card accepts testnet *or* mainnet). Bounty cards filed as `official-07-bounty-*.md`; prizes/judges as `official-10-prizes-judges.md`; dashboard notes as `official-09-dashboard-status.md`. The table below is kept for the record.

I can't sign in to `hackathon.monad.xyz` on your behalf (GitHub/Google/Discord OAuth), so these five items are yours. Do them in this order and save what you find into `research/sources/` (paste text or drop screenshots into `attached_assets/` and I'll file them).

| # | Do | Capture | Decision it unlocks |
|---|---|---|---|
| 1 | **Register** at `hackathon.monad.xyz` with GitHub (`vaibhav0xq`). Choose **Track 3**. | confirmation screen | nothing else opens until this is done |
| 2 | Open the **Rules** page. Save the full text → `research/sources/official-05-rules.md`. | mainnet vs testnet requirement; "new work only" wording; IP/open-source terms; demo **video** required? length? | whether we deploy demo on mainnet (plan assumes **yes**) and whether a video is mandatory (plan assumes **yes**, 2–3 min) |
| 3 | Find **eligibility**: team-size cap, KYC/tax forms for payouts, country/sanctions restrictions, age. Save → `official-06-eligibility.md`. | exact numbers | team composition; who receives prize money |
| 4 | Open each **bounty card** we target (Mera-Powered UX, One Passkey Many Keys, Envio, Alchemy, Aurora Intents, Privy, Community Team). Save each requirement text → `official-07-bounty-<name>.md`. | required deliverables, separate submission forms, judging contacts | final bounty list in §10 |
| 5 | Open **My Project / Profile**. Note every **required field** (project name, tagline, track, repo URL, demo URL, video URL, team members, contract addresses, logo/cover). Save → `official-08-submission-fields.md`. | field list + character limits | which fields we can fill today (name/tagline/track/team) vs at the end |

Also today (no login needed): join the Monad Discord hackathon channels and post a one-line intro; buy the domain once the name is final (Turnstile is the working name — check `turnstile.*` availability; alternates: Doorlist, Admit, Marquee); set up Alchemy + Envio accounts; buy ~5 MON for deployments and sponsorship.

**Scope changes to expect from the gated rules:** if testnet-only is *required*, everything below still holds — only chain id changes. If a video is optional, we still make one. If the team cap is 4 and you have more people, split roles now. If KYC is heavy, nominate one payee.

---

## 1. Product one-liner

**Turnstile — tickets and access that follow a person, not an email address.** Buy a seat in a real 3D venue with Face ID, hold the ticket in your passkey, walk through the door in under a second, resell only the way the venue allows, and everyone involved gets paid the moment a sale happens.

## 2. Target user and problem

**Primary (B2B): independent venues, promoters, community organisers** — the people running 100–3,000-person shows and meetups. Their problems: scalping and fake tickets; 30–60 day settlement from ticketing platforms; no control over resale; no relationship with the fan after the show (the platform owns the email list).

**Secondary (B2C): fans** — no crypto knowledge, phone in hand. Their problems: fake resale, bot sellouts, tickets stuck in someone else's account, apps to install, wristbands to lose.

**Early adopters for the pilot:** the Monad community itself (dozens of IRL events per month, currently on Luma + wristbands) and one friendly show or meetup in India in the Oct 4–10 window.

**Why now / why Monad:** passkeys + Mera give a portable EVM account in ten seconds without a wallet; Monad's 300 ms blocks and ~600 ms finality make the gate check-in itself an onchain event (double-entry impossible by construction) and make instant splits and sub-second resale settlement normal; gas is cheap enough to sponsor every fan action. Offline proof of demand: DICE built a large business on phone-locked tickets and face-value waiting lists.

## 3. Core demo flow (what a judge does in ~2 minutes, on a phone)

1. Open `turnstile.*` → the **city** resolves from light points; each beacon is a real event. Tap one.
2. Camera **descends into the venue**. Seats are live: amber pulses are sales happening now. Rotate, pinch, tap a seat → spatial card shows section/row/price.
3. **Hold seat → Face ID** → a passkey account is created (first visit) → sponsored mint on Monad **mainnet** → the **ticket materialises** as a holographic card. A mono readout shows block number and time-to-finality (~0.6–0.9 s).
4. Tap **Gate** → a rotating QR appears. Judge scans it with our **virtual gate** (a second tab/device or the demo's built-in scanner view) → seat lights up in the venue behind, check-in written onchain, explorer link.
5. Tap **Passport** → attendance recorded → the next event's **presale ring** unlocks on the skyline.
6. Optional: **Resell** → list at ≤ face value → waitlist buyer (demo bot) takes it in one block → split to artist/venue/opener visible in the organiser view.

7. **Judge tests, on purpose:** a *Stateless test* button wipes local storage — one passkey prompt later, tickets, door key and private passport are back. Opening the same URL on a second phone reproduces the same door key (the gate accepts it) and decrypts the same passport — the *cross-device test* the Many-Keys card asks for.

Every step is real: mainnet transactions (testnet is an accepted fallback), real passkey, real indexer. A funded "demo identity" path exists so judges never need tokens. A small mono readout counts **taps and seconds from landing to confirmed transaction** — the Mera UX card's first criterion — so the number is on screen, not claimed.

## 4. MVP feature list (ship by 11 Oct)

**Fan**
- Passkey onboarding (Mera) in < 10 s; returning sign-in with stored credential id.
- 3D venue seat picker (§7) with 2 venue templates in MVP (club ≈300 seats, theatre ≈1,200) and live sale/check-in state; arena (≈12k) is the first stretch item, festival field is cut for a solo build.
- Checkout: seat hold (2 min), pay with USDC/AUSD from the derived account **or** free/RSVP ticket; gas fully sponsored; sub-second confirmation.
- Ticket view: 3D holographic ticket; rotating QR for entry; "transfer" opens the venue's resale flow only.
- Resale: list at ≤ cap; anyone buys; automatic split in the same transaction. (Onchain waitlist is stretch; MVP ships an off-chain "notify me" list per section.)
- Passport: attendance history; presale eligibility badge.

**Organiser**
- Create event: name, date, venue template, sections/prices, phases (passport presale → public), resale cap %, payout split (N payees, bps).
- Live venue view: sales and check-ins in 3D, in real time.
- Gate scanner (PWA, camera): scan → verify → onchain check-in → green/red with reason.
- Payouts: per-sale splits, running totals, explorer links. (Sell-through/resale analytics are stretch.)

**Platform**
- Landing world + demo mode (§7).
- Envio-indexed GraphQL API feeding all lists and live feeds.
- Relayer (gas sponsorship) with rate limits.
- Mainnet deployment, verified contracts, uptime monitoring.

**Explicitly not in MVP:** fiat on-ramp, refunds policy engine, seat-map editor (templates only), multi-currency, memberships, native mobile app, onchain waitlist, organiser analytics, arena/festival templates.

## 5. Smart contract requirements (Solidity 0.8.28 · `prague` · Foundry ≥ 1.8 · OpenZeppelin 5)

| Contract | Responsibilities | Key functions / events |
|---|---|---|
| `TurnstileFactory` | deploys `TurnstileEvent` clones (EIP-1167) + per-event `ResaleMarket`; registry of events | `createEvent(EventConfig)` → `EventCreated(eventId, event, market, organiser)` |
| `TurnstileEvent` (ERC-721 + `ERC2771Context` + `AccessControl`) | seats → tokenIds; sections with prices; phases; purchase; identity binding; check-in | `buy(seatId, payToken, permitSig)`, `rsvp(seatId)`, (holds are off-chain, see §11), `bindDoorKey(tokenId, doorKey)` (owner-only, via forwarder; re-bind = rotation), `checkIn(tokenId, slot, sig)` (gate role; `ecrecover` over EIP-712 `Entry(eventId, tokenId, slot)` must equal the bound door key; slot = 30-second window, current or previous accepted; once per token), `CheckedIn(tokenId, identity, block)`; `_update` override blocks transfers unless `msg.sender == market` or organiser refund |
| `ResaleMarket` | listings capped at `face × capBps`; FIFO waitlist per section; settles via `Splitter` | `list(tokenId, price)`, `joinWaitlist(sectionId)` (deposits), `buy(listingId)`, `cancel`, `Listed/Sold/WaitlistFilled` |
| `Splitter` | push splits per sale to payees (artist/venue/opener/Turnstile fee); pull fallback if a push fails | `split(token, amount)`, `Paid(payee, amount)` |
| `Passport` (ERC-721, ERC-5192 locked) | one per identity; attendance records; presale eligibility | `attend(identity, eventId)` (only events), `locked()`, `eligible(identity, eventId)` |
| `Forwarder` (OZ `ERC2771Forwarder`) | meta-transactions signed by fans, paid by relayer | standard |

**Rules encoded onchain**
- A ticket is bound to an identity (the Mera key-0 address). It can leave that identity only through the event's `ResaleMarket` (price ≤ cap, waitlist first if enabled) or an organiser refund.
- Check-in requires a signature from the ticket's bound **door key** over `(eventId, tokenId, slot)`; the 30-second slot makes the QR rotate; `checkIn` can be called only by a gate role and only once per token. The door key is *not* an account: it is derived from a separate PRF namespace of the same passkey (§8), never holds funds and never sends a transaction — the gate submits the check-in.
- Every sale (primary or secondary) routes through `Splitter` in the same transaction — payees are paid at the moment of sale.
- Payment: USDC via EIP-2612 `permit` (and/or EIP-3009 `transferWithAuthorization`, which Circle's FiatToken supports) so a fan never sends an approval transaction; AUSD path verified in week 1 (fallback: approve via forwarder).

**Monad specifics**
- Explicit gas limits per method (Monad charges the *limit*): snapshot with `forge snapshot`, add 10 %, hardcode in relayer.
- No EIP-7702 for fan accounts (delegated EOAs must keep a 10 MON reserve).
- Emit rich events (seat, section, identity, price, payees) — the indexer and the 3D scene are driven by events, not by reads.
- Tests: unit + invariant (`resale price ≤ cap`, `token never leaves identity except via market/refund`, `check-in at most once`, `sum(splits) == amount`), fuzzed. Deploy scripts for 10143 and 143; verify on MonadVision (Sourcify) and Monadscan.

## 6. Frontend app requirements

**Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind 4, shadcn/ui (operational surfaces), viem + wagmi (custom `monad` chain from `viem/chains`), Zustand (scene/app state), TanStack Query + graphql-request/urql (Envio), `lenis` + GSAP ScrollTrigger (landing timeline), R3F stack (§7).

**Two modes, one world**
- *Cinematic mode* (landing, event page, ticket, gate, passport): the persistent R3F canvas is the primary surface; DOM is sparse editorial type and spatially anchored cards.
- *Operational mode* (checkout drawer, organiser dashboard, scanner, settings): shadcn UI over a dimmed/blurred world; the 24 UX rules from the report apply strictly (44 px targets, focus states, inline validation, skeletons, optimistic UI with undo).

**Routes**
- `/` landing world (5 chapters) → `/e/[slug]` event/venue (same canvas, different chapter) → `/e/[slug]/checkout` (drawer) → `/me` passport & tickets → `/t/[tokenId]` ticket + QR → `/gate/[eventId]` scanner (PWA) → `/org` dashboard → `/org/new` create event.

**States that must be designed, not improvised:** first-visit vs returning; PRF unavailable (show the "use your phone / Google Password Manager" guidance Mera documents); seat taken while you were deciding; payment failed; relayer busy; offline gate (queue scans, sync later); reduced motion; no WebGL (2D seat map fallback).

**Performance & quality bar:** LCP < 2.5 s on 4G for the landing (progressive: type + fog first, city streams in); 60 fps on an M1 laptop, ≥ 30 fps on a mid-range Android; Lighthouse a11y ≥ 95 on operational routes; every 3D interaction mirrored by a keyboard-accessible list.

## 7. 3D landing / demo requirements (the part we do not water down)

**Architecture — one world, one camera.** A single `<Canvas>` mounted in the root layout persists across routes; per-route scene content is injected with `tunnel-rat`. A `SceneDirector` store holds `chapter`, `venueId`, `cameraTarget`, `hoverSeat`, `selectedSeat`, `ticketState`, `liveEvents[]`. Nothing remounts between landing and app — the landing *becomes* the product.

**Camera rig.** Named waypoints (position, lookAt, fov, fog density, exposure) per chapter: `city → descent → venue → seat → ticket → gate → passport`. On the landing, a GSAP timeline scrubbed by Lenis scroll drives the camera; inside the app, moves are event-driven (1.2–1.8 s, `cubic-bezier(.22,.61,.36,1)`). Subtle handheld drift (noise on position) when idle; pointer parallax ±2°. Reduced-motion → cut between still compositions with 300 ms crossfades.

**Chapter list (landing → demo)**
1. **City.** ~40k instanced light points resolve from noise into a skyline (Cortexa pattern). Real events from Envio are beacons with a soft bloom halo; hovering one raises its district. Display type 10 vw: *Access that follows you.* One action: *Enter a venue.*
2. **Descent.** Dolly through the skyline into the chosen venue; fog thins; house lights come up in sequence (spotlights fading in row by row — this is the "wow" beat).
3. **Venue = seat picker.** See below. Copy: *Pick a seat. No wallet. No app.*
4. **Ticket.** Face ID → mint → the ticket materialises: a physical card with thin-film iridescence and holographic foil, pointer/gyro relighting (FeralUI Hologram idea, done in Three), mono readout of block + finality time. Copy: *Yours in 600 ms.*
5. **Gate & passport.** Camera swings to the door; rotating QR on a phone model; scanner beam; the seat lights up in the venue behind; the ticket folds into the passport and a presale ring appears on the skyline. Copy: *Your history opens doors.* Actions: *Try it now* · *Run your event.*

**The venue as a product surface (acceptance criteria)**
- Seats are `InstancedMesh` (up to ~20k instances/venue) with per-instance attributes for `status` (available/held/sold/mine/checked-in), `section`, `hover`; status changes are attribute writes, not re-renders. Raycasting through `three-mesh-bvh` for < 16 ms hover on mobile.
- Hover: seat rises 2 cm and warms (emissive); its row lights a thin guide line to the stage; a **spatial card** (drei `Html transform`, occluded properly) shows section · row · seat · price · "view from here".
- **"View from here":** clicking the eye icon moves the camera to that seat's eye height looking at the stage (real seat-view preview — a genuine product feature).
- Sections are selectable as 3D signage (troika SDF `Text`), with a DOM section list mirroring them for keyboard users.
- Live layer: Envio subscription → sale particles travel from the skyline beacon to the seat and set it sold; check-ins pulse seats green; a small counter shows *sold in the last minute*.
- Stage: emissive screen playing the event's artwork/video; 3 real spotlights with cookies + baked ambient; volumetric feel via fog + dust `Sparkles` + additive light-cone planes (no true volumetrics on mobile).
- Camera controls: orbit constrained to the audience hemisphere, pinch zoom, double-tap-to-focus a section; damping on all inputs.
- Templates: club (300), theatre (1,200), arena (12,000), festival field (GA zones + 200 VIP seats) generated procedurally from a JSON schema (`sections[] → rows[] → seats[]` with arc/grid layouts).

**Materials & post.** Near-black matte structure; seats `MeshStandardMaterial` with instanced color/emissive; ticket `MeshPhysicalMaterial` (iridescence, clearcoat) + custom foil shader; one `EffectComposer`: selective Bloom, Vignette, film grain (scene layer only), SMAA; ChromaticAberration only during chapter transitions; DepthOfField desktop-only for the ticket chapter.

**Performance budget.** ≤ 150 draw calls, ≤ 1.5 M triangles, textures ≤ 2k, `AdaptiveDpr` + `PerformanceMonitor` degrade path (drop DoF → drop grain → halve particles), `frameloop="demand"` when idle in operational mode, dispose on chapter change, GLTF assets Draco/Meshopt-compressed and preloaded per chapter.

**References to steal (not copy):** ThreeUI Sylva/Cortexa (persistent world, point-cloud resolve), Orrery (module selection retargets camera/light), Holographic Glitter Card / Advanced Glass (ticket material), Pryzm (light/haze/grain as scene layers), FeralUI Hologram/Fur (state-aware material, animate-while-settling), Jiro's full-viewport "enter demo" (done natively).

## 8. Auth / wallet / passkey plan (revised 12 Sep against the two Mera bounty cards)

**Mera is the entire account layer — for fans *and* organisers.** No seed phrase, no extension, no custody backend, no Privy/injected-wallet fallback (the UX card is explicit, and a solo build does not need two auth systems). Gate devices never hold keys: the scanner PWA authenticates to our relayer with an organiser-issued gate token; the relayer's gate signer submits `checkIn`.

**One passkey, three namespaces** (the Many-Keys card wants at least one PRF namespace doing *non-account* work, live, cross-device; it explicitly excludes "signing blockchain transactions from a wallet account" as the point):

| Namespace | PRF salt | Derivation | Does | Prompt |
|---|---|---|---|---|
| **Account** | Mera default (`sha256("mera.prf.salt.v1")`) | Mera's BIP-32 path `m/44'/60'/0'/0/0` → secp256k1 → viem account | owns tickets and passport, pays (USDC permit), signs forwarder requests | sign-in / purchase |
| **Presence** | `sha256("turnstile/presence/v1")` | HKDF-SHA256(prf, info = `chainId ‖ eventAddress`) → per-event **door key** (secp256k1, never funded, never an account) | signs rotating entry codes; its address is bound to the ticket via `bindDoorKey`; verified by `ecrecover` in `checkIn` | at the door — deliberately a fresh biometric, because presence is the claim |
| **Vault** | `sha256("turnstile/vault/v1")` | HKDF-SHA256(prf, info = `"passport"`) → AES-256-GCM key | encrypts the fan's private passport (stubs, plus-one names, notes, receipts) and the organiser's private notes; blobs stored on our server as opaque ciphertext keyed by identity address | opening the passport |

Rules: salts are 32-byte constants, versioned; per-event keys come from HKDF `info`, so one ceremony per namespace covers all events; nothing derived is persisted — `credentialId` in localStorage is a convenience only; the door key can be rotated by re-binding with a bumped `info` version; encryption (vault) and derivation (presence) are kept separate, as the card's "correct use of primitives" criterion asks. Mera's own `createSecretVault*` (fresh random salt stored in the vault) is the fallback for the vault namespace if a reviewer prefers the library's format.

**Prompt budget (the UX card's "session design")**
- First visit: `createPasskeyWithPrfOutput` → account PRF in the same ceremony → `createSecp256k1SigningSession` → hold, permit, buy, `bindDoorKey` all inside that one session. **One prompt from landing to confirmed ticket.**
- Session policy: 15-minute account session; prompt-free = holds, purchases, listing for resale, door-key binding; re-prompt = anything after expiry, organiser payout changes, passport export. Session chip shows remaining time; `SESSION_ENDED` renders "tap to continue", never a dead button.
- Door: one presence-namespace prompt per venue visit; codes rotate in memory for the next hour; `end()` on leaving the gate screen.
- Passport: one vault-namespace prompt when opened.

**Stateless test (UX card) and cross-device test (Many-Keys card):** on a fresh device or after clearing storage, a discoverable-credential ceremony (no `credentialId` needed) yields the account → tickets and passport records come back from Envio; the vault ceremony decrypts the private passport from our untrusted store; the presence ceremony regenerates the exact same door key, so the gate accepts the QR from the second device. Build a **"Judge mode"** panel that runs both tests on stage.

**Time-to-first-transaction:** landing → tap event → tap seat → tap *Get ticket* → Face ID → confirmed. Target ≤ 4 taps and ≤ 12 s including passkey creation; the readout in §3 proves it.

**Composability bonus:** gas sponsorship via ERC-2771 forwarder + relayer (fans never hold MON); Aurora Intents "pay from any chain" if the stretch lands; portability demo (export mnemonic → same address in MetaMask/Rabby) for the video.

**Device matrix (official Mera support table, `bounty-06-mera-authenticator-support.md`):** test iOS 18 Safari (iCloud Keychain), Android Chrome (Google Password Manager), desktop Chrome signed into Google Password Manager, 1Password. Designed failure state for desktop-Chrome local-profile / Bitwarden / Dashlane (`PRF_UNAVAILABLE`): "use your phone, or sign in to Google Password Manager".

**Risk containment:** Mera is pre-1.0 → wrap it in `packages/identity` (`createIdentity`, `signIn`, `withAccountSession`, `deriveDoorKey(event)`, `openVault`) so a swap is a one-file change.

## 9. Monad integration plan

- **Chains:** dev on testnet 10143 (`faucet.monad.xyz`), demo on mainnet 143. `monad`/`monadTestnet` from `viem/chains`; custom wagmi config with both.
- **RPC:** Alchemy as primary (verify chain 143 in the dashboard on day 1; their pages disagree) + `rpc.monad.xyz` fallback; WSS subscriptions for live logs (Monad also offers pre-finality `monadLogs`-style subscriptions — use them for instant UI, and `finalized` for truth; verify names in docs).
- **Finality UX:** show *proposed* instantly, turn green at `finalized` (~600–900 ms); the gate never turns green before finality.
- **Gas:** explicit limits everywhere; relayer hot wallet topped up with alerts; per-identity and per-IP rate limits; replay protection via forwarder nonces.
- **Logs:** never rely on wide `eth_getLogs` ranges from public RPC — Envio is the read path.
- **Explorers:** MonadVision (Sourcify verify) + Monadscan links on every receipt and in the organiser payout table.
- **Tokens:** native USDC (Circle) and AUSD (Agora) addresses on 143 recorded in `packages/contracts/addresses.ts`; permit/EIP-3009 support confirmed per token in week 1.
- **P256:** not needed for MVP (Mera-derived secp256k1 keys sign); stretch uses the `0x0100` precompile to verify raw WebAuthn assertions at the gate.

## 10. Sponsor bounty integration plan — final targets (confirmed against the cards, 12 Sep)

| Bounty | Cash | Card requirement → what Turnstile shows | Decision |
|---|---|---|---|
| **Best Mera-Powered UX on Monad** | $2,500 | Mera as the entire account layer; one-prompt onboarding; prompt-free signing via scoped sessions; **stateless test**; testnet or mainnet with real transactions + live demo; bonus for gas sponsorship/intents | **Core.** §8 is built around its four criteria; TTFT readout on screen; relayer = composability bonus. |
| **Mera: One Passkey, Many Keys** | $2,500 | ≥1 PRF namespace doing **non-account** work, live; salts genuinely namespaced; nothing sensitive persisted; **cross-device test** | **Core, redesigned.** Presence namespace → per-event door keys (access credentials, not accounts); vault namespace → encrypted private passport. The wallet exists but is not the point. |
| **Best Use of Envio** | $1,000 | HyperIndex driving a core feature; depth (multichain, non-trivial schema, derived/aggregated entities); deployed to Envio Cloud or self-hosted; public repo with `config.yaml`, `schema.graphql`, handlers; frontend consuming it; short demo | **Core.** Live 3D layer + all lists come from the indexer; `EventStats/SectionStats/IdentityStats` aggregates; one config indexing 10143 + 143; Envio Cloud deploy. |
| **Best Projects using Alchemy** | $1,000 credits | Deployed on Monad; meaningfully integrates ≥1 Alchemy service/tool that supports Monad | **Keep, low effort.** Alchemy RPC (primary) + Notify webhooks feeding organiser alerts/relayer monitoring; verify Monad support in Alchemy's Monad FAQ during Week 1. |
| **Best Community Team Project** | $5,000 | Team must set its campus/community group in the profile; community must be on the onboarded list; standard submission requirements | **Conditional.** Keep selected only if a group you genuinely belong to appears in the profile's community dropdown; otherwise remove. No build cost either way. |
| **Privy!** | $5,000 | Privy beyond authentication; login-only does not qualify | **Drop and remove from the project.** Conflicts with "Mera is the entire account layer" and would cost a solo builder a week for a second auth stack. |
| Any-Chain Liquidity (Aurora/NEAR Intents) | $5,000 | not selected yet | **Stretch.** Add the selection only if "pay from any chain" ships (selections stay editable until the deadline; two Aurora judges on the panel). |

Track 3 stays the primary prize; its official description — "cultural participation that can translate into ownership" — is the write-up's first sentence. Confirmed deadline on every card: **Oct 14, 2026 09:29 IST**.

## 11. Data / indexing plan

- **Onchain (source of truth):** ownership, identity binding, phases, prices, sales, listings, waitlists, check-ins, splits, passport records.
- **Envio HyperIndex** (`packages/indexer`, one config indexing 10143 + 143): entities `Event`, `Section`, `Seat`, `Ticket`, `DoorKeyBinding`, `Listing`, `Sale`, `Split`, `CheckIn`, `Passport`, `Identity` plus **derived aggregates** `EventStats` (sold, checked-in, gross primary/secondary, last-minute sales), `SectionStats`, `IdentityStats` (events attended, first seen) — cheap counters in handlers that feed the live 3D layer and the organiser live view (the Envio card scores "derived/aggregated entities" and "multichain"); deployed to Envio Cloud; GraphQL queries + subscriptions.
- **App database (Postgres, Replit):** event content (copy, artwork, video), venue template geometry and seat coordinates, **seat holds** (2-minute soft locks; off-chain by design, expire automatically), organiser profiles, gate device registrations, relayer job log, demo identities.
- **Relayer service (`apps/relayer`, Node/Hono):** POST signed forwarder requests → validate → simulate → submit with fixed gas → return hash; websocket to the client for status; rate limits; Alchemy webhook/log listener for alerts.
- **Consistency:** the 3D scene subscribes to Envio for confirmed state and to the relayer for the user's own pending actions; holds come from Postgres; no client ever infers state from RPC polling.
- **Privacy:** identities are addresses; no emails required for fans; organisers see aggregates plus check-in status, not personal data.

## 12. Week-by-week execution plan — solo builder, AI-assisted (IST)

**Reality check.** One person, ~26 working days, 8–10 focused hours each ≈ 210–260 hours. The budget below adds up to ~220 hours, so the schedule holds only if scope stays frozen and the riskiest unknowns are killed in the first five days. Everything in this section already reflects the solo cuts made in §4.

**Hour budget**

| Workstream | Hours | Notes |
|---|---|---|
| Contracts + tests + deploys | 30 | Event, Factory, Splitter, Forwarder, Passport, ResaleMarket (cap only) |
| Identity (Mera) + relayer + payment path | 25 | biggest unknown; do first |
| Venue generator + 3D seat picker + camera rig + spatial UI | 40 | the product surface |
| Checkout, ticket object, QR, gate scanner | 25 | |
| Envio indexer + live layer | 15 | |
| Organiser flows (create event, live view, payouts) | 15 | |
| Landing chapters (city, descent, timeline, copy, reduced motion) | 30 | reuses the app's scenes |
| Polish, perf, a11y, designed states | 20 | |
| Pilot event, video, write-up, submission | 20 | |

**Operating rules for a solo build**
1. **Vertical slice first, then widen.** By the end of Week 1 a passkey user buys a seat in an ugly 3D venue on testnet through the relayer. Only then does anything get beautiful.
2. **Unknowns die in the first five days:** Mera PRF on your actual phone + laptop, the USDC/AUSD permit (EIP-2612/3009) path through the forwarder, relayer gas limits on Monad, instanced picking at 30 fps on your phone, Envio hosted deploy on 143.
3. **Mainnet by Oct 3.** The Mera card accepts testnet, so this is a target rather than a rule — but the pitch is stronger on 143 and the fallback exists.
4. **One quality day per week** (lighting, materials, motion, perf). Polish does not bleed into every day.
5. **Daily two-minute judge-path test on a fresh phone profile** once the loop exists (from Sep 28).
6. **Feature freeze Oct 8.** After that: bugs, perf, video, copy.
7. **AI assistance, without losing the bar:** let Codex/Replit generate boilerplate, Envio handlers, tests, venue generators and form UIs; you personally own architecture, every shader and camera move, and every security-relevant line (transfer restrictions, check-in signature verification, splitter math, forwarder wiring). Generated Solidity ships only after forge invariants pass.

**Week 0 · Sat 13 – Sun 14 Sep — lock + kill the first unknown**
- Sat: §0 login checklist (done); Discord intro; domain; Alchemy/Envio accounts; claim Tenderly + QuickNode vouchers; ~5 MON. **Mera spike on your phone and laptop first** (`/dev/passkey`: create passkey → account address → presence-namespace PRF → per-event door key → vault-namespace PRF → encrypt/decrypt a blob → repeat on a second device and confirm identical door key and successful decrypt). Record the device matrix.
- Sun: monorepo scaffold under `vaibhav0xq`, CI, Foundry init, design tokens, venue schema v0.
- *Exit:* rules read; passkey produces three addresses on your phone; first commits pushed by you.

**Week 1 · Mon 15 – Sun 21 Sep — the vertical slice**
- Mon–Tue: `TurnstileEvent` + `Factory` + `Splitter` + forwarder wiring; buy/rsvp/checkIn happy paths; tests; testnet deploy.
- Wed: relayer v0 (simulate → submit with fixed gas → status); permit path proven against USDC on testnet (or a permit-capable mock if testnet USDC is unavailable); AUSD permit support checked.
- Thu–Fri: venue schema + generator (club, theatre); persistent canvas; `SceneDirector`; camera rig with two waypoints; instanced seats with BVH hover; spatial seat card; 2D fallback list.
- Sat: checkout drawer: hold → Face ID → permit + buy through relayer → seat becomes *mine*.
- Sun: buffer / `envio init` against the deployed ABI.
- *Exit:* end-to-end purchase from the 3D venue on testnet, one biometric prompt.

**Week 2 · Mon 22 – Sun 28 Sep — the full loop** *(Mon 22, 09:29 IST: submission form opens — read the Rules/eligibility text the same hour, fill every field you can, file it as `official-05/06/08`.)*
- Mon–Tue: ticket object (iridescent/foil material, pointer relight) + rotating QR signed by the per-event door key; gate scanner PWA (camera → signature check → relayed `checkIn`); seat pulses in the live view.
- Wed: `Passport` + presale gating; transfer restrictions; organiser refund; `bindDoorKey` rotation; encrypted private passport (vault namespace) + Judge-mode stateless/cross-device panel.
- Thu: `ResaleMarket` (cap, instant split on secondary); invariant tests; `forge snapshot` → relayer gas table.
- Fri: Envio indexer with all entities, hosted deploy, live layer (sale particles, check-in pulses), off-chain "notify me" list.
- Sat: organiser: create-event form, live venue view, payouts table.
- Sun (quality day): house-lights descent sequence, seat materials, motion tokens, phone perf pass.
- *Exit:* buy → scan → check-in → passport across two devices on testnet.

**Week 3 · Mon 29 Sep – Sun 5 Oct — cinematic + mainnet**
- Mon–Tue: city chapter (instanced points seeded from Envio events), descent, Lenis/GSAP scroll timeline, editorial copy, reduced-motion path.
- Wed: ticket and gate/passport chapters wired into the same world; "view from here"; demo-mode collapse of landing chrome.
- Thu: **mainnet deploy + MonadVision/Monadscan verification**; real USDC/AUSD addresses; demo-identity faucet; uptime + relayer balance alerts.
- Fri: designed states (PRF unavailable, seat taken, relayer busy, offline gate), a11y pass, keyboard mirror of the seat picker.
- Sat: arena template if on track; otherwise polish.
- Sun: create the real pilot event on mainnet; send invites.
- *Exit:* the two-minute judge path works on mainnet from a fresh phone.

**Week 4 · Mon 6 – Sat 11 Oct — proof, video, submission**
- Pilot event on its booked date (Oct 4–10): one door, your phone as the scanner, 20–40 real attendees, photos, organiser quote, check-in curve from Envio.
- Wed (Oct 8): feature freeze. Stretch (Aurora Intents "pay from any chain") happens only if the loop has been green on mainnet since Oct 3. (Privy is out — see §10.)
- Thu: video shoot + edit (2–3 min: door → product path → payout screen → explorer).
- Fri: write-up, README with architecture diagram, bounty forms, dashboard screenshots.
- Sat (Oct 11): submission draft complete on the platform; full fresh-device test; backups of video and links.

**Oct 12 — submit. Oct 13 — buffer only.**

**Cut list if behind (in order):** arena template → "view from here" → DoF/grain → organiser payouts table becomes a list → chapter 5 becomes a still → off-chain notify list. **Never cut:** passkey onboarding, 3D seat picker with live layer, mainnet mint, gate check-in, passport badge, video.

## 13. Exact first coding tasks (day 1–3, in order)

1. **Mera spike first** (before scaffolding anything): a throwaway Next.js page served over HTTPS that (a) creates the passkey and shows the account address, (b) evaluates the presence namespace and derives a door key for a sample event, signs an `Entry` typed-data message and verifies it, (c) evaluates the vault namespace, encrypts and decrypts a blob, (d) on a second device / fresh profile, signs in with the discoverable credential and proves the same account, the same door key and a successful decrypt. Run it on your phone and laptop; write `docs/device-matrix.md`. This is the one unknown that could change the whole plan.
2. **Scaffold** `turnstile/` as a pnpm monorepo: `apps/web` (Next.js 15 + TS + Tailwind 4 + shadcn), `apps/relayer` (Hono), `packages/contracts` (Foundry), `packages/indexer` (Envio), `packages/identity` (Mera wrapper), `packages/venue` (schema + generators), `packages/ui` (tokens). Add `README`, MIT licence, `.editorconfig`, CI (forge test + typecheck + lint). First commit authored by `vaibhav0xq`.
3. **Contracts skeleton:** `forge init`, OZ 5 as dependency, `TurnstileEvent` with seats/sections/phases and `buy`/`rsvp`/`checkIn` stubs, `Factory` with clones, `Forwarder`; first tests; `foundry.toml` with `solc 0.8.28`, `evm_version = "prague"`, rpc endpoints for 10143/143; deploy script; testnet deploy of the skeleton.
4. **Identity package:** move the spike into `packages/identity` behind `createIdentity / signIn / withAccountSession / deriveDoorKey(event) / openVault` with designed `isMeraError` states.
5. **Relayer v0:** `POST /relay` accepts a forwarder request, simulates, submits with a fixed gas limit on 10143, returns hash; `GET /status/:hash`; hot-wallet env via Replit secrets.
6. **Venue schema + generator:** `packages/venue/schema.ts` (`Venue → Section → Row → Seat` with arc/grid layouts, stage transform, camera anchors) and `generate(template)` for club/theatre (arena later); unit tests on seat counts and overlaps.
7. **Persistent canvas:** root-layout `<Canvas>` + `tunnel-rat` + `SceneDirector` store + `CameraRig` with two waypoints (city stub → venue); `Seats` component: instanced seats from the generator with per-instance status colors, BVH raycast hover, spatial `Html` card; `AdaptiveDpr` + `PerformanceMonitor`; reduced-motion flag.
8. **Envio init:** `pnpx envio init` in `packages/indexer` against the testnet skeleton ABI; `Event`/`Ticket` entities; local run; first GraphQL query rendered in the venue as "sold" seats.
9. **Design tokens:** type scale (display 8–14 vw / −0.04 em; UI 14–16 px; mono for ticket data), palette (near-black stage, off-white type, amber house-light accent, violet ambient — hexes confirmed against Monad's brand kit only for the nod, ours are ours), motion tokens (UI 160–240 ms; camera 1.2–1.8 s; springs 180/30), Tailwind theme + Zustand-driven scene uniforms.
10. **End of day 3 checkpoint:** a passkey user on testnet buys a seat from the 3D venue through the relayer and sees it turn "mine" via Envio. If that works, Week 1 is on track.

---

*Build surface:* we move this conversation into a Replit Project when you say go (the research files come along). All git operations run under your GitHub identity, never an agent identity.

---

## 14. Addendum — official Resources page (filed 12 Sep, `research/sources/official-resources.md`)

The logged-in Resources page contains **no rules, deadlines, eligibility, KYC, team-size, video or submission-field text**; those still come from the Rules / eligibility / bounty cards / project form. Nothing on the page forces a scope change. **Scope stays exactly as re-cut in §4 and §12.** Tooling adjustments adopted:

| Area | What the page adds | Adjustment |
|---|---|---|
| Sponsor perks (one voucher per team) | Tenderly Pro (≈$7.2k), QuickNode Build (3 months), Zerion API (1 month) | **Claim Tenderly + QuickNode today.** Tenderly = relayer transaction simulation, contract alerts, virtual testnets for rehearsing the mainnet deploy. QuickNode = second RPC provider. Zerion not needed. |
| RPC | Alchemy Monad quickstart/FAQ; QuickNode Monad quickstart, Streams, Webhooks | §9 becomes: Alchemy primary → QuickNode secondary → `rpc.monad.xyz` fallback; Tenderly alerts replace hand-rolled log watchers for relayer/hot-wallet monitoring. |
| Gas sponsorship | Alchemy Smart Wallets (bundler + gas sponsorship + ERC-20 gas, EIP-7702); Pimlico template; Circle Wallets sponsorship | **Keep ERC-2771 forwarder + own relayer.** Paymaster routes require smart accounts (4337/7702); 7702-delegated EOAs carry the reserve-balance constraint and would break the "fan never touches MON" story. State this trade-off in the write-up. |
| Passkeys / AA | `docs.monad.xyz/guides/mera` (mislabelled on the page as an "execution and runtime architecture guide" — it is the passkey guide, verified live); Privy PWA templates (`next-serwist-privy-embedded-wallet`, `-smart-wallet`); RIP-7212 note "assume NOT available and verify" | Fan flow unchanged (Mera). Organiser Privy path stays optional, but the Foundation template cuts its cost — promote to the first stretch after arena if Week 3 is green. Verify the P256 precompile on the Precompiles page before any onchain-WebAuthn stretch; MVP does not depend on it. |
| PWA | Foundation Next.js templates use Serwist | Use the same Serwist setup for the gate-scanner PWA (offline queue of scans). |
| Indexing | Envio HyperIndex quickstart, **Quickstart with AI**, Monad page (testnet `monad-testnet.hypersync.xyz`, config `chains: - id: monad-testnet`; Monad mainnet listed as supported), HyperRPC; kuru-terminal reference for real-time event indexing | No change to the Envio plan. Add HyperRPC as an optional read endpoint for backfills. |
| AI-assisted build | Envio ships 14 HyperIndex agent skills; Alchemy Agent Skills + MCP server; Zerion skills | **Install the Envio and Alchemy agent skills into Codex/Replit on day 1** — they are the fastest route to a correct indexer and RPC/webhook code for a solo builder. |
| Track 3 idea resources | Ticketing is not one of the listed ideas (thin competition confirmed). Closest: *Early-Supporter Registries* — "POAP proved proof but never built reward; the financial half is the unbuilt part" (EAS resolvers, CCA bid-validation hooks). *Payments in social gestures* — 0xSplits (audited, deployable as-is). | Narrative only: pitch Passport as **an early-supporter registry that pays** — attendance unlocks presale and price priority now; stretch idea for the write-up: a slice of resale fees flows back to earliest fans. Keep our ~60-line push `Splitter` (one transaction, no external dependency); mention 0xSplits as the audited alternative for production. |
| Verification & explorers | "Verify a smart contract" guide; App Hub directory | Already planned; list Turnstile on the Monad App Hub after mainnet deploy (visibility with judges). |
| Standards UX | "EIPs For Designers" | Use for the write-up's plain-language explanation of ERC-5192 (locked passport), ERC-2771 (sponsored actions), EIP-2612/3009 (approval-free payment). |

Still pending from your login: Rules text, eligibility (team cap/KYC/country), each bounty card's requirement text, and the required project fields.


---

## 15. Addendum — gated bounty cards, prizes and judges (filed 12 Sep evening)

**Forced changes (applied above):** the Many-Keys card excludes wallet signing as the point of the submission, so the old "key 0/1/2 = identity/spending/presence" design is gone; §8 now uses three PRF namespaces (account / presence → per-event door keys / vault → encrypted private passport) and §5 replaces `setPresenceKey` with `bindDoorKey` + `ecrecover` in `checkIn`. The UX card's stateless test and TTFT criterion are now explicit demo beats (§3) and design rules (§8). Privy is dropped; organisers use Mera too.

**Confirmed facts:** deadline Oct 14 09:29 IST on every card; submission opens 22 Sep 09:29 IST; standard requirements = public repo + demo video + deployed on Monad; Mera card accepts testnet or mainnet; sponsor bounties stack on one chosen main track; every track pays 10/10/10; bounty judges include Category Labs (Haythem Sellami) for Mera, Envio's founder, Alchemy DevRel and two Aurora Intents leads; Track 3's official description is "open social graphs, competitive feeds, governance, and cultural participation that can translate into ownership".

**Still unknown until 22 Sep:** rules text, team-size cap, KYC/tax, country restrictions, video length, IP terms, required project fields.
