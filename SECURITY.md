# Security

Turnstile is a hackathon build. It runs on Monad testnet only and has not been audited. Do not deploy the
contracts or the relayer against real value.

## Supported branch

Only `main` is supported. There are no tagged releases. Fixes land on `main` and the live site is
republished from it.

## Testnet only

The live site <https://turnstile.work> runs against Monad testnet (chain ID `10143`). Seats are free or
priced in testnet MON. The relayer sponsors free seats within fixed budgets and stores passports as
ciphertext only. Do not put real funds, real secrets or personal data you care about into the demo.

## Reporting a problem

- Low-risk findings (copy, UX, a bug with no security impact): open a GitHub issue at
  <https://github.com/vaibhav0xq/turnstile/issues>.
- Anything exploitable (relayer spend, gate bypass, key derivation, resale rules, passport privacy): send a
  direct message on X to <https://x.com/vaibhav_0xq> instead of a public issue. Expect a reply within a
  few days.
- Never put private keys, seed phrases, passkey material, RPC keys, session secrets or `.env` contents in
  an issue, a pull request or a message. Redact wallet addresses and transaction hashes if they identify a
  wallet you still use.

## In scope

- `packages/contracts`: `TurnstileFactory`, `TurnstileEvent`, the ERC-2771 forwarder path, resale caps,
  door key binding and check-in replay protection.
- `packages/identity`: key derivation from the passkey PRF output, the EIP-712 `Entry` and `BindDoorKey`
  formats and the vault format.
- `apps/relayer`: sponsorship limits, gate verification, passport storage and proxy trust.
- `apps/web`: passkey ceremonies, entry code handling and the gate page.

## Safeguards already in place

- Reserve floors per relayer wallet, rolling hourly and daily budgets per action class and a daily quota
  per address.
- A bounded per-wallet transaction queue with sequential sends and a single relayer instance.
- Per-IP limits keyed on the proxy-written `X-Forwarded-For` hop, not on client-supplied headers.
- One canonical host for passkeys. Aliases redirect to the apex before anything is served.
- The door key is never funded. Entry codes rotate every 30 seconds and are consumed once on-chain.
- Production doors require an operator token. The demo door on the live site is open on purpose.
