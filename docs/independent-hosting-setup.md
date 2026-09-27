# Production-only hosting plan (not deployed)

This is the current **production-only plan** for moving the Turnstile React/Vite frontend and relayer off Replit. Chain ID is **10143 (Monad testnet)**, with canonical origin `https://turnstile.work`. The earlier two-environment proposal in `independent-hosting-review.md` is a historical audit, not the active plan. No staging provider resources or staging credentials are to be used. This document is **preparation only**: do not connect GitHub, deploy, create domains or DNS records, create database tables or passkeys, fund wallets, send transactions or grant roles without separate approval.

## Intended services (not deployed)

- **Vercel:** one production frontend project for `turnstile.work`, from `vaibhav0xq/turnstile`, repository root `.`, Node 24 and pnpm 10.26.1. Use `main` as the production branch only after checking the remote matches the prepared source. The checked-in `vercel.json` installs with `pnpm install --frozen-lockfile`, builds via `pnpm --filter @turnstile/web build`, serves `apps/web/dist`, and routes production `/api/*` to `https://api.turnstile.work/api/*` on the same browser origin. `www.turnstile.work` redirects to the apex. Set public `VITE_SITE_URL` for the production build and `VITE_ENVIO_GRAPHQL_URL` only after verifying a current production endpoint. Leave `VITE_API_URL` and `VITE_RP_ID` unset. GitHub import can deploy automatically: do not connect it without separate deployment approval. Do not create passkeys on a preview domain.
- **Railway:** the owner's new project `turnstile-production` has one empty, staged service `turnstile-relayer-production` in the production environment. The owner reports entering 11 variables; their values have not been read or independently verified. Do not apply pending changes, connect GitHub or deploy. Later, repository root `.` and `railway.json` configure Railpack, one replica, no sleep, no overlap, 120-second drain, and `/api/health` startup check. Never modify an unrelated Railway account or project.
- **Supabase:** use only the owner's existing `turnstile` project for production Postgres. Its **session-mode pooler on port 5432** has been saved securely by the owner; do not request or copy its URI into chat. The production relayer needs it as `DATABASE_URL`. A session-level advisory lock requires a stable database session: validate this pooler under the real hosting connection before wallet writes. Never use the transaction-mode pooler. Do not create a second database.
- **Envio:** one production indexer sourced from `vaibhav0xq/turnstile`, project root `packages/indexer`, config path `config.yaml`, name `turnstile`. Use `main` only after verifying the remote contains this prepared configuration. The checked-in chain is 10143, start block 62312572, and factory `0x5C6e597E96cBDf408537611554E2a53Da75042B2`. Its chain section is generated from the contracts deployment JSON; do not hand-edit it. Hosted deployment is not approved, so there is no verified durable production GraphQL endpoint yet. Before using one in Vercel, confirm HTTPS browser POST/CORS from `https://turnstile.work`, expected schema including `chain_metadata`, sync progress, and the provider's endpoint retention policy. Do not reuse the historical development-tier URL without independent verification.
- **Alchemy:** `Turnstile Production Server` supplies Railway `RPC_URL`; `Turnstile Production Browser` supplies Railway `PUBLIC_RPC_URL` and is restricted to `turnstile.work`. Do not use the older `Turnstile` app, `Turnstile Staging Browser`, or the rotated-out exposed key. Do not create or delete Alchemy apps.
- **Domains, later only:** `api.turnstile.work` must resolve with Railway-managed HTTPS before the production Vercel rewrite can work. Provider-issued Namecheap records for the apex, `www` and API are not known yet. Do not create domains or change DNS now.
- The backend takes a session-scoped Postgres advisory lock per chain, checks that connection immediately before each wallet send, and exits if another process owns it or if the connection is lost. A Railway rollout must stop/drain the existing writer **before** starting the replacement. Even with one replica and zero configured overlap, check the actual provider lifecycle; a zero-downtime overlapping rollout will fail closed while the old writer owns the lock. A connection could still fail in the interval between its last check and an RPC send: the lock is a defense, **not a substitute for a stop-first rollout, nonce reconciliation or independent transaction review**. Check pending/ambiguous RPC sends and the wallet nonce before reopening writes. No automatic transaction resend.
- This is still a testnet-only application. Do not allow a second active process to use the same production role-bearing wallets.

## Postgres preparation

The existing application schema is `apps/relayer/db/schema.sql`, limited to encrypted passport blobs and monotonic timestamps. **Do not create its tables yet.** Before any schema setup or import, decide whether a verified old passport backup exists, approve a backup/restore plan, and verify the Supabase connection and session-level lock in an isolated, non-writing check. `pnpm --filter @turnstile/relayer db:setup` **writes the schema and is not approved**. The read-only `db:check` reports missing schema until the table exists. Hosted relayers fail startup if `DATABASE_URL` is absent or the table is missing. Never substitute this workspace's database URL for the owner's Supabase connection.

## Variable matrix

The owner reports 11 Railway variables entered directly into the production service; their values have not been independently verified. Vercel values remain proposed, not saved. Enter any missing value only in the matching provider's secure variable UI, never in this repository, Replit, or chat. The workspace's GitHub fine-grained token is for source access only. Never put a wallet key, DB URL, private Alchemy URL or gate token in Vite `VITE_*` variables.

| Name | Production value/source | Dashboard placement |
| --- | --- | --- |
| `HOSTING_MODE` | `production` | Railway project `turnstile-production` → service `turnstile-relayer-production` → Variables |
| `CHAIN_ID` | `10143` | Railway relayer Variables; existing testnet deployment JSON only |
| `PUBLIC_ORIGIN` | `https://turnstile.work` | Railway relayer Variables; metadata/image URLs |
| `CORS_ORIGIN` | `https://turnstile.work` | Railway relayer Variables; exact browser origin, not `*` |
| `DATABASE_URL` | Owner's saved Supabase `turnstile` session-mode pooler URI, port 5432 | Railway relayer secure Variables; never the Supabase API/anon/service-role key |
| `RPC_URL` | Full URL from `Turnstile Production Server` | Railway relayer secure Variables; server-only primary for sends |
| `PUBLIC_RPC_URL` | Different full URL from `Turnstile Production Browser` | Railway relayer Variables; exposed via `/api/config`, with browser-domain restriction |
| `RELAYER_PRIVATE_KEY` | Owner-controlled production relayer EOA; no special on-chain role | Railway relayer secure Variables; never in chat |
| `GATE_SIGNER_PRIVATE_KEY` | Owner-controlled production gate EOA; verify `GATE_ROLE` on each applicable event | Railway relayer secure Variables; never in chat |
| `GATE_TOKEN` | Owner-controlled operator-only token | Railway relayer secure Variables; never bundle into public JS |
| `TRUSTED_PROXY_HOPS` | Measure at production ingress; not known yet | Railway relayer Variables; test `/api/ip` and forged headers before traffic |
| `DRIP_ENABLED` | `0` | Railway relayer Variables; automated funding off |
| `VITE_SITE_URL` | `https://turnstile.work` | Vercel production project → Settings → Environment Variables |
| `VITE_ENVIO_GRAPHQL_URL` | Verified production Envio endpoint, once available | Vercel production project → Settings → Environment Variables; public build-time URL |
| `PORT` | Railway-provided | Railway runtime; do not hardcode |

Leave `DEPLOYMENTS_FILE` (uses checked-in `10143.json`), `STATIC_DIR`, `ENVIRONMENT_LABEL`, `VITE_RP_ID` (hostname-derived) and `VITE_API_URL` (same-origin `/api`) unset. Review optional `RPC_FALLBACK_URLS` and `PUBLIC_RPC_FALLBACK_URLS` for **reads/receipts only**, as well as `EXPLORER_URL`, spend ceilings (`RELAY_*`, `GATE_*`, `DRIP_*`), reserve floors (`RELAYER_RESERVE_WEI`, `GATE_RESERVE_WEI`) and queue caps (`TX_QUEUE_MAX`, `TX_QUEUE_MAX_WAIT_MS`) before use. `.env.example` defaults are not a funding or policy decision. Vercel builds require `VITE_SITE_URL`; passkey ceremonies reject `.vercel.app`. The approved future passkey origin/RP ID is `https://turnstile.work` / `turnstile.work`; existing credentials depend on the authenticator's Mera PRF support. No passkeys are approved now.

## Offline validation (no transactions or deployments)

From repository root:

```sh
pnpm install --frozen-lockfile
pnpm hosting:check
pnpm test:hosting
VITE_SITE_URL=https://turnstile.work pnpm --filter @turnstile/web build
node scripts/hosting-check.mjs --dist production
```

The configuration check rejects legacy staging rewrites, but passing local checks does not certify provider settings, real ingress, or a production deployment. After secure variables are independently verified at the providers, `node scripts/hosting-check.mjs --env production` can check required variable **names** in a securely scoped environment; it does not print values. After separately approved schema creation, run read-only `db:check` against the correct Supabase database. After a separately approved deployment and DNS/TLS setup, run `pnpm preflight -- --origin https://turnstile.work`, compare `/api/ip` with forged forwarding headers, read `/api/health`, inspect metadata/SVG and refresh nested web routes. Do not run `pnpm smoke`, the guided judge flow or any check-in without separate transaction approval.

## Explicit production blockers

Before production, independently verify official hackathon eligibility of testnet **10143** versus mainnet **143**; authoritative DNS for `turnstile.work`; owner control of wallet keys, existing on-chain roles, nonce and funding; the two selected Alchemy production keys; the production Envio GraphQL endpoint; Supabase TLS, session-pooler advisory-lock behavior, backup/restore and possible old passport recovery; exact trusted proxy chain and single-writer rollout; and a complete canonical-domain passkey/API check. `www` and apex must not create separate passkey populations. No contract address/base URI change, wallet funding, role grant or deployment is authorized by this plan.