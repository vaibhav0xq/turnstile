# Monad Metropolis — Investigation Report & Build Recommendation

**Prepared:** Saturday 12 September 2026 (IST) · **For:** vaibhav0xq's Metropolis team · **Status:** research complete, no code written (as instructed)

**How to read this.** Claims are tagged **[Verified]** (read from an official or primary page today), **[Inferred]** (my reading of evidence), or **[Unknown]** (not published; usually login-gated). Bracketed `[S#]` markers point to the source list in Section 21; every source has a local copy under `research/sources/`.

---

## 1. Executive summary

- **You are not late, and there is no 13 September registration cutoff.** Metropolis runs **1 Sep → 13 Oct 2026**, online and global; the platform's live countdown ends **14 Oct 2026 03:59 UTC = 14 Oct 09:29 IST** (i.e., 13 Oct 23:59 US-Eastern). Registration ("Intake") is open now via GitHub/Google/Discord, free, and unlocks the login-gated rules, exact bounty requirements and resources. **[Verified: S1, S2]** I found no source anywhere that sets a registration deadline of 13 September; the only odd dates (31 Aug / 12 Oct) come from an unofficial Rise In mirror and are timezone artefacts. **[Verified: S5]** That said: register today, because eligibility, team caps and KYC details only appear after login. **[Unknown]**
- **Prize structure:** 4 tracks × $30,000 (split $10k/$10k/$10k across three winners) + $25,000 Grand Champion + ~$76,500 cash bounties + ~$10,000 AI credits ≈ $231k listed; the headline says "$250k+". One primary track per project; bounties stack without limit. Top teams also get invited to the **DeltaV residency**. **[Verified: S1, S3, S4]**
- **The field is already visible on GitHub.** The three "example ideas" Monad printed under each track are being cloned right now (per-second subscriptions → **Elapse** is already live with an SDK; family/shared wallets → Settle; cross-border AUSD → Iris; ERC-8004 agent identity → at least four repos; mobile perps on Perpl → TradeAgent; delta-neutral vaults → DeltaMon). Track 4 (agents/x402) is the most crowded; Track 1 has the most sophisticated entries; Track 3 (Social, Attention & Culture) has the fewest serious public builds. **[Verified: S28, S29, S30]**
- **Recommendation (one idea):** build **"Turnstile" (working name) — tickets and access that follow a person, not an email address.** Passkey-native accounts (no wallet, no seed phrase, no app install), a cinematic 3D venue as the actual seat picker, tickets bound to the holder's passkey identity, venue-governed resale with capped prices enforced by the contract, instant revenue splits on every sale, sub-second gate verification, and a "fan passport" of attendance that carries presale rights to the next show. It sits squarely on a Monad-printed example idea that nobody visible is building, it gives the 3D experience a real product job (not decoration), it can be tried live by judges on their phones, and it stacks Mera (2 × $2.5k), Envio ($1k), Alchemy credits and, as stretch, Aurora Intents ($5k) or Privy/Dynamic ($5k). Primary track: **Social, Attention & Culture**; fallback positioning: Consumer Products & Payments.
- **Runner-up:** "Depth", a 3D real-time market-microstructure and risk terminal for Perpl/Kuru (best bounty stack ≈ $14k; weaker as a venture story). Details in Sections 13–15.
- **Design verdict:** of the five reference sites, **ThreeUI** is the only true 3D benchmark (465 routes of raw Three/R3F/GLSL worlds); Skiper UI is a strong shadcn-compatible motion library with a few 3D pieces; Pryzm and FeralUI teach shader-lit atmosphere and tactile, state-aware materials; Jiro is a conventional 2D catalogue. The two attached UX/UI docs are generic e-commerce guidance — keep ~24 rules as a quality floor, ignore the template-shaped layout advice. **[Verified: S33–S39]**
- **Urgent next 48 hours:** register, read the gated rules (mainnet vs testnet, team size, KYC, video requirement), join the Monad Discord hackathon channels, lock the idea, set up the repo under your own GitHub identity, and start the contracts + passkey onboarding spike.

---

## 2. Deadlines & urgency

| Milestone | Date/time | Status | Source |
|---|---|---|---|
| Hackathon opens | 1 Sep 2026 | past | [S1] |
| Registration/intake | open now; no published close date | open | [S2] |
| **Submissions close** | **13 Oct 2026 23:59 EDT = 14 Oct 03:59 UTC = 14 Oct 09:29 IST** | ~31 days left | [S2] platform countdown |
| Judging (per track) | 14–27 Oct 2026 | — | [S1] |
| Winners announced | 3 Nov 2026 | — | [S1] |
| IRL hacker houses (NYC, Seoul, others) | rolling, mid-Sep to Oct | approval-gated, optional | [S7] |

**Reading of urgency.** You believed submissions end 13 October — correct in US time; in India the door closes the morning of the 14th. Plan to submit **by 12 October** to keep a 36-hour buffer for platform hiccups. **[Inferred]** Six weeks were available; you have four and a half. That is enough for a focused MVP if scope is frozen this weekend (Section 16 has a week-by-week plan).

**The "13 September" worry.** No official page, the platform strings, the Luma pages, the X announcement snippets or press coverage mention a 13 September cutoff. **[Verified: S1, S2, S6, S7]** My best guess at the origin is either a Luma hacker-house application window or a confusion with a different hackathon. Treat it as noise — but register anyway today, because there is no upside to waiting.

---

## 3. Registration

- **Where:** `hackathon.monad.xyz` ("Intake"). Sign in with GitHub, Google or Discord. Free. **[Verified: S2]**
- **What it unlocks:** the full rules page, the per-bounty requirement text, the milestone calendar, resources and the submission form. These are **login-gated** and were not readable from outside. **[Verified: S2]**
- **Track choice:** applicants choose one track at intake; the public wording doesn't say whether it can be changed later. **[Verified: S1; Unknown re: changes]**
- **Team formation:** the official FAQ says teams and solo builders are welcome, crypto-native or not; no team-size cap is published. **[Verified: S1]** Team-size, KYC/identity checks for prize payment, and country restrictions are **[Unknown]** until login — check them first.
- **IRL houses:** Luma pages require host approval, add nothing to eligibility, and have no published deadline. Online participation is fully independent. **[Verified: S7]**

---

## 4. Submission requirements

**Published (public) requirements [Verified: S1, S2]:**
- A **working product** built during 1 Sep–13 Oct. Pre-existing projects are allowed only where the submitted work is new and demonstrably built inside the window; judges must be able to verify the six-week work.
- A **public project profile** on the platform containing: a demo (link), a short write-up, and a link to the code. Open source is encouraged, not mandatory.
- Product must be **on Monad**. The platform implies mainnet (chain 143) but I found **no explicit mainnet-vs-testnet rule**; precedent from Monad's previous events (Blitz, Moltiverse) favoured mainnet demos. **[Inferred]** Assume mainnet for the demo unless the gated rules say otherwise.

**Not confirmed [Unknown]:** whether a demo **video** is mandatory (assume yes and make a 2–3 minute one anyway); maximum team size; whether one team can submit multiple projects; whether bounties need a separate form; KYC for payouts.

**What the evidence says wins:** Moltiverse's organisers wrote "ship proof, not promises" and picked 16 winners from ~400 submissions; Encode's Raingentic recap (Sept 2026) lists the criteria used at a comparable Monad-ecosystem event: **idea, technical execution, presentation/documentation, wow factor**. **[Verified: S8, S10]**

---

## 5. Tracks & bounties

### 5.1 Tracks (each $30,000, split evenly between 3 teams) [Verified: S1]

| # | Track | Monad's stated "best fit" | Monad's printed example ideas | Visible competition (Sec. 9) |
|---|---|---|---|---|
| 1 | Onchain Finance & Trading | teams who have shipped trading/lending/MM products | fully onchain order books; perps with per-block funding; undercollateralised lending on onchain credit history | high, sophisticated |
| 2 | Consumer Products & Payments | product teams who care about the first five minutes | payments app that never mentions a blockchain; subscriptions charged by the second; shared wallets/group spending | high, obvious ideas already taken |
| 3 | Social, Attention & Culture | teams who have *grown* a community | feed where curation is paid for by those who benefit; **ticketing and access that follows a person rather than an email address**; markets on cultural outcomes | **low** (one arcade, tipping demos) |
| 4 | Trust, Identity & AI Infrastructure | teams comfortable with cryptography/protocols/agents | passkey-native P256/WebAuthn accounts; ERC-8004 agent identity; provenance for generated media | very high (agents, x402, ERC-8004) |

Plus **Grand Champion $25,000** (best overall) **[Verified: S1, S3]**.

### 5.2 Bounties — sponsor verified from the official page HTML [Verified: S3, S4]

| Bounty | Sponsor (verified) | Cash | What it most likely needs | Fit for Turnstile |
|---|---|---|---|---|
| Best Mobile Trading App on Monad | **Agora (AUSD)** | $10,000 | mobile trading UX with AUSD as funding/collateral | no |
| Best Cross-Border Payments App | **Agora (AUSD)** (not PingBusiness — Ping only contributes "up to $20k merchant rebate") | $10,000 | end-to-end AUSD payment flow | weak |
| Consumer Trading App on Kuru | Kuru | $5,000 | usable UI placing/routing Kuru trades | no |
| New Assets & Markets on Kuru | Kuru | $5,000 | deploy pair + seed real liquidity | no |
| Best use of Perpl's API | Perpl | $5,000 | REST/WSS trading or data product | no |
| Best Analytics / Risk Tool | **Perpl** | $3,000 | risk/positions/liquidation tooling | no |
| Best use of Nansen | Nansen | $5,000 | Nansen labels/analytics central to product | no |
| "Privy!" | Privy | $5,000 | substantial Privy auth/wallet/sponsorship use | optional (organiser login) |
| Best Use of Dynamic | Dynamic | $5,000 | embedded wallet stack central to product | optional (alternative to Privy) |
| **Best Mera-Powered UX** | Monad Foundation (Category Labs' Mera) | $2,500 | passkey onboarding/signing that makes UX better | **strong** |
| **Mera: One Passkey, Many Keys** | Monad Foundation | $2,500 | multiple derived accounts/roles from one passkey | **strong** (identity key vs spending key vs gate key) |
| Best Agent Wallet Plugin | MetaMask (Agent Wallet npm plugins, not Delegation Toolkit) | $2,500 | publish a plugin with least-privilege capabilities | no |
| Best Community Team Project | Monad Foundation | $5,000 | undefined publicly; likely community-formed teams | maybe (ask organisers) |
| Any-Chain Liquidity to Monad | Aurora Intents (NEAR 1Click) | $5,000 | quote→deposit→settle external asset into Monad | stretch ("pay from any chain") |
| Best workflow with CRE | Chainlink | $3,000 | trigger + capabilities workflow | no |
| CVI / CVA integration | Cleanverse | $1,000 + $1,000 | their SDK/API | no |
| Best Use of Envio | Envio | $1,000 | real HyperIndex indexer + GraphQL feeding the product | **strong** (live sales/check-in feed) |
| Best Projects using Alchemy | Alchemy | $1,000 credits | RPC/Gas Manager/webhooks via Alchemy | yes (verify mainnet in dashboard) |
| Qwen 3.8 Max / KIMI / Hunyuan | Alibaba / Moonshot / Tencent ("Kepler Plan") | $5k / $3k / $2k credits | real model calls with usage proof | optional (AI seat concierge — low value) |

Cash bounties sum ≈ **$76,500**, plus ≈ **$10,000 credits**. Full requirement analysis per bounty, SDK links and difficulty ratings: `research/bounty-report.md`. **[Verified: S4]**

---

## 6. Judging

- **Format:** judged **per track** during 14–27 Oct; no public rubric, weights, pitch round or scoring process. **[Verified: S1; Unknown otherwise]**
- **Who:** 18 judges (of 70 mentors + judges) — Keone Hon & Eunice Giarta (Monad co-founders), Tina Qi (Monad Head of Ecosystem), Maria Shen (Electric Capital), Alex Svanevik (Nansen CEO), Frankie (Paradigm), Will Nuelle (Galaxy), Evan Feng (CoinFund), Yiping Lu (IOSG), Elton Chang (Dragonfly), Joey Shin (Pantera), Wyatt Khosrowshahi (Castle Island), Brett (Prelude), Ajit Tripathi (Eigen Foundation), Uttam Singh (Alchemy), PBJ (Perpl) and others. **[Verified: S1]**
- **What that panel rewards [Inferred from composition + precedent S8, S10]:** it is a **venture panel**, not a devrel panel. Expect scoring to cluster around (1) is this a startup, not a demo — clear user, clear "why now"; (2) is it *only* possible/only good on Monad (sub-second finality, cheap gas, parallel execution, P256 precompile); (3) does it actually work on mainnet and can I try it myself; (4) craft and wow. The Grand Champion will almost certainly be a product that scores on all four; track winners can be strong on two or three.
- **Track 3's stated "best fit" — teams who have grown a community** — means Track 3 judges will weigh real usage. Plan a **real pilot event** during the hackathon (Section 20) so the submission has genuine tickets, genuine check-ins and a genuine organiser quote.

---

## 7. Rules & risks

**Published rules [Verified: S1]:** global; teams or solo; no prior onchain experience or fundraising needed; work must be new and built in-window; judges must be able to verify it; open source encouraged; one track per project; bounties unlimited.

**Risks and how to handle them**

| Risk | Severity | Mitigation |
|---|---|---|
| Gated rules contain something we haven't seen (team cap, KYC, video, mainnet requirement) | high | register **today**; read the rules before writing code; adjust scope by Monday |
| "Ticketing" reads as a cliché to VC judges (NFT tickets since 2018) | high | differentiate on passkey-bound identity, sub-second gate, contract-enforced caps, instant splits, fan passport; ship a **real** event; make the craft undeniable |
| Track 3 wants community traction | medium | pilot event + organiser testimonial + attendance numbers in the write-up |
| Mera is preview/pre-1.0; PRF support varies by browser/password manager | medium | isolate Mera behind an adapter; test iOS 18+/Android Chrome/1Password; keep a Privy fallback for organisers |
| Monad charges **gas on gas limit, not gas used** — sloppy estimates burn sponsor funds; EIP-7702-delegated EOAs can't drop below a 10 MON reserve | medium | tight gas limits; avoid 7702 for fan accounts; use a relayer/forwarder pattern for sponsorship [S13, S14] |
| Public RPC `eth_getLogs` windows are small (100–1000 blocks) | low | index with Envio HyperIndex; use WSS subscriptions for live feeds [S13, S18] |
| Phantom dropped Monad on 26 Aug 2026 | low | fans never need a wallet; organisers use MetaMask/Rabby/Backpack/OKX or Privy [S26] |
| Alchemy mainnet support text conflicts across their pages | low | verify in dashboard before relying on it for the bounty [S25] |
| Docs conflict on block gas limit (150M vs 200M) | none for us | irrelevant to this app |
| Sourcing MON for mainnet deploy + sponsorship | low | a few MON covers thousands of transactions at current gas; buy early |
| Git attribution | process | all commits/pushes under `vaibhav0xq`, never an agent identity (your standing preference) |

---

## 8. Monad tech resources (as of 12 Sep 2026) [Verified: S11–S18, S41]

- **Networks:** mainnet chain **143** (live since 24 Nov 2025), testnet **10143** (`faucet.monad.xyz`). Public RPCs incl. `rpc.monad.xyz`; explorers **MonadVision** (Sourcify verification) and **Monadscan**. 300 ms blocks, ~600 ms finality; recommended to treat `finalized` as settled for anything money-like.
- **Differences from Ethereum that matter:** gas charged on gas **limit**; reserve-balance mechanism; limited `eth_getLogs` ranges; EIP-7702 delegated EOAs keep a 10 MON reserve; Solidity 0.8.28 / `prague` target; Foundry ≥ 1.8 has `--network monad`.
- **Accounts & onboarding:** P256 precompile at `0x0100` (EIP-7951) for onchain WebAuthn verification; EIP-7702 live; ERC-4337 EntryPoints v0.6–0.8; smart-account stacks (Biconomy, MetaMask Smart Accounts, Pimlico, ZeroDev); embedded wallets (Privy, Dynamic, Turnkey); **Mera** (`@category-labs/mera`) turns a passkey's PRF output into portable BIP-44 keys client-side, with signing sessions and `toViemAccount` — the bounty-relevant path.
- **Data:** Envio HyperSync `143.hypersync.xyz` + HyperIndex; Alchemy/QuickNode RPC; Nansen API supports `monad`.
- **Money:** native USDC, **AUSD** (Agora), USDT0; Kuru (CLOB), Perpl (perps; AUSD collateral); ecosystem TVL ≈ $770M per Monad's July report [S27].
- **Oracles/cross-chain:** Chainlink feeds/Data Streams/CCIP, Pyth, RedStone, Stork, Switchboard; NEAR/Aurora Intents lists Monad.
- **Agents:** ERC-8004 Identity/Reputation registries live on mainnet; x402 facilitator; Monad MCP.
- **Wallets:** MetaMask, Rabby, Backpack, OKX. Not Phantom (dropped 26 Aug 2026).

Full stack notes with links: `research/subagent-stack.md`.

---

## 9. Competitor landscape (public GitHub + live sites, 12 Sep 2026) [Verified: S28, S29, S30]

**Already building for Metropolis (visible):**

| Track | Project | What | Threat |
|---|---|---|---|
| 2 | **Elapse** (`elapse.finance`, live) | per-second subscriptions; hosted app, SDK, docs, mainnet USDC | owns the "by the second" example idea |
| 2 | Settle | shared family wallets + remittance (Privy) | owns "shared wallets" |
| 2 | Iris | cross-border commitments in AUSD with passkeys | chases Agora $10k |
| 1 | DeltaMon | delta-neutral vaults across Kuru/aPriori/Perpl | strong finance entry |
| 1/2 | TradeAgent (super-agent) | mobile perps strategy games on Perpl; passkeys per strategy | chases Agora mobile + Perpl + Mera |
| 1 | Mandate | onchain prop firm | |
| 1 | XORR (live) | range tickets settled on Kuru | |
| 1 | parallelbook / livemarkets | 60-second prediction markets | |
| 4 | MonadSentry, agent-passport, Trustlayer, agentpay ×2, lockstep, Assay | ERC-8004 identity, x402 payments, agent guardrails, provenance screening | crowd |
| 3 | **Pongit** (live) | onchain arcade with Mera + Envio | only polished Track 3 entry seen |
| 3 | proofofattention, beamjar, gmonad-tip-jar | attention streaming / tipping demos (testnet) | weak |

**Ticketing specifically:** a handful of earlier Monad hackathon demos exist (monad-tickets Jun 2026: NFT tickets, capped resale, gasless check-in; SmartTix 2025; chainpass transit 2026). None is live, none is Metropolis-labelled, none uses passkey-bound identity, 3D venues or fan passports. **[Verified: S28]**

**Incumbent ecosystem (not hackathon):** finance is crowded (Kuru, Perpl, aPriori, Curvance…), payments rails are crowded, agent/trading-arena ideas are extremely crowded (Moltiverse: ~400 submissions, 8k+ agents). Under-served per the ecosystem scan: group spending with policy, paid curation, **identity-bound ticketing/access**, media provenance. **[Verified: S10, S27; Inferred]**

**Off-chain comparable for the recommendation:** **DICE** (founded 2014) — mobile-only tickets locked to a phone, fan-to-fan returns via a waiting list at face value, anti-tout tech; it proves fans and independent venues want identity-bound tickets and capped resale. **[Verified: S31]** Regulatory tailwind: the UK has been moving toward a face-value resale cap (Commons Library briefing, Jul 2026; timing uncertain after a May 2026 delay). **[Verified: S32]**

---

## 10. Design inspiration analysis

### 10.1 The five sites [Verified: S33–S37; inventories in `research/design/`]

| Site | What it really is | True 3D? | Steal | Skip |
|---|---|---|---|---|
| **ThreeUI** (threeui.com/browse) | 465-route library of raw Three.js/R3F/GLSL/Canvas/CSS3D worlds, materials, shader fields, full landing "documents" (Kage, Orrery, Cortexa, Sylva, Iridescent Silk, Advanced Glass). MIT community npm `@designcodeio/threeui`; Pro $99/yr ($199 lifetime) | **yes** — the benchmark | one persistent world with 3–4 camera waypoints and sparse editorial DOM; Orrery choreography (modules orbit a core, selecting one retargets camera/light and opens the live panel); Cortexa point cloud that resolves into the real UI; Holographic Glitter Card / Advanced Glass as the ticket material; bloom + haze + one accent | button variants, prerecorded "films", stacking several Canvases |
| **Skiper UI** (skiper-ui.com) | 100 shadcn-compatible React/Tailwind components (Framer Motion/GSAP/Lenis, some Three/R3F); free with attribution, Pro $129/$549 | limited (Liquid shader, ASCII sim, Interactive3d hero) | app-chrome motion: sheets, tabs, number tickers, text reveals; 200–300 ms UI easing; a couple of shader backgrounds | using it as the hero; it reads "template" fast |
| **Pryzm** (pryzm.design/studio) | WebGL2 procedural background studio; layers + effect stack (optics, light, waves, glass, dither, ASCII, grain); 450 ms `[.4,0,.1,1]` ease, 180/30 springs | no (GPU depth, not geometry) | scene lighting language: darkness, caustics, ribbed glass, film grain applied **in scene layers**; recipe/preset morphs instead of remounting sections | full-page gradient wallpaper |
| **FeralUI** (feralui.dev/gradients) | small physics-driven React experiments + free gradient builder; MIT packages `feral-blob`, `feral-fur`; demos not licensed to copy | no | **state-aware materials**: Hologram (pointer relights a card), Fur (animate only while settling), Jelly Blob (product state → character); aurora as a transition light | copying unlicensed demos |
| **Jiro** (jiro.build) | 1,171+ marketing sections/templates delivered as AI prompts; conventional 300–600 ms fade-ups; "3D" headers are video plates | no | the full-viewport "enter demo" mode; sparse chrome around an immersive preview | its motion vocabulary (this is exactly the "animated landing page" you don't want again) |

**Synthesis for a *product* 3D experience (not a template):**
1. **One world, one camera.** A single R3F canvas that persists from landing into the app. Chapters are camera waypoints, not page sections. Scroll drives a timeline (GSAP ScrollTrigger + Lenis) that moves the camera; DOM text is anchored to scene beats.
2. **3D that does a job.** The venue is the seat picker; the ticket is a physical object with light response; live check-ins are particles landing on seats. If a 3D element can't be clicked or doesn't reflect real data, cut it.
3. **Material language:** near-black stage, off-white type, warm "house lights" amber as the primary accent, violet ambient as the Monad nod (verify hexes in Monad's official brand kit [S42]); bloom, fog, grain in scene layers only; oversized display type (8–14 vw, −0.04 em tracking) with a mono for ticket data.
4. **Motion tokens:** UI 160–240 ms ease-out; camera/chapter moves 1.2–1.8 s with `cubic-bezier(.22,.61,.36,1)`; springs ~180/30; **no** repeated fade-up cards; `prefers-reduced-motion` → still compositions + crossfades.
5. **Performance discipline:** adaptive pixel ratio, instancing for seats, invalidate-on-demand rendering when idle, dispose on route change, one postprocessing pass budget (bloom + vignette).

### 10.2 The attached UX / UI docs — keep vs ignore [Verified: S38, S39; full analysis `research/subagent-uxui-docs.md`]

The docs are generic, e-commerce-flavoured guidance. **Keep as a quality floor (≈24 rules):** clear visual hierarchy; 8-pt spacing; consistent type scale; ≥4.5:1 contrast; visible focus states; touch targets ≥44 px; one primary action per screen; progressive disclosure; empty/loading/error states; optimistic UI with reversible actions; inline validation; skeletons over spinners; system feedback within 100 ms; forgiving inputs; consistent iconography; content-first copy; accessibility of motion; mobile-first breakpoints; performance budgets; consistent naming; state persistence; undo over confirm; predictable navigation; test with real users.

**Ignore / override for this project:** template hero-features-testimonials-pricing page anatomy; card-grid "feature sections"; stock gradient/blob backgrounds; generic hover-lift micro-interactions; "above the fold" CTA stacking; e-commerce product-grid patterns; the assumption that light theme is default.

**Reconciliation:** the landing operates in a *cinematic editorial mode* (world + sparse DOM); the app (checkout, passport, organiser dashboard, gate scanner) operates in an *operational mode* where the 24 rules apply strictly and the 3D recedes to a material accent.

---

## 11. What to avoid

**Idea-level**
- The three printed example ideas that are already taken and live: per-second subscriptions (Elapse), shared/family wallets (Settle), cross-border AUSD remittance (Iris). You'd be graded against a team that started 11 days earlier.
- Anything "AI agent + x402 + ERC-8004" unless you have a genuinely new mechanism — Track 4 is a pile-up.
- Generic prediction markets, trading bots, tip jars, "SocialFi feeds" with no distribution story.
- Building your own perp DEX or CLOB (Perpl/Kuru exist; the bounties want you to build *on* them).
- Anything whose demo depends on mocked off-ramps, fake KYC or fake merchants — VC judges notice.

**Design-level**
- An animated landing page (fade-ups, marquees, glassy cards, blob gradients) — the exact thing you shipped last time.
- Pre-rendered "3D" video plates; multiple Canvas instances; decoration that ignores product state.
- Heavy grain/aberration on UI chrome; text over unreadable shader backgrounds; motion with no reduced-motion path.
- Copying FeralUI demo source (unlicensed) or ThreeUI Pro source into a public repo.

**Process-level**
- Coding before reading the gated rules; leaving mainnet deployment to the last week; a demo video recorded on the last day; commits under an agent identity.

---

## 12. Opportunity areas

1. **Identity-bound access for culture** (Track 3, printed example, empty on GitHub, DICE-validated offline, regulatory tailwind). ← recommended.
2. **Real-time risk & microstructure tooling on Perpl/Kuru** (Track 1; Perpl $3k + $5k, Nansen $5k, Envio $1k; Perpl's co-founder and Nansen's CEO are judges).
3. **Demand-driven culture** — fans pool escrowed funds to make a show happen; instant refunds if the goal fails (Track 3; natural extension of #1).
4. **Media provenance that survives re-encoding** (Track 4 printed example; only "Assay" is adjacent and it's about onchain value, not media). Genuinely hard (perceptual hashing), venture appetite modest.
5. **Paid curation** (Track 3 printed example; empty on GitHub) — but social feeds need users to be believable.
6. **Consumer AUSD experiences that are not remittance** — e.g., tap-to-pay at events, where the payment is invisible (Track 2, Agora $10k cross-border is a stretch fit).

---

## 13. Ideas (nine candidates)

1. **Turnstile — tickets & access that follow a person.** Passkey account in 10 seconds; 3D venue seat picker; ticket bound to identity; venue-governed resale with capped price and waitlist; instant splits (artist/venue/opener); sub-second gate check-in; fan passport that carries presale rights. Track 3. Bounties: Mera ×2, Envio, Alchemy; stretch Aurora Intents / Privy.
2. **Depth — the 3D microstructure & risk terminal.** A live "city" of Perpl/Kuru markets rendered from tape: buildings = markets, height = open interest, lights = trades at 300 ms cadence, liquidation cascades as weather; per-account risk view. Track 1. Bounties: Perpl ×2, Nansen, Envio, Alchemy (≈$14k).
3. **Encore Drops — demand-driven shows.** Fans escrow to bring an artist to their city; when the goal hits, tickets mint to backers (bound to identity); if not, instant refunds. Track 3. Merges into #1 as stretch.
4. **Watermark — provenance for generated media.** Creators/agents (ERC-8004 identities) sign perceptual hashes of images/video; a verifier matches re-encoded copies; badge widget for publishers. Track 4. Bounties: Qwen/Kimi/Hunyuan credits, MetaMask agent plugin, Envio.
5. **Pocket Perps — mobile (Expo) perps on Perpl with AUSD and passkeys.** Track 1/2. Bounties: Agora mobile $10k, Perpl API $5k, Mera ×2 — but TradeAgent is already there with the same stack.
6. **Passage — cross-border AUSD with any-chain funding.** Pay in from any chain via Aurora Intents, settle AUSD on Monad, passkey recipients. Track 2. Bounties: Agora $10k, Aurora $5k, Mera. Crowded, mocked off-ramps.
7. **Signal — paid curation feed.** Curators stake to post; readers pay per read; stakes slashed by downstream readers; instant settlement makes micro-amounts real. Track 3. Bounties: Envio, Privy/Dynamic.
8. **Keyring — one passkey, many scoped keys for humans + agents.** Human passkey derives role keys with onchain spend policies; agents get bounded authority. Track 4. Bounties: Mera ×2, MetaMask agent plugin. Crowded with guardrail projects.
9. **Credit Ledger — undercollateralised credit lines from Nansen labels + onchain history.** Track 1 printed example. Bounties: Nansen $5k. Hard to make credible in four weeks (who lends?).

Deliberately excluded: per-second subscriptions (Elapse), shared wallets (Settle), agent identity passports (four repos), 60-second prediction markets (two repos).

---

## 14. Ranked idea matrix

Scores 1–5. Weights: prize potential 20 %, novelty 15 %, feasibility (4.5 weeks, this team) 15 %, demo strength 15 %, market 10 %, ecosystem fit 10 %, bounty fit 10 %, low risk 5 %.

| # | Idea | Track | Prize | Novel | Feas. | Demo | Market | Eco | Bounty | Low-risk | **Weighted** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Turnstile** | 3 | 4 | 3.5 | 4 | 5 | 4 | 4.5 | 3.5 | 4 | **4.08** |
| 2 | Depth | 1 | 3.5 | 3.5 | 4 | 5 | 2.5 | 4 | 5 | 4 | **3.93** |
| 3 | Encore Drops | 3 | 3.5 | 4 | 3.5 | 4 | 3.5 | 4 | 3 | 3.5 | 3.65 |
| 4 | Watermark | 4 | 3 | 4 | 3 | 3.5 | 3 | 4 | 3.5 | 3 | 3.38 |
| 5 | Pocket Perps | 1/2 | 3 | 2 | 3 | 4 | 3.5 | 4 | 5 | 2.5 | 3.33 |
| 6 | Passage | 2 | 3 | 2 | 3 | 3 | 4 | 3.5 | 5 | 2.5 | 3.18 |
| 7 | Signal | 3 | 3 | 3.5 | 3.5 | 3 | 2.5 | 4 | 2.5 | 3 | 3.15 |
| 8 | Keyring | 4 | 2.5 | 2.5 | 3.5 | 3 | 3 | 4 | 4 | 3 | 3.10 |
| 9 | Credit Ledger | 1 | 3 | 3.5 | 2 | 2.5 | 4 | 3.5 | 3.5 | 2 | 3.00 |

**Why Turnstile edges Depth:** Depth has the bigger guaranteed bounty stack and an easier "wow", but it is a viewer, not a business, and the Grand Champion / track-top-3 odds depend on a venture story. Turnstile is a product people already pay for (DICE, Fever, Ticketmaster) with a Monad-specific reason to exist, a track with thin competition, and a demo judges can run on their own phones. If, after reading the gated rules, mainnet deployment or a real pilot event turns out to be impossible, Depth is the fallback.

---

## 15. The recommended idea: Turnstile (working name)

**One line:** *Tickets and access that follow a person — bought in a 3D venue, held in your Face ID, verified at the door in under a second, resold only the way the venue allows, and paid out to everyone instantly.*

**Why now, why Monad**
- Passkeys (P256/WebAuthn) + Mera give an EVM account in ten seconds with no wallet, no seed phrase, no app store; the P256 precompile lets the chain verify the same credential the phone uses at the door.
- 300 ms blocks / 600 ms finality make **gate check-in an onchain event** rather than a database write — double-entry is impossible by construction, and secondary sales settle before the buyer reaches the queue.
- Gas cheap enough to sponsor every fan transaction; instant splits mean the opener, the venue and the artist are paid at the moment of sale, not 60 days later.
- Offline proof of demand: DICE built a $-hundreds-of-millions business on "tickets locked to a phone + face-value waiting list". Turnstile is that model with portable identity and programmable money, and without a platform in the middle.

**Users:** independent venues, promoters and community organisers (B2B); fans (B2C, zero-crypto). Early adopters: the Monad community itself — dozens of IRL events per month, all currently on Luma + wristbands.

**Core loop:** organiser creates event → seat map + rules (splits, resale cap, waitlist policy) → fans buy in the 3D venue with Face ID → ticket bound to passkey identity → resale only through the event's own market (cap enforced in contract, waitlist first) → gate scans a rotating, passkey-signed QR and writes check-in onchain → fan passport records attendance → next event: presale for passport holders.

**Positioning in the write-up:** "Track 3: access that follows a person." Secondary: consumer payments (invisible AUSD/USDC checkout).

---

## 16. MVP scope (must ship by 11 Oct)

**Contracts (Solidity 0.8.28, Foundry, mainnet 143)**
- `EventFactory` → `Event` (ERC-721 ticket with transfer hook: transfers only via the event's `ResaleMarket`), seat/section metadata, sale phases (passport presale → public).
- `ResaleMarket`: list ≤ face value × cap (organiser-set, default 100 %); waitlist auto-fills; fee split on every sale.
- `Splitter`: per-sale push splits to N payees (artist/venue/opener/Turnstile).
- `Checkin`: verifies the holder's signed challenge (EIP-712 from the Mera-derived key; stretch: raw WebAuthn via P256 precompile), marks the ticket used, emits `CheckedIn`.
- `Passport`: non-transferable attendance record per identity (ERC-5192-style locked token), read by `Event` for presale eligibility.
- `Forwarder` (ERC-2771): our relayer sponsors gas so fans never hold MON. Tight gas limits (Monad charges the limit).

**Accounts**
- Fans: **Mera** passkey → derived keys. Use the "many keys" derivation on purpose: key 0 = identity (owns tickets/passport), key 1 = spending (approvals/payments), key 2 = presence (signs gate challenges; rotates). This is exactly the *One Passkey, Many Keys* bounty story.
- Organisers: same passkey flow, with a Privy/MetaMask fallback for people who already have wallets.

**Web app (Next.js + R3F)**
1. **Landing world** (Section 19).
2. **Event page / seat picker:** the 3D venue (instanced seats, section highlighting, hover → price, click → hold). Live sales pulse in as they happen (Envio → GraphQL subscription).
3. **Checkout:** Face ID → sponsored mint in < 1 s → ticket materialises as a 3D holographic object. Pay in USDC/AUSD (mainnet) with a test-mode path for judges (we fund a demo balance).
4. **Passport / wallet:** your tickets and attendance; "transfer" opens the venue's resale flow only.
5. **Gate scanner (PWA):** camera scans rotating QR (ticket id + timestamp + signature), verifies onchain, animates the seat lighting up on the organiser's live venue view.
6. **Organiser dashboard:** create event, upload seat map (start with 4 venue templates: club, theatre, arena, festival field), set splits and resale rules, watch live sales/check-ins and payouts.

**Infra:** Envio HyperIndex (Ticket minted/listed/sold/checked-in), Alchemy RPC (+ public fallback), Postgres for event content, relayer service, Replit Autoscale deployment, MonadVision-verified contracts.

**Submission pack:** 2–3 min video, write-up (problem → why Monad → what's live → architecture → what's next), public repo (your GitHub identity), links to mainnet contracts, the pilot event's numbers.

**Week plan (IST)**
- **Sep 13–14:** register, read gated rules, join Discords, name + domain, freeze scope, design system tokens, repo + CI.
- **Sep 15–21:** contracts + tests; Mera onboarding spike (device matrix); forwarder + relayer; seat-map data model; 2D seat picker as fallback.
- **Sep 22–28:** 3D venue (instanced seats, camera rig), checkout, ticket object, Envio indexer, gate scanner alpha.
- **Sep 29–Oct 5:** resale market + waitlist, splits, passport + presale gating, organiser dashboard, landing world chapters 1–5.
- **Oct 6–11:** mainnet deploy + verification, **pilot event**, polish/perf/reduced-motion, video, write-up, bounty forms.
- **Oct 12:** submit. **Oct 13:** buffer.

---

## 17. Stretch scope (only after MVP is on mainnet)

1. **Pay from any chain** via Aurora/NEAR Intents 1Click (external asset → AUSD/USDC on Monad in the same checkout) — Aurora $5k.
2. **Encore Drops:** demand-driven events — fans escrow, threshold triggers minting, instant refunds otherwise.
3. **Expo mobile app** (Replit can build it) sharing the same backend — better gate scanning, push notifications for waitlist fills.
4. **Onchain WebAuthn verification** at the gate using the P256 precompile (no derived-key signature at all) — a strong Track 4-flavoured technical flourish.
5. **Memberships/guest lists** ("access", not just tickets): recurring access passes, co-working, community houses.
6. **Organiser analytics** (Envio-powered): sell-through by section, resale velocity, no-show rates.
7. **AI seat concierge** with Qwen 3.8 Max credits — low value, only if a spare day appears.

---

## 18. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Contracts | Solidity 0.8.28 (`prague`), Foundry ≥ 1.8 (`--network monad`), OpenZeppelin 5, forge tests + invariant tests for resale caps | Monad-recommended toolchain; verifiable on MonadVision |
| Chain | Monad mainnet 143 for demo; testnet 10143 for dev | judges expect mainnet; sub-second finality is the pitch |
| Accounts | `@category-labs/mera` + viem (passkey → BIP-44 keys, multi-key derivation, signing sessions); Privy fallback for organisers | Mera bounties; zero-wallet onboarding |
| Gas sponsorship | ERC-2771 forwarder + our relayer (Node, hot key, per-identity rate limits) | avoids 7702's 10 MON reserve; simple and reliable |
| Indexing | Envio HyperIndex → Hasura GraphQL + subscriptions | Envio bounty; sidesteps `eth_getLogs` limits |
| RPC | Alchemy (verify 143 in dashboard) + `rpc.monad.xyz` fallback; WSS for live check-ins | Alchemy credits |
| Frontend | Next.js 15, React 19, TypeScript, Tailwind 4, shadcn/ui (+ selected Skiper UI pieces with attribution) | fast, familiar, deployable on Replit |
| 3D | React Three Fiber, drei, `@react-three/postprocessing` (bloom, vignette), GLSL materials; GSAP ScrollTrigger + Lenis for the camera timeline; Zustand as the scroll→scene bridge; ThreeUI community pieces as references only | the persistent-world architecture from Section 10 |
| Wallet libs | viem + wagmi (custom `monad` chain object) | |
| Data | Postgres (Replit) for events/seat maps/content; IPFS pinning for ticket metadata (optional) | |
| Mobile | PWA first (camera scanner); Expo app as stretch | |
| Hosting | Replit Autoscale for web + relayer; custom domain | uptime during judging window |
| Observability | Sentry + relayer dashboards; uptime ping | judges may try it at 3 am |
| Repo | GitHub under `vaibhav0xq` (commits authored by you), MIT, README with architecture diagram | attribution rule + open-source signal |

---

## 19. Proposed landing / demo experience

**Principle:** the landing *is* the product entering frame — one persistent R3F world, five camera waypoints, sparse editorial type. No sections, no cards.

1. **Arrival — "The city."** A dark metropolis of light points (instanced) resolves from noise (Cortexa-style) into a skyline; each light is a real event on Turnstile (from Envio). Headline in 10 vw display type: *Access that follows you.* One action: *Enter a venue.*
2. **Descent — "The venue."** Camera dollies through the skyline into one venue; seats resolve as instanced geometry; live sales pulse amber. This is the actual seat picker — hover shows price, click holds a seat. Copy: *Pick a seat. No wallet. No app.*
3. **The ticket.** Face ID prompt (real Mera passkey). Sub-second mint on mainnet; the ticket materialises as a holographic card (thin-film material; pointer relights it, FeralUI-Hologram style). A tiny mono readout shows block number and finality time. Copy: *Yours in 600 ms.*
4. **The door.** Camera swings to the gate: a phone renders the rotating QR; a scanner beam reads it; the seat lights up in the venue behind. Copy: *Verified onchain before you finish walking in.*
5. **The next show.** Ticket folds into the passport; a new event on the skyline unlocks a presale ring. Copy: *Your history opens doors.* Actions: *Try it now* (live mainnet demo with a funded test identity) · *Run your event* (organiser flow).

**Demo mode:** the landing chrome collapses (Jiro's iframe idea, done natively) and the same world becomes the app. Judges can go end-to-end in under two minutes on a phone: create passkey → buy seat → view ticket → scan with a second device (or our "virtual gate") → see the passport update.

**Video (2–3 min):** open on the real pilot event (phones at a real door), cut to the product path above, close on the organiser payout screen and the mainnet explorer.

**Accessibility/perf:** reduced-motion path with stills and crossfades; keyboard-navigable seat picker (section list mirrors the 3D); adaptive DPR; target 60 fps on an M1 laptop and 30 fps on a mid-range Android.

---

## 20. Next steps (this weekend)

1. **Register on `hackathon.monad.xyz` now** (GitHub login), pick Track 3, read the gated rules and every bounty's requirement text; screenshot them into `research/sources/`. Confirm: mainnet expectation, team-size cap, KYC, video requirement, "Community Team" definition, whether track can be changed.
2. Join the Monad Discord hackathon channels; post a one-line intro; ask Category Labs (Mera) about PRF device support and Agora/Envio about bounty submission forms.
3. Decide the name (Turnstile / Doorlist / Admit / Marquee) and buy the domain.
4. Line up the **pilot event**: a Monad community meetup or a friend's show in the Oct 4–10 window; you need a real door and 30+ real attendees.
5. Set up the repo under your GitHub identity, CI, Foundry project, and the Mera device-matrix spike (iOS 18 Safari, Android Chrome, desktop Chrome + 1Password).
6. Buy a small amount of MON for deployment and sponsorship; create Alchemy/Envio accounts; verify Alchemy mainnet 143 in the dashboard.
7. Come back here and we start building — the first sprint is contracts + passkey onboarding + a 2D seat picker that becomes 3D in week two.

---

## 21. Sources

Registry with tiers and local paths: `research/sources.json`. Raw captures: `research/sources/` (official-*, rules-*, stack-*, bounty-*, eco-*, designA-*, designB-*, github-*, web-*). Subagent syntheses: `research/subagent-*.md`, `research/bounty-report.md`, `research/design/*.md`.

- [S1] Monad Metropolis official page — tracks, prizes, timeline, judges, sponsors, FAQ — https://www.monad.xyz/developers/hackathons/metropolis
- [S2] Metropolis platform strings — countdown 2026-10-14T03:59Z, intake, submission pipeline — https://hackathon.monad.xyz/
- [S3] Platform prizes/bounties listing — https://hackathon.monad.xyz/prizes
- [S4] Bounty→sponsor mapping verified from official HTML — `research/sources/official-04-bounty-sponsor-mapping.md`
- [S5] Rise In listing (unofficial) — https://www.risein.com/hackathons/monad-metropolis
- [S6] Monad on X, 1 Sep 2026 announcement (search snippet) — https://x.com/monad/status/2094826883049205806
- [S7] Metropolis IRL hacker houses on Luma — https://luma.com/monad-metropolis
- [S8] Encode Club Raingentic recap (criteria precedent), 7 Sep 2026
- [S9] Monad blog — "Home for Builders" (Blitz), Mar 2026
- [S10] Moltiverse — 400 submissions / 16 winners — https://moltiverse.dev/
- [S11]–[S15] Monad docs: network information, differences from Ethereum, EIP-7702, precompiles — https://docs.monad.xyz/
- [S16] Introducing Mera, 30 Jul 2026 — https://www.monad.xyz/blog/introducing-mera
- [S17] Mera GitHub — https://github.com/category-labs/mera
- [S18] Envio HyperIndex — https://docs.envio.dev/docs/HyperIndex/overview
- [S19] Perpl developer docs — https://docs.perpl.xyz/
- [S20] Kuru SDK — https://docs.kuru.io/sdk/quickstart-sdk
- [S21] Nansen API — https://docs.nansen.ai/
- [S22] Agora / AUSD — https://www.agora.finance/
- [S23] NEAR Intents chain support / 1Click — https://docs.near-intents.org/resources/chain-support
- [S24] MetaMask Agent Wallet plugins — https://docs.metamask.io/agent-wallet/plugins/
- [S25] Alchemy Monad — https://www.alchemy.com/monad
- [S26] Phantom ending Monad support, 26 Aug 2026
- [S27] Monad Economy: eight months in (Jul 2026); August 2026 ecosystem highlights — https://www.monad.xyz/blog
- [S28] GitHub Search API scan (this run) — `research/sources/github-01-repo-scan.md`
- [S29] Competitor READMEs — `research/sources/github-02-competitor-readmes.md`
- [S30] Elapse live — https://elapse.finance
- [S31] DICE wait list — https://dicefm.zendesk.com/hc/en-gb/articles/19958073128849-The-wait-list-explained
- [S32] House of Commons Library, Ticket resales (Jul 2026) — https://commonslibrary.parliament.uk/research-briefings/sn04715
- [S33] ThreeUI — https://threeui.com/browse · [S34] Skiper UI — https://skiper-ui.com/components · [S35] Pryzm — https://pryzm.design/studio · [S36] FeralUI — https://feralui.dev/gradients · [S37] Jiro — https://jiro.build
- [S38]/[S39] Attached `UX (1).md`, `UI (1).md` · [S40] Attached X-thread screenshot
- [S41] Monad guides — ERC-8004, agentic payments, MCP — https://docs.monad.xyz/
- [S42] Monad brand & media kit — https://www.monad.xyz/brand-and-media-kit

**Open questions (login-gated or sponsor-gated):** exact rules text; team-size cap; KYC; video requirement; "Best Community Team Project" definition; Agora API access for hackers; Alchemy mainnet 143 status; whether tracks can be changed after intake.
