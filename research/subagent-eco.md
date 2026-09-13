# Subagent result: eco

## Key Facts
- Metropolis is a six-week, four-track hackathon (1 Sep–13 Oct 2026), with $250K+, $30K/track, $25K Grand Champion, and a working demo/write-up/code-link requirement. Official page currently exposes eight bounty programs totaling $29K cash plus Alchemy credits; Kuru alone offers two $5K bounties and Perpl $5K. (https://www.monad.xyz/developers/hackathons/metropolis; as of 2026-09-12)
- Public Metropolis-specific builder disclosure is still sparse: 21 searches found official promotion, one MCP workshop, generic repos, and no credible public team-recruiting posts or clearly labeled Metropolis project repos. This likely reflects the event being only 12 days old, not absence of entrants. (https://x.com/monad/status/2094826883049205806; as of 2026-09-12; unfetched snippet)
- Finance is already deep: by end-Jul, Monad reported $770M DeFi TVL, ~$15B cumulative spot volume, $1B+ monthly DEX volume, and incumbents Uniswap, Kuru, Perpl, HelloTrade, Obsidian, Aave, Euler, Morpho, Curvance, and others. August DEX volume reached $3.64B and perps $2.5B. (https://www.monad.xyz/blog/monad-economy-eight-months-in; 2026-07-27; https://www.monad.xyz/blog/monad-ecosystem-highlights-august-2026; 2026-09-02)
- “Fully onchain order book” is not white space: Kuru is a funded hybrid CLOB-AMM; Perpl runs fully onchain CLOB perps and reportedly supports 1,000 post/cancels/sec at ~$0.0001 each. (https://www.monad.xyz/blog/monad-home-high-frequency-finance; 2026-03-04)
- Payments rails are crowded: Coinbase, MoonPay, Transak, Visa/Mastercard/Rain, MetaMask Money Account, plus Aug launches Abound, Meru, and Cero. However, shared/group spending and true per-second subscriptions did not surface as live Monad incumbents. (https://www.monad.xyz/blog/monad-economy-eight-months-in; as of end-Jul 2026)
- AI/agent ideas are heavily chased: Moltiverse drew 400 submissions and named 16 winners; public examples span agent VCs, dating, open worlds, battle arenas, and multi-agent trading. Monad Agent Hub already supports ERC-8004 registration, and Monad claimed 8,000+ agents by Jun. (https://x.com/monad_dev/status/2026359632344789199; 2026-02-24; https://app.monad.xyz/agents/skill.md; observed 2026-09-12)
- Strong prior demos were product-like and executable: Rebel winner OpenAlice joined research/strategy/execution; Agora-mesh settled agent services in MON; TickPay did streaming/API micropayments; Kimi-swarm made multi-agent execution observable. (https://www.techflowpost.com/en-US/article/30844; 2026-03-26; UNOFFICIAL)
- evm/accathon precedent rewards composable products: overall list was KiSignals, StageFun, OwnPay, Gorillionaire, StitchAI; Envio separately rewarded Gorillionaire’s real-time indexed AI signals and MonFundMe’s transparent donations. (https://docs.envio.dev/blog/announcing-the-monad-envio-hackathon-winners; undated, event 2025)

## Notable Claims Requiring Cross-Reference
- Official Metropolis page showed only eight bounty programs, while prior verified context says ~22 sponsors/bounties; authenticated platform content may contain the remainder.
- The official marketing deadline is 13 Oct, while the platform countdown reportedly resolves to 14 Oct 03:59 UTC; timezone presentation needs rules-page confirmation.
- TechFlow’s Rebel recap is the only detailed source found for those winners and is unofficial.
- Raingentic winner results were not discoverable; only primary pre-event bounty/judge posts surfaced.
- Search dates conflicted for the high-frequency-finance article; fetched page itself says 4 Mar 2026, which is used here.

## Source Quality Assessment
- Official Metropolis page — Tier 1, 2026-09-01/current.
- August ecosystem highlights — Tier 1, 2026-09-02.
- Monad Economy: Eight Months In — Tier 1, 2026-07-27.
- Home of High-Frequency Finance — Tier 1, 2026-03-04; promotional performance claims.
- TechFlow Rebel recap — Tier 3, 2026-03-26, UNOFFICIAL.
- Envio winners — Tier 1 sponsor primary, undated/event 2025; older than 12 months.
- X/GitHub/app-directory snippets — Tier 1 when official, Tier 3 for builder self-reports; dates recorded individually in snippet evidence.

## Gaps & Unanswered Questions
- No reliable Metropolis project roster, cofounder thread, Discord/Telegram recap, or project-specific GitHub set yet.
- No complete Moltiverse 16-winner list or Raingentic/Blitz city winner archive surfaced.
- No strong evidence found for live Monad incumbents in identity-bound ticketing, paid curation, group wallets, or re-encoding-resistant provenance.
- Specific status of Blink.cash/Monad Pay, Fantasy Top, Talentum, Kintsu, Magma, and aPriori needs product-by-product validation.

## Sources
1. Metropolis, https://www.monad.xyz/developers/hackathons/metropolis, 2026-09-01/current, Tier 1, `research/sources/eco-01-metropolis-official.md`
2. August 2026 ecosystem highlights, https://www.monad.xyz/blog/monad-ecosystem-highlights-august-2026, 2026-09-02, Tier 1, `research/sources/eco-02-august-ecosystem-highlights.md`
3. The Monad Economy: Eight Months In, https://www.monad.xyz/blog/monad-economy-eight-months-in, 2026-07-27, Tier 1, `research/sources/eco-03-monad-economy-eight-months.md`
4. Home of High-Frequency Finance, https://www.monad.xyz/blog/monad-home-high-frequency-finance, 2026-03-04, Tier 1, `research/sources/eco-04-high-frequency-finance.md`
5. Rebel in Paradise recap, https://www.techflowpost.com/en-US/article/30844, 2026-03-26, Tier 3/UNOFFICIAL, `research/sources/eco-05-rebel-ai-hackathon-recap.md`
6. Envio hackathon winners, https://docs.envio.dev/blog/announcing-the-monad-envio-hackathon-winners, undated/event 2025, Tier 1 sponsor, `research/sources/eco-06-envio-evm-winners.md`
7. Search/social/repo evidence (20 entries), URLs and dates inline, mixed tiers, `research/sources/eco-snippets.md`

## Crowded vs Underserved (my assessment)
| category | evidence | crowding | opportunity note |
|---|---|---:|---|
| CLOB/perps | Kuru, Perpl, $15K related bounties | high | Avoid another venue; build novel market/risk tooling atop APIs |
| Generic lending/yield | Aave/Euler/Morpho/Curvance, large TVL | high | Onchain-credit undercollateralization remains differentiated but hard |
| Invisible payments | Mature rails/cards/ramps and new super-apps | high | Only compelling with a sharply defined non-crypto workflow |
| Streaming subscriptions | TickPay precedent; no strong live incumbent found | medium | Strong Monad-native demo if metering, disputes, and UX are real |
| Shared/group wallets | No incumbent surfaced | low | Promising consumer wedge; pair passkeys with policy controls |
| Paid curation feeds | No incumbent surfaced | low | Underserved; requires credible anti-spam/incentive design |
| Identity-bound ticketing | No incumbent surfaced | low | Clear white space; add privacy-preserving transfer/recovery |
| Cultural prediction markets | CRSHmarket, Nad.fun, Kalshi/Polymarket | high | Avoid generic markets; narrow to a novel data/oracle source |
| P256/passkey accounts | Mera already launched; Dynamic bounty | medium-high | Build an application using Mera, not another wrapper |
| ERC-8004 agent identity | Agent Hub live; Moltiverse saturated | high | Reputation quality/slashing/interoperability may still be open |
| Generated-media provenance | No Monad incumbent found | low | Best infrastructure white space, technically ambitious |
| AI trading/agent arenas | Repeated across Moltiverse, Rebel, evm/accathon | very high | Repeated idea to avoid unless materially novel |