# apps/web

The fan-facing app and the door, in one Vite SPA: a cinematic 3D city → venue → seat flow on React Three
Fiber, with the passkey ceremonies from `@turnstile/identity` and the sponsored calls from `apps/relayer`.

```
/                 the city — one beacon per event
/e/:address       the room — pick a seat, one passkey prompt, seat minted + door key bound
/t/:address/:id   the ticket — rotating 30 s entry code (QR + text), "view from your seat", sell / pass on
/gate/:address    the door — camera scanner (or paste a code) → relayer verifies → checkIn on-chain
/me               the passport — session, tickets across events, "forget this device" (stateless test)
```

No wallet, no app: the account, the per-event door key and the vault key are all derived from the passkey's
PRF output (`packages/identity/SPEC.md`). Free tiers are relayed through the ERC-2771 forwarder; paid seats
are paid from the passkey account itself (the relayer's testnet drip tops up brand-new accounts).

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
