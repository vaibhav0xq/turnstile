# apps/web

The fan-facing app and the door, in one Vite SPA: a cinematic 3D city → venue → seat flow on React Three
Fiber, with the passkey ceremonies from `@turnstile/identity` and the sponsored calls from `apps/relayer`.

```
/                 the city — one beacon per event
/e/:address       the room — pick a seat, one passkey prompt, seat minted + door key bound
/t/:address/:id   the ticket — rotating 30 s entry code (QR + text), "view from your seat", sell / pass on
/gate/:address    the door — camera scanner (or paste a code) → relayer verifies → checkIn on-chain
/me               the passport — session, tickets across events, the private vault, "forget this device"
/organise         the organiser — publish an event from your passkey, see sold / inside, copy the door link
```

No wallet, no app: the account, the per-event door key and the vault key are all derived from the passkey's
PRF output (`packages/identity/SPEC.md`). Free tiers are relayed through the ERC-2771 forwarder; paid seats
are paid from the passkey account itself (the relayer's testnet drip tops up brand-new accounts).

Publishing an event is the one action that costs the user gas: `TurnstileFactory.createEvent` takes
`msg.sender` as the organiser, so the passkey account signs it directly (topped up by the testnet drip when
needed). The form maps tiers onto the venue templates in order — club: floor, booths, gallery; theatre:
stalls, circle, balcony — numbers seats 1…, 1001…, 2001… per tier, grants the deployment's gate key
`GATE_ROLE` so `/gate/<event>` works from the first minute, and points `baseURI` at the relayer's metadata
(`/api/events/<eventId>/tickets/`). The call is simulated first, so a bad configuration comes back by name
(`InvalidConfig`, `InvalidTiers`) instead of as a failed transaction. Right after a top-up the send is
retried for a few seconds if a node answers "insufficient balance": on 0.4 s blocks behind a pool of RPC
nodes, the node that took the send can be a block behind the one that confirmed the drip.

The city shows tonight, not an archive: a night leaves the bill, the beacons and the tour's pick six hours
after doors (`src/app/nights.ts`; sales close at doors on chain, so nothing is left to take). Direct links
to an older room still open it.

The private vault on `/me` is the third key in use. *Open vault* is one more passkey prompt; it re-derives
the AES-256-GCM passport key (`packages/identity/SPEC.md` §2.3), fetches the blob the relayer holds for
this account (`GET /api/passport/:address`) and decrypts it in memory: a name the passport calls you and a
private line under each ticket. *Save passport* encrypts the new plaintext, signs
`turnstile/passport-sync/v1 · address · keccak256(blob) · issuedAt` with the account key and `PUT`s it back
(SPEC §4.6) — the relayer checks the signature and the watermark and stores ciphertext it cannot open. The
stateless test is the point: *Forget this device*, sign in on anything, open the vault, and the same name
and notes come back. `/me` also shows every seat bound to the passkey across events, with a dot per state
(green inside, cyan bound, amber not yet bound).

One device is enough to walk the whole loop: the ticket's *Walk up to the door →* opens
`/gate/<event>#code=<current code>` — the door view reads the code once, drops it from the URL, looks it up
straight away and leaves the camera off until asked. The operator (or the judge) taps *Admit*; the relayer
verifies and checks in exactly as it would for a scanned QR. *Copy code* is there for a second tab.

Resale is capped by the organiser (`resaleCapBps` of face) and closes at doors. From the ticket a holder
lists at or under the cap or delists (both relayed); a listed seat shows on the map as *Resale · price* with
*Buy resale* (paid from the buyer's account, seller and organiser paid in the same transaction), or as
*Passed on · Free* with *Take this seat* when the ask is 0 — that path is sponsored end to end, so a friend
with no MON can take a free ticket. Either way the sale clears the seller's door key; the new holder binds
their own and the seller's codes stop verifying.

## Run (local chain)

```bash
anvil --chain-id 31337 --port 8545          # terminal 1
pnpm dev:chain                              # deploy + seed two events, writes deployments/31337.json
pnpm dev:relayer                            # terminal 2 — apps/relayer/.env has the anvil keys
pnpm dev:web                                # terminal 3 — http://127.0.0.1:5173 (proxies /api → relayer)
```

Set `VITE_API_URL` when the relayer is not proxied by the dev server and `VITE_RP_ID` when the origin's
hostname is not the relying party you want passkeys bound to (defaults to `window.location.hostname`).
Behind a proxied preview (a tunnel, a cloud IDE) the dev server is reached under another host name: set
`VITE_ALLOWED_HOSTS=all` (or a comma-separated list of host names) to let those requests through.

**Live layer.** `src/live/` reads the Envio indexer's GraphQL endpoint (`VITE_ENVIO_GRAPHQL_URL`, build-time)
for the four surfaces RPC reads cannot give: the organiser live board (`/organise` → Live), the city pulse on
the landing, the attendance record on `/me` and a seat's provenance on `/t/<event>/<seat>`. Every one polls
every 8 s and carries the freshness chip: the indexer's block and the relayer's `/api/health` block, read in
the same tick (polled apart they drift a poll's worth, which on 0.4 s blocks looks like lag), with tones set
by time — in sync to 5 s, amber to a minute, red beyond. With the
variable unset they render an explicit "unavailable" line, never fabricated rows. For UI work without Docker
or a hosted indexer, `node scripts/mock-indexer.mjs [--lag N] [--fail]` answers the five named operations
with deterministic fake rows on `http://127.0.0.1:8790/v1/graphql` — local only, never point a deployment at it.

In development a **dev identity** (`/me` → dev identity, or `?dev=<seed>`) replaces the WebAuthn prompt with
a deterministic PRF so the whole flow can run in a headless browser; production builds do not include it.
`apps/relayer/scripts/smoke.mjs` derives the same identities, so a seat bought by `pnpm smoke --seed fan-1`
shows up as *yours* at `/me?dev=fan-1` and `/t/<event>/<seat>?dev=fan-1` shows its live entry code.

## Low-memory build and headless screenshots

`vite build` needs ~600 MB; on a small box use the esbuild + Tailwind CLI path instead:

```bash
pnpm --filter @turnstile/web build:lite        # → dist-lite/ (gitignored); BUILD_DEV=1 keeps the dev identity + probes
node --max-old-space-size=96 apps/relayer/src/index.ts   # STATIC_DIR=../web/dist-lite serves it on :8787
node scripts/shoot.mjs /e/<event>?dev=fan-1 --width 1280 --height 800     # screenshots via headless Chromium
```

When even the relayer and Chromium together are too much, `scripts/fixture-server.py` serves `dist-lite/`
plus recorded `/api/config` and `/api/events` (`curl` them into `fixtures/` while the relayer is up) on
`:4174` in ~10 MB; seat state still comes live from the chain, only writes are unavailable (503).

`scripts/shoot.mjs` takes any number of routes and writes `shots/<route>.png` (gitignored). Options:
`--base` (default `http://127.0.0.1:4174`, the fixture server; pass the relayer's origin otherwise),
`--wait` ms, `--name`, `--eval "<js>"` runs in the page after
`--eval-delay` ms (default 2500), `--print "<js expression>"` logs a JSON result. With `BUILD_DEV=1` the page
exposes `window.__world` (the R3F root state), `window.__director` (scene store) and `window.__identity`
(identity store), so a shot can drive the app: `--eval "window.__director.getState().selectSeat(48)"` or
`--eval "window.__identity.getState().ensureFan()"`. Under SwiftShader a full-page shot takes 15–30 s.

`scripts/judge-run.mjs` (also `pnpm --filter @turnstile/web run judge`) plays judge mode end to end and
times it from the tour bar's own `data-step` / `data-waiting` / `data-elapsed` hooks, so it works against any
build, including a deployed origin: `--base <origin>` (or `BASE_URL`), `--seed x` for the dev identity on dev
builds (autopilot presses everything), no seed for the real path (a CDP virtual platform authenticator answers
both passkey prompts and the script "taps" the two controls the autopilot leaves to a human). One frame per
step lands in `shots/judge-<n>-<step>.png` plus `judge-final.png` after the hero shot; exit code 1 on timeout.
`scripts/browser.mjs` holds the shared launcher (`launch`, `watch`, `addVirtualPasskey`) both scripts use.

## Tests

`pnpm --filter @turnstile/web test` runs `test/**/*.test.ts` with the Node test runner (no bundler): venue
layouts are pure functions of the on-chain venue id + tier ranges, so the suite pins that every seat gets one
position, nothing overlaps, and identical inputs give identical geometry on every device.

## Structure

```
src/scene       Canvas, City (point-cloud downtown + beacons), Venue (stage, rig, LED wall / proscenium),
                Seats (instanced, one draw call per section), CameraRig, director store (chapters, cuts)
src/venues      deterministic layouts from the on-chain venue id (club: GA arcs + booths; theatre: stalls,
                circle, balcony); seat ids ↔ positions ↔ labels
src/identity    zustand wrapper over @turnstile/identity — sessions, door keys, dev identity
src/chain       relayer config, viem clients, seatStates polling
src/relayer     ForwardRequest signing + /api/relay, direct paid buys, gate lookup / check-in, drip
src/app         routes + the checkout flow (passkey → buy → bind, resumable)
src/ui          panels: checkout, ticket (rotating code), gate scanner, shell
```

`pnpm --filter @turnstile/web typecheck | test | build`; `pnpm verify` at the root runs them all.

Rendering notes: the seat card is a DOM element in the overlay, moved to the projected seat position every
frame by `scene/anchor.ts` (no HTML inside the canvas container, no per-frame React work). The city is one
point cloud (window lights) plus instanced blocks, and the venue draws one instanced mesh per section; both
scenes rely on `postprocessing` (bloom, SMAA, vignette) with the tone mapping left to three.

Quality tiers: `high` / `low` / `min`, chosen from the device at load (phones start at `min`: no post stack,
MSAA instead of SMAA, DPR ≤ 1.25, no haze, sparkles or volumetric cones) and only ever stepped down by the
frame-time monitor. Every cut links its shader programs behind the flash or the curtain
(`scene/CompileGate.tsx`) before a frame is drawn, so a slow driver stalls under the overlay rather than on
screen. `?tier=min|low|high` pins a tier; `?perf=1` overlays frame time, draw calls and compile time.
