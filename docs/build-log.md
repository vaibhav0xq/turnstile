# Build log

Dated notes from the build, oldest first. The root README describes the product as it stands; this file
keeps the order in which it came together.

## 12 September 2026

Identity package done and vector-pinned. The spike gate was met on Android Chrome with Google Password
Manager and on Windows via the hybrid QR flow (`device-matrix.md`). Contracts written and tested (unit,
ERC-2771, shared vectors, invariants; scripts exercised on anvil and on a fork of the live testnet).
SPEC v1.1 adds `BindDoorKey`. Deployment runbook: `deploy-monad-testnet.md`.

## 13 September 2026

`apps/relayer` and `apps/web` run end to end on anvil: seat picker, passkey, relayed `buy`, `bindDoorKey`,
rotating entry code and gate check-in. `pnpm smoke` takes about 2 s on anvil and a replayed code is
refused.

## 14 September 2026

Resale from the ticket: list at or under the cap, delist or pass a free seat on, all relayed. Taking a
free listing is sponsored too. The sale clears the seller's door key and their old codes fail at the gate;
`pnpm smoke` covers the whole round trip with a second identity. Organiser page: publish an event from a
passkey (tiers, venue, resale rules; the deployment's gate key is granted on creation) and watch sold and
inside counts. The new room lights up in the city at once.

Deployed to Monad testnet from block 62 312 597 (`deployments/10143.json`, all three contracts verified on
MonadVision) with the two seed events. Sales stay open until 13 November 2026.

## 15 September 2026

Envio indexer (events, seats, fans, live feed, per-chain stats, minute throughput, handovers) deployed on
Envio Cloud: indexer `turnstile`, org `vaibhav0xq`, deployment branch `envio-deploy`, root
`packages/indexer`. On the development tier the endpoint id changes with each deployment, so the Envio
dashboard is the source of truth for the URL, not this file. It synced the factory's history from block
62 312 967 in under three minutes. The web app's Live layer reads it: organiser live board, city pulse,
attendance record and seat provenance, each with an "Envio · in sync" freshness chip that compares the
indexer's head with the relayer's. It says "unavailable" rather than inventing rows when the endpoint is
missing or behind.

Web and relayer live on the final domain <https://turnstile.work> (custom domain, Alchemy RPC with public
fallback, passports in Postgres, no environment label). The final-origin preflight passes 34 of 34 checks
(`www` is linked and lands on the apex). `pnpm smoke` runs the whole path there in 13.2 s. The developer
guided run (`pnpm --filter @turnstile/web run judge -- --base https://turnstile.work`) lands on a lit seat
in 45.9 s with 6 taps, 2 passkey prompts and three testnet transactions. Both seed events' `baseURI` were
re-pointed the same day with `script/SetBaseURI.s.sol` and `tokenURI` resolves to metadata whose
`image.svg` renders.

SPEC v1.3 and v1.4 add denser entry codes: `TS2:` (QR alphanumeric) then `TS3:` with an RFC 9285 base45
blob. The ticket QR drops from 57 to 49 to 41 modules. `TS1|` and `TS2:` still decode. Venue tiers are now
derived from the seat rows.

## 16 and 17 September 2026

Public website and copy pass. Phones start on the `min` quality tier and tiers only step down, which
removed the shader-compile freezes measured on a Redmi Note 11. The guided run is developer tooling only
and has no entry point in the product. The demo video is handled outside this repo. Device matrix rows beyond
the verified Android and Windows hybrid paths are optional confirmation, not a blocker.

## 18 September 2026

Submission cleanup. A public pulse page at `/pulse` reads totals, throughput, the latest activity, the
door feed and handovers from the hosted Envio indexer and shows the query it runs. The ticket tells the
holder when the door key is about to end, when it has expired and when the shown code is stale, each with
one action. The passport page explains what **Forget this device** clears and what a sign in restores. The
planning docs are marked as records and the README describes the sessions and the recovery path.
