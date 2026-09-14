# Turnstile — remaining work plan

Written 14 Sep 2026 against staging checkpoint `de6bac9` (verified). Official build window 1 Sep – 13 Oct 2026;
the platform countdown ends 14 Oct 03:59 UTC = **14 Oct 09:29 IST**; submission fields open around 22 Sep and
are still unpublished (`research/sources/official-09-dashboard-status.md`). Staging is a working demo, not the
submission: the plan below takes it to a public website and a product a judge can use unassisted, then to the
video.

Strategy stays as selected — **Track: Social, Attention & Culture**; bounties **Best Mera-Powered UX**,
**Mera: One Passkey, Many Keys**, **Best Use of Envio**, **Best Projects using Alchemy**. Envio has to be a
feature a judge can see and poke, not a line in the README.

---

## 1. Complete and verified

| Area | State | Evidence |
|---|---|---|
| Contracts | `TurnstileFactory` + `TurnstileEvent` (ERC-721 seats, tiers, capped resale + fee, door-key binding, slot-bound EIP-712 entry codes, ERC-2771). Deployed and verified on Monad testnet with two seed events. | 62 Foundry tests, gas snapshot, ABI export check in CI; `packages/contracts/deployments/10143.json`; `docs/deploy-monad-testnet.md` |
| Identity | Mera 0.2.0 PRF namespaces: account (BIP-32 from PRF), per-event door keys (HKDF, chain + event in `info`), vault (AES-256-GCM). 15-min account session, 60-min door session, no keys persisted. | 54 tests, 17 vectors checked in CI; `docs/mera-spike-report.md` |
| Relayer | ERC-2771 relay with EIP-712 verification, gate lookup / check-in, passport ciphertext sync (Postgres, replay-safe), testnet drip, token metadata + `image.svg`, static SPA serving. | `pnpm smoke` end-to-end on testnet; `/api/health` on staging |
| Web | One persistent R3F world: city → venue (club, theatre, generic) → seat → checkout → ticket (rotating `TS3:` QR) → gate → lit seat. Resale (list / delist / pass on), organiser publish, passport page with vault. Judge mode: 38 s / 6 taps / 2 passkey prompts on staging, three testnet transactions. | `pnpm --filter @turnstile/web run judge -- --base <origin>`; `apps/web/shots/judge-*.png` |
| Indexer | Envio HyperIndex config + handlers for all seat-lifecycle events; `Event` / `Ticket` / `Fan` / `Activity` with derived counters, volumes, fees, handovers. **Not deployed, not consumed by the app.** | 5 handler tests; `packages/indexer/README.md` |
| Devices | Android Chrome + Google Password Manager: account / door / vault green on a real phone; Windows laptop via hybrid QR (user-reported). | `docs/device-matrix.md` |
| Ops | Staging republished from `de6bac9`; CI green; `baseURI` of both events points at staging metadata; migration and Envio checklists written. | `docs/final-domain-migration.md`, `docs/envio-hosted-handoff.md`, `docs/demo-video-storyboard.md` |

## 2. Missing for a full website / product experience

Grouped by what a judge would hit first.

**Public website (none today).** `/` is a hero, a judge-mode button, two event cards and an organiser link over
the city. There is no explanation of how it works, who it is for, what the venue sees, why a passkey and not a
wallet, what runs on Monad, or where the code is. No footer, no GitHub / contract / explorer links, no FAQ, no
Open Graph card (a submission link unfurls with no image), no 404 page.

**Judge-only chrome shown to everyone.** The top-centre stopwatch (`landing · 0 taps · 20.1 s · sponsored by
relayer`) renders for every desktop visitor on every route (`apps/web/src/ui/Shell.tsx` `Readout`, mounted
unconditionally in `App.tsx`). It reads as a bug outside judge mode.

**Envio is invisible.** Nothing in the app reads the indexer. Organisers see three counters from chain reads,
fans see current seats only, nobody sees history, feeds or volumes. See §6.

**Alchemy is absent.** No Alchemy service is used anywhere (RPC is `testnet-rpc.monad.xyz`). See §7/§11.

**States that are improvised.** No loader while the world compiles (blank canvas, then the city); no WebGL /
low-power fallback; Event / Ticket / Gate render `null` while config loads or when the address is unknown;
unknown routes render chrome over the scene with no page. Non-owners opening a ticket URL see "You're in."
phrased as if they were the holder.

**Mobile.** Beacon labels collide with hero copy on the landing (390 px); the header wraps `← City` / `New
passkey` onto two lines on `/e/*`; the event title and date sit on the LED wall unreadably; the wordmark
disappears at small widths.

**3D.** Theatre overview clips the proscenium on the left and the stalls on the right and shows stray seat
fragments bottom-left (`shots/staging-theatre.png`); a checked-in ticket's seat view sits inside the followspot
cone and the whole frame washes green (`shots/staging-ticket.png`); the city at 1440 px is mostly black with two
flat orange pillars.

**Operations.** The web gate never sends a bearer token, so `GATE_TOKEN` must stay unset for the in-browser
door to work; there is no operator login. Autoscale can run more than one relayer instance, and the transaction
queue, rate limits and drip cooldown are per-process (§7).

**Submission assets.** Video, write-up, OG image, screenshots, and a README front section that reads for a
judge rather than for us.

## 3. Landing page

Goal: the landing stays the product (the city is the seat picker's front door) but also explains it in one
scroll. Same route, same world; DOM sections below the fold, the camera holds the city with idle drift.

1. **Hero.** Keep *Access that follows you.* Add a two-line sub-claim that names the mechanism: "One passkey
   is your account, your door key and your private vault. Nothing to install, nothing to screenshot." Primary
   CTA **Enter the city** (scrolls the camera into the beacon list / focuses the first event); secondary pill
   **Judge mode · 2 minutes** kept prominent through 14 Oct. Move the stopwatch into judge mode only.
2. **Tonight in the city.** Existing cards, plus live numbers under each (inside · sold · last check-in ago)
   from Envio (§6), and a one-line **pulse ticker** of the latest activity across events.
3. **How it works — three frames.** *Pick a seat* (the venue in 3D, tap once) · *Your passkey signs* (one
   prompt; the seat is minted to an address derived from it) · *The door reads a 30-second code* (signed by a
   key that exists only for that event; the seat lights when the chain confirms). Each frame is a still from the
   judge run, not an illustration.
4. **Why identity-bound.** A copied code goes stale within a minute (30-second slots; the door accepts the
   current and the previous one — `packages/identity/src/entry.ts`, `TurnstileEvent.sol` ±1 slot) and a seat
   admits once, so a screenshot is worth at most one early entry that the holder sees — say exactly that, never
   "screenshots don't work"; the code itself can only be produced by the passkey that holds the seat. Resale is
   capped by the organiser with a fee back to them. Your notes are private (encrypted vault the relayer cannot
   read); your attendance is public on-chain like any ticket and the Live layer shows it by address.
5. **For organisers.** Publish from a passkey; choose a room; tiers, cap, fee; the gate key; a live door board
   (Envio). CTA → `/organise`.
6. **Under the hood.** Monad testnet (block times, three transactions in the demo), Mera PRF namespaces
   (account / door / vault, with the salts), ERC-2771 sponsorship, Envio HyperIndex (link to the hosted GraphQL
   endpoint), Alchemy RPC, MonadVision-verified contracts (links), GitHub. This section is where the four bounties
   become visible without a slide.
7. **FAQ (6 questions).** Is this a wallet? · What if I lose my phone? (passkey sync; stateless test) · What
   happens if someone copies my QR? (the honest one-minute window above) · What does the venue see? · Can I
   resell? · Does it cost gas?
8. **Footer.** GitHub · contracts · explorer · docs · "Built for Monad Metropolis — Social, Attention &
   Culture".
9. **Head.** OG + Twitter card (1200×630 render of the lit seat), canonical, `robots`, `apple-touch-icon`.
10. **Budget.** LCP < 2.5 s on 4G: type and fog first, city streams in; split the scene chunk (the bundle is
    2.0 MB of JS today, one chunk); `modulepreload` the app chunk; Lighthouse a11y ≥ 95 on `/`.

## 4. 3D cinematic

Ordered by what appears on the judge path.

1. **Loader and fallback.** A curtain with progress while the world compiles ("Lighting the city…"), then a
   reveal; a 2D event list + seat list (new; also the keyboard path, which does not exist today for seats)
   when WebGL is unavailable or `prefers-reduced-motion`.
2. **City.** Density and depth: a skyline silhouette against the fog, a ground haze gradient, more point
   mass near the beacons, beacons as light columns with a halo and a ground pool rather than flat pillars;
   labels anchored with leader lines and hidden when they would cross DOM copy (the mobile collision). Keep
   idle drift; add ±2° pointer parallax on desktop.
3. **Descent.** Replace the fade-to-black cut with a 1.4 s dolly from the beacon into the room and the house
   lights coming up row by row (this is the "wow" beat the build plan promised and the video needs).
4. **Theatre.** Reframe the overview so the proscenium and all three tiers fit at 16:9 and 3:2 (the current
   side box at (−23, 17, 12) clips both edges); find and remove the stray seat fragments bottom-left (instances
   placed below the stalls apron); give the curtain folds and a warm key light; balcony rail catches light.
5. **Seat view inside the followspot.** When the camera is within the cone (checked-in ticket, "View from
   here"), fade the volumetric cone to 0 and keep only the floor pool and a rim on the seat; also cap the LED
   wall's contribution to the green tint. The ticket page should look like sitting in a lit seat, not inside a
   green fog.
6. **Finale.** House lights down for 400 ms before the followspot snaps on; a faint dust in the beam; the
   confirmed tx hash typed into the mono readout. Keep the seat card hidden (done).
7. **Club.** Booths get a top-down fill so they read as furniture, not flat pink; the LED wall gets three
   authored programmes (noise, type, beat) cycling slowly; a low haze layer above the floor.
8. **Mobile quality tier.** Bloom off below the `low` tier, DPR cap 1.5, halve city point count, no
   post-processing noise; measure ≥ 30 fps on a mid-range Android.
9. **Verification.** Re-run the judge frames after each step; keep `shots/judge-*.png` as the reference set.

## 5. UI/UX fixes on current surfaces

Shell
- Stopwatch `Readout` only when the tour is active or was completed this session.
- Header at < 640 px: wordmark returns as icon + "Turnstile", actions collapse to Passport + one primary; no
  wrapping at 390 px on `/e/*` and `/gate/*`.
- Scrim behind route headers over bright scene content (LED wall on mobile).
- Environment chip: keep on staging; none on the final domain.

Landing / Event
- 404 route and explicit loading / unknown-event states (skeleton card, "No event at this address", back to
  city) instead of `null`.
- Tier chips: show "sold out" state; seat legend collapses on mobile.
- Seat card: the "View from here" action should not deselect when the seat is tapped twice (documented today,
  still surprising).

Checkout
- Failure copy for: passkey prompt cancelled (nothing charged), seat taken during checkout (auto-pick the next
  seat with a one-tap confirm), relayer rate-limited or unreachable (retry with backoff, plain sentence), tx
  reverted (show the reason from simulation).
- A visible receipt line (block, ms) after mint — already computed for judge mode; show it to everyone.

Ticket
- Non-owner view: "Seat 1 · General Admission — held by 0xFaD3…1BEE · checked in 11:46 PM", no "You're in.".
- Owner view: code rollover ring, "show this at the door" copy, brightness hint, one-tap "Open door" only
  when a gate exists.
- Resale panel: price validation against the cap in the same units the organiser set; explorer link on list.

Gate
- Operator mode: when the relayer has `GATE_TOKEN`, a one-time token entry on `/gate/*` stored in
  `sessionStorage`; otherwise a banner "open door (demo)". Camera denied → clear instruction + manual entry
  focused. Recent list capped and timestamps relative.

Passport (`/me`)
- "What is a passkey?" disclosure with the device guidance from `errors.ts`; session countdown with a
  re-prompt explanation; tickets grouped by night with links; history section from Envio (§6).

Organise
- Post-publish success state links to the room, the gate and the live board; "Your events" table with sold /
  inside / listed / volume from Envio; the raw gate address labelled "Door key for this deployment".

Accessibility
- Focus rings on all controls, `Esc` closes panels, tab order through checkout, `aria-live` for the
  stopwatch and gate verdict, contrast check on amber-on-black chips.

## 6. Envio — bounty readiness and the visible feature

**What the bounty judges score:** depth (derived / aggregated entities, non-trivial schema), a working product
with live and correct data, originality, craft. The indexer already has the aggregates; what is missing is
deployment and a product surface that visibly depends on it.

**The visible feature: the Live layer.** One GraphQL client, one "live · Envio HyperIndex · block N" chip, four
surfaces that cannot exist from RPC reads:

1. **Organiser live board** (`/organise/<event>`): door feed (`Activity` where `kind = CHECKIN`, newest
   first, tx links), sold / inside / listed / resales, primary and resale volume, fees earned, a check-ins-per-
   minute sparkline (new `EventMinute` bucket entity), all polling every 4 s. In the video a check-in appears
   here within seconds of the scan. This is the feature a real venue would pay for.
2. **Passport history** (`/me`): "Your nights" from `Fan` + `Activity` — bought, resold, checked-in with
   times and tx links, labelled as public on-chain history (distinct from the encrypted vault notes above it).
   Makes *Access that follows you* literal and is the Mera "many keys" story told from data.
3. **City pulse** (landing): the latest activity across events and per-event live numbers; beacon intensity
   from `Event.checkedIn / sold`.
4. **Ticket provenance** (`/t/*`): the seat's timeline (MINT → LIST → RESALE → BIND → CHECKIN) from
   `Activity` filtered by ticket.

**Depth additions to the schema (cheap, score well):** `Stats` singleton (events, seats sold, check-ins,
volume — landing headline numbers), `EventMinute` (time buckets for throughput), `Handover` entity per resale
(seller, buyer, price, fee, seat) instead of only a counter. Multichain (10143 + 143 in one config) only if
contracts go to mainnet, and only after entity ids become chain-qualified (`Event.id` is the address today,
`Ticket.id` is `address/token`, `Fan.id` the address — deterministic deployments would collide across chains);
otherwise leave the second network commented with the reason. `rollback_on_reorg` is `false` in
`config.yaml`: confirm how the hosted indexer treats unfinalised Monad blocks (finality is sub-second, but the
setting is the safe default) before trusting cumulative `Stats` / `EventMinute` counters in the video.

**Honesty signals:** freshness chip compares indexer head block to `/api/health` block; when
`VITE_ENVIO_GRAPHQL_URL` is unset the panels render an explicit "history unavailable" state — never fake rows.

**Plumbing:** browser → hosted GraphQL directly (public endpoint; confirm CORS from the browser on day one);
relayer proxy `/api/live/*` if CORS or rate limits bite. `graphql-request` or plain `fetch` + TanStack Query; queries in `apps/web/src/live/`.

**Steps** (details in `docs/envio-hosted-handoff.md`): Envio account + GitHub app → deploy `packages/indexer`
from `main` → verify the four queries → wire the client → ship the four surfaces → README section with the
endpoint, schema and two example queries → keep the deployment alive (dev plan deletes after 30 days and after
7 days without requests; the 4 s polls from any open tab count, and a weekly manual query is the backstop).

## 7. Final hosting, Vercel, passkeys and domains

**Passkey facts that constrain the choice.** The passkey `rpId` is the page's hostname or a registrable
suffix of it, set today from `VITE_RP_ID` or `window.location.hostname` (`apps/web/src/identity/store.ts`).
Credentials are scoped to the RP ID and are unusable from any other: staging passkeys stay on staging, and the
final domain must be the one judges use from the first day of judging. On a platform subdomain
(`*.replit.app`, `*.vercel.app`) the RP ID is the full hostname (the current default). On a custom domain the
rule is **one canonical host**: the apex serves the app, the relayer redirects `www.<apex>` to it with a 301
before any page loads (small middleware; the host allowlist already exists for `PUBLIC_ORIGIN`), and
`VITE_RP_ID=<apex>` is set explicitly so a future subdomain (a dedicated gate host, say) shares the same
credentials. Without the redirect, apex and `www` would grow two separate passkey populations even with the
apex RP ID. The relayer never verifies WebAuthn origins (only EIP-712 / EIP-191 signatures), so the API origin
does not affect passkeys. `docs/final-domain-migration.md` is updated to this rule.

| Option | Feasibility | Notes |
|---|---|---|
| **A. Replit single origin + custom domain** (current architecture) | Ready today | Web and API on one origin, no CORS, no `VITE_API_URL`. Link the apex and `www` as separate entries (A + TXT each; TXT stays for renewals). **Set Autoscale max machines = 1** (the tx queue, rate limits and drip cooldown are per-process; two instances share one relayer key and would collide on nonces), or move to Reserved VM to avoid scale-to-zero cold starts during judging. Passports already in Postgres. |
| **B. Web on Vercel, relayer on Replit** | Feasible, 1 day | Vite SPA deploys as-is; needs `VITE_API_URL`, `CORS_ORIGIN`, `PUBLIC_ORIGIN` = web origin for metadata `image` URLs while `baseURI` points at the API origin. Gains a CDN and preview URLs; loses single-origin simplicity, and every preview URL is a fresh `rpId`. Two domains to keep in sync. |
| **C. Everything on Vercel** | Not without a refactor (3–4 days + new infra) | Hono runs on Vercel functions, but the relayer relies on process state: a FIFO transaction queue for nonce ordering, in-memory rate limits and the drip cooldown map. Concurrent invocations would need a distributed lock / nonce allocator (Redis) and KV for limits; the 30 s receipt wait fits within function limits but stacks on top of queueing. New failure modes right before submission. |

**Recommendation: A.** Buy the domain now (DNS propagation is the slow part), keep staging as the rehearsal
origin, and set max machines = 1 before judging. Revisit B only if the landing's LCP cannot be met from the
relayer's static serving.

**Alchemy (kept, low effort, mostly env plus two small code changes):** create an Alchemy app for Monad
testnet; set the relayer's `RPC_URL` to it and `PUBLIC_RPC_URL` to a second key restricted to the final domain
(browser seat reads). Code: the browser builds a single `http()` transport today
(`apps/web/src/chain/client.ts`) and the relayer likewise — switch both to viem `fallback([alchemy, public])`
so a key outage degrades instead of failing; `/api/health` gains an `rpc` provider label (it has none) and the
"Under the hood" section names it. Verify in the dashboard which Alchemy tools support Monad before promising
more (webhooks for organiser alerts would be the next step if available). RPC alone is the thinnest possible
reading of "meaningfully integrates"; treat it as the floor, confirm the card's wording when the portal opens,
and do not claim features that were not verified.

## 8. Final-domain migration (summary of `docs/final-domain-migration.md`)

1. Decide domain and hosting (§7). 2. Link apex + `www` in Publishing → Domains; wait for verification.
3. Production env: `PUBLIC_ORIGIN=https://<apex>`, remove `ENVIRONMENT_LABEL`, set `VITE_RP_ID=<apex>`,
Alchemy `RPC_URL` / `PUBLIC_RPC_URL`, Envio `VITE_ENVIO_GRAPHQL_URL`; the `www` → apex redirect deployed; max
machines 1; republish; check boot logs. 4. Verify `/api/health`, `/api/config` (no label), metadata + `image.svg`, spoofed-host header rejected.
5. `pnpm smoke` and the judge run against the final origin (this consumes one seat — use the theatre or a
rehearsal event, see §10). 6. Re-point `baseURI` for events 1 and 2 with `SetBaseURI.s.sol` (trailing slash,
admin key), confirm `tokenURI(1)` and slot 4. 7. README, deploy doc, storyboard, notes → gated commit.
8. Afterwards: staging stays labelled; staging passkeys are throwaway; a republish is needed for every later
change.

## 9. Real-device testing still needed

All on the **final origin** (passkeys are per origin), each row recorded in `docs/device-matrix.md` with
prompt counts, timings and the JSON from the device page.

| Row | Why | Pass criteria |
|---|---|---|
| iPhone, iOS 18 Safari + iCloud Keychain | Most likely judge phone; PRF on iOS 18+ untested here | create → seat → code → check-in; stateless test on a second Apple device |
| iPhone, Chrome (WebKit) | Same passkeys, different UI | sign-in reuses the Safari passkey |
| macOS 15 Safari + Touch ID | Judge laptop A | full run; vault decrypt after "forget device" |
| macOS 15 Chrome + Google Password Manager | Judge laptop B | full run; PRF via GPM |
| Windows 11 Chrome/Edge + Windows Hello | Judge laptop C; Hello PRF only on recent builds | either PRF works, or the app shows the phone-QR (hybrid) path and completes with an Android/iPhone |
| Android Chrome + GPM (re-run) | Green on staging origin; needs the final origin and prompt counts | ≤ 2 prompts to a lit seat |
| 1Password / Bitwarden extensions | Common among judges | PRF supported → pass; otherwise a clear `PRF_UNAVAILABLE` message with the guidance |
| Gate camera: Android Chrome and iOS Safari (`barcode-detector` ponyfill) | Never run on a real camera | scans a phone screen across the 30 s rollover, rejects a stale code |
| Cross-device door | Ticket on phone, gate on laptop webcam and the reverse | check-in < 3 s after scan |
| Mid-range Android performance | Quality tiers | ≥ 30 fps in the club, no thermal stall through the judge run |
| Reduced motion / no WebGL | Fallback paths (§4.1) | list-based flow completes |

## 10. Before final demo capture

- Website complete (§3) and app fixes (§4–5) merged; final domain live; `baseURI` re-pointed; Envio panels
  live with real rows; Alchemy in `/api/health`.
- Device matrix (§9) green for iOS + macOS + Android + one Windows path; storyboard adjusted to the measured
  timings on the final origin.
- **Demo data.** Front rows of *Neon Night* already carry four "inside" seats (they add life; keep them). Stop
  running judge flows against the seed events. For the capture, publish a third event ("Turnstile Opening
  Night") 30 minutes before recording and seed 10–20 realistic activities (mints, one resale, a few check-ins
  over ten minutes) so the live board and pulse are not empty. Script this (`scripts/seed-night.mjs`) so it can
  be re-run. **Code prerequisite:** the tour takes the *first* event with a free tier
  (`apps/web/src/app/routes/Landing.tsx`), which is *Neon Night* forever — change the default to the newest
  free event and add a `?event=<address>` override for judge mode, otherwise the capture keeps eating seed seats.
- Relayer 5 MON, gate 2 MON, drip on; relayer warm (one request a minute before capture, or Reserved VM).
- Capture rig per `docs/demo-video-storyboard.md`: display capture (passkey sheet is an OS window), 1440×900
  at 60 fps, fresh passkey on the capture machine, phone screen-recording for the mobile insert; a dry run at
  presenter pace the day before.
- Freeze README (judge-facing front section, bounty map, links), the submission write-up, and the OG image.
- **Portal gate (from 22 Sep):** when the submission fields open, read the actual requirements (video length,
  mainnet vs testnet wording, team / KYC fields), enter the public repo, re-confirm the track and the four
  bounty selections, and fold any new deliverable into this plan before the video is cut.
- Video only after all of the above; no speed-ups of the run itself.

## 11. Recommended build order

| # | Work | Effort | Target |
|---|---|---|---|
| 1 | Domain + hosting: buy `turnstile.show`, link apex + `www`, Alchemy keys, `VITE_RP_ID`, Reserved VM, migration §8 steps 1–4 (not `baseURI` yet). Code side done 14 Sep: `www` → apex redirect middleware (`REDIRECT_HOSTS`), viem `fallback` transports in relayer and browser (`RPC_FALLBACK_URLS`, `PUBLIC_RPC_FALLBACK_URLS`), `/api/health` `rpc` block and `/api/config.rpcProvider` | 1.5 days + DNS wait | 16 Sep |
| 2 | Envio: deploy indexer, schema additions (`Stats`, `EventMinute`, `Handover`), client + four surfaces, freshness chip. Code side done 14 Sep: schema additions, `apps/web/src/live/` client + hooks, organiser live board, city pulse, attendance record, seat provenance, freshness chip against `/api/health`, `scripts/mock-indexer.mjs` for UI work. Left: the hosted deploy and `VITE_ENVIO_GRAPHQL_URL` in production | 3 days | 20 Sep |
| 3 | App surface fixes (§5) — done 14 Sep: judge-only stopwatch, mobile header, scrims, 404 / loading / unknown-seat states, non-owner and unsold ticket copy, checkout failure copy, gate operator token, tour target (newest free event + `?event=`) | 2 days | 22 Sep |
| 3b | Portal gate: submission fields open — read requirements, enter repo, re-confirm track + bounties, adjust this plan | 0.5 day | 22–23 Sep |
| 4 | 3D fixes on the judge path (§4.1, 4.4, 4.5, 4.6, 4.8) — done 14 Sep: loader + flat fallback with a DOM seat list, theatre reframe, followspot wash, quality tiers (mobile) | 3 days | 25 Sep |
| 5 | Landing / website (§3) — done 14 Sep: hero CTA + sub-claim, programme sections 01–05 with stills from the judge run, FAQ, footer, OG / manifest / robots / icons, scene chunk split (lazy `World`, 877 kB app + 1.2 MB scene). Left: `VITE_SITE_URL` on the final origin (absolute OG URLs + canonical), Lighthouse pass on the final host, city pulse numbers need the hosted Envio | 3 days | 29 Sep |
| 6 | 3D depth (§4.2, 4.3, 4.7): city density, descent dolly, club dressing | 2–3 days | 2 Oct |
| 7 | Smoke + judge run on the final origin, **then** re-point `baseURI` (migration order); device matrix (§9), fixes from it | 3 days | 6 Oct |
| 8 | Freeze: README, write-up, code review, gate + push; seed-night script; storyboard dry run | 1 day | 7 Oct |
| 9 | Capture and edit the video; submit | 2 days | 9–10 Oct |
| — | Buffer to the 14 Oct 09:29 IST deadline | 3–4 days | — |

Rules that hold throughout: every commit gated and authored by you; nothing sensitive in the repo; Envio, the
domain and Alchemy are your accounts — I prepare the exact steps and verify afterwards.

## 12. Decisions taken (14 Sep 2026)

| Question | Decision | Consequence in this plan |
|---|---|---|
| Domain | **`turnstile.show`** (backups `turnstile.club`, `turnstile.one` if the first is gone at checkout) | `PUBLIC_ORIGIN=https://turnstile.show`, `VITE_RP_ID=turnstile.show`, `REDIRECT_HOSTS` covers `www` automatically; the migration runbook names it. No migration step runs until the domain is bought and linked. |
| Hosting | **Option A** — Replit single origin + custom domain, **Reserved VM** through judging (fallback: Autoscale with max machines = 1) | No `VITE_API_URL`, no CORS. The relayer stays single-process, which its tx queue, rate limits and drip cooldown assume. |
| Mainnet | **Testnet-only judged submission**, mainnet-ready architecture documented | Envio config keeps chain `10143` only; entity ids are chain-qualified so `143` can be added without a re-index of ids. README/write-up state the testnet deployment plainly. No mainnet keys, funds or deployments before the deadline. |
| Demo video event | **Fresh "Opening Night" club event**, seeded the day before capture | Capture uses `?event=<address>` to target it; the judge default (no parameter) is the newest event that still has a free seat, so the seeded night is also what a judge lands on. Seed script + storyboard dry run stay in step 8. |

Still yours to do when ready (each has an exact runbook): buy and link the domain (§8 steps 1–4), create the
Alchemy app and keys, deploy the indexer to Envio hosted and hand back `VITE_ENVIO_GRAPHQL_URL`, publish.
