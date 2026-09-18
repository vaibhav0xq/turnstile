# Monad Metropolis submission

Copy for the submission form. Submissions open 22 September 2026 and close 14 October 2026, 09:29 IST.
Each block is written to be pasted as it is; shorten from the end if a field has a limit.

## Project

- **Name:** Turnstile
- **Tagline:** Identity-bound tickets on Monad. One passkey, every door in the city.
- **Track:** 03, Social, Attention and Culture
- **Live app:** <https://turnstile.work>
- **Code:** <https://github.com/vaibhav0xq/turnstile>
- **Demo video:** <https://github.com/vaibhav0xq/turnstile/releases/download/demo-2026-09-18/turnstile-demo.mp4> (1 min 44 s)
- **Chain:** Monad testnet, chain ID 10143
- **Team:** Vaibhav (`vaibhav0xq`), solo

## Short description (under 100 words)

Turnstile is ticketing and door access where the ticket is bound to the person who bought it. A passkey
creates the account, buys the seat, derives a door key for the event and encrypts a private passport, with
no wallet app and no seed phrase. Tickets are ERC-721 seats in a per-event contract on Monad. The entry
code is signed by the door key, rotates every 30 seconds and is consumed on-chain once at the door. Resale
is capped by the organiser and clears the seller's door key, so a screenshot or a forwarded code admits
nobody.

## What it does

Every event is a contract deployed from a factory. The city view is the contract list rendered as a
skyline; every lit building is a night that is on sale. Inside a venue the seats are picked in 3D and the
tiers are derived from the rows.

The path a visitor takes, measured against the live deployment:

1. One passkey prompt creates the account and opens a 15-minute session. The seat is minted to the
   account and the relayer pays the gas.
2. A second prompt binds a door key that only works for this event. The ticket shows an entry code that
   re-signs itself every 30 seconds.
3. At the door the gate recovers the signer from the code, checks it against the key bound on-chain and
   submits the check-in from its own wallet. The seat lights up in the room and the city pulse records the
   entry.

Six taps, two prompts, three transactions, under a minute end to end on the guided run. Resale at or under
the organiser's cap, splits to the organiser, a private passport (notes encrypted under a key only the
passkey can derive) and an organiser board are all in the deployed app.

## Demo video

<https://github.com/vaibhav0xq/turnstile/releases/download/demo-2026-09-18/turnstile-demo.mp4>

1 min 44 s, 1920x1080, 30 fps. Captured from the live deployment on 18 September 2026 with the guided run
in judge mode. Nothing in the run is staged or sped up. The transactions shown landed on Monad testnet during
the take:

- Mint: <https://testnet.monadexplorer.com/tx/0x41af1a57644b25a2a9a556158dcbb0709153020ee5e51409338c084dd566f82f>
- Door key bound: <https://testnet.monadexplorer.com/tx/0x5e70e7f4769faacc426b55430fc30e1adbb0a719e34c1182602299c59d841d45>
- Check-in: <https://testnet.monadexplorer.com/tx/0x92043de63d03c1a23833712248669d050207b8b672c3dc7d811bd128127b7d67>
- Event contract: <https://testnet.monadexplorer.com/address/0x7CD7BCB4A8DFdbfd4769868E9F1DCA04818c87e8>

Description for the video page, if one is needed:

> Turnstile: identity-bound tickets on Monad. One passkey creates the account, buys the seat and derives a
> door key for the event. The entry code re-signs every 30 seconds and is consumed on-chain once at the door.
> Recorded against the live deployment on Monad testnet. Live app: https://turnstile.work. Code:
> https://github.com/vaibhav0xq/turnstile.

## Why a passkey and not a wallet

A wallet ties the ticket to whoever holds the key, which is exactly what scalpers and screenshot forwards
rely on. A passkey ties the ticket to a person and a device family and cannot be exported. The WebAuthn PRF
extension gives two deterministic secrets from one biometric: an account namespace (the secp256k1 account
that buys and lists) and a presence namespace (the per-event door key, never funded). Nothing has to be
stored in the browser. Clearing the profile and signing in again restores the same account, seats and vault
on any device that syncs the passkey.

## How it is built

- **Contracts:** Solidity with Foundry. A factory deploys one ERC-721 event contract per night with
  tiers, a resale cap, splits and door-key binding. Check-in is a single consumed slot per seat. Verified
  on the Monad testnet explorer.
- **Identity:** WebAuthn passkeys with the PRF extension. Account session 15 minutes, door-key session
  one hour. Entry codes are EIP-712 signatures over 30-second slots. Sessions expire on purpose and the UI
  says what the next step is.
- **Relayer:** a small Node service that sponsors gas for free tiers with exact per-charge reservations,
  verifies entry codes at the door and submits the check-in from its own wallet. Same origin as the app,
  under `/api`.
- **Indexing:** Envio HyperIndex. The city pulse, seat history, passports and the organiser board read
  from the indexer, with an in-sync chip that reports freshness.
- **RPC:** Alchemy for Monad testnet, with the public RPC as a fallback.
- **Front end:** React, Vite, Three.js through React Three Fiber. The city and the rooms are one scene
  with quality tiers, so a phone gets the same paths as a laptop.
- **Testing:** Foundry tests with gas snapshots, unit tests for the identity package with published
  vectors, node tests for the relayer and the web app and a headless judge run (real WebAuthn through a
  virtual authenticator) against the deployed origin that prints the timings quoted above.

## Bounties

- **Envio:** the indexer is the read path for the pulse, the passports, seat history and the organiser
  board. Hosted on Envio Cloud.
- **Alchemy:** Monad testnet RPC for the app and the relayer.
- **Mera, UX:** no wallet, no app, no seed phrase. Two prompts from the city to a lit seat.
- **Mera, one passkey many keys:** one PRF secret, two namespaces, one account key and a per-event door key
  that is bound on-chain and cleared on resale.

## Honest limits

Testnet only, not audited. PRF support decides which passkey providers work; the app checks and says so
instead of failing quietly. The verified device matrix is in `docs/device-matrix.md`.
