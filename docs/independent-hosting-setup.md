# Independent hosting configuration (not deployed)

This configuration keeps the existing Turnstile React/Vite frontend and API paths while moving hosting off Replit. It is **preparation only**. Do not connect a domain, publish either service, fund a wallet, run transaction-spending smoke tests or make a contract change without separate approval. See `independent-hosting-review.md` for the audit and outstanding blockers.

## Services and isolation

- Create **separate** Vercel projects (or strictly isolated deployments) for the canonical site `turnstile.work` and controlled staging site `staging.turnstile.work`. Both use repository root as project root, Node 24 and pnpm 10.26.1. `vercel.json` builds `apps/web/dist` with the existing web build. Its host-specific rules keep `/api/*` same-origin to the matching persistent Railway backend; SPA fallback applies only on the two named hosts. Preview domains intentionally have no API route and must never be used to create production passkeys. `www.turnstile.work` redirects to the apex before the app starts. Do not configure an API rewrite to the wrong environment.
- Create separate Railway relayer services and **separate managed Postgres databases** for staging and production. Railway must use repository root and `railway.json` as config-as-code for the relayer (Railpack, one replica, never sleep, no overlap, 120-second drain, `/api/health` startup check). Put Postgres in the same region as its corresponding relayer. Use the service's database variable reference for `DATABASE_URL`, not a committed connection string. No SQLite, ephemeral file or memory passport store is acceptable in hosted modes.
- Backend public hostnames reserved by `vercel.json` are `api.staging.turnstile.work` and `api.turnstile.work`. They are configuration targets, **not existing DNS or services**. Railway must have HTTPS/certificates on these hosts before the corresponding Vercel route can work. Do not set DNS now.
- The backend takes a session-scoped Postgres advisory lock per chain, checks that connection immediately before each wallet send, and exits if another process owns it or if the connection is lost. A Railway rollout must stop/drain the existing writer **before** starting the replacement. Even with one replica and zero configured overlap, check the actual provider lifecycle; a zero-downtime overlapping rollout will fail closed while the old writer owns the lock. A connection could still fail in the interval between its last check and an RPC send: the lock is a defense, **not a substitute for a stop-first rollout, nonce reconciliation or independent transaction review**. Check pending/ambiguous RPC sends and the wallet nonce before reopening writes. No automatic transaction resend.
- This is still a testnet-only application. The lock prevents two hosted processes using the *same database* from sharing the writer role. Staging must also have **different role-bearing wallets and database** from production. Never give two independent services the same wallet keys merely because they use different databases.

## Postgres preparation

The existing schema is `apps/relayer/db/schema.sql`, limited to encrypted passport blobs and their monotonic timestamps. Do not create the database in this workspace or substitute the workspace-provided `DATABASE_URL`. Before touching any old database, the owner must decide whether a verified old passport backup exists and whether it is to be imported. On a **new, isolated staging** database only, after provider setup and review, run `pnpm --filter @turnstile/relayer db:setup` once in the approved Railway environment. That command **writes the schema**; do not run it against production or the old DB by accident. `pnpm --filter @turnstile/relayer db:check` is read-only and checks required columns without printing records or the URL. Hosted relayers fail startup if `DATABASE_URL` is absent or the table is missing. Configure automatic backups and prove a restore on staging before production use.

## Variable matrix

Set values in **each target provider's secure variable UI**, not this repository or a Replit deployment. The current workspace's GitHub fine-grained token is for source access only and must not be copied to any service. Do not put a wallet key, DB URL, private Alchemy URL or gate token in Vite `VITE_*` variables.

| Name | Staging | Production | Scope |
| --- | --- | --- | --- |
| `HOSTING_MODE` | `staging` | `production` | Railway relayer; enables fail-closed hosted checks and database writer lock |
| `CHAIN_ID` | `10143` | `10143` | Railway; the existing testnet deployment JSON only |
| `DEPLOYMENTS_FILE` | leave unset to use checked-in `10143.json` | same | Railway; never guess/change contract addresses |
| `PUBLIC_ORIGIN` | `https://staging.turnstile.work` | `https://turnstile.work` | Railway; absolute ticket metadata/image URLs |
| `CORS_ORIGIN` | `https://staging.turnstile.work` | `https://turnstile.work` | Railway; exact browser origin, not `*` |
| `DATABASE_URL` | staging Postgres service reference | separate production Postgres service reference | Railway secret; no file fallback |
| `RPC_URL` | fresh private Alchemy testnet URL | separate production private Alchemy testnet URL | Railway secret; transactions stay on this primary |
| `RPC_FALLBACK_URLS` | approved testnet public read fallback | approved testnet public read fallback | Railway; read/receipt fallback, not send fallback |
| `PUBLIC_RPC_URL` | separately restricted browser-facing Alchemy URL | separately restricted browser-facing URL | Railway value exposed in `/api/config`; never reuse server-only secret |
| `PUBLIC_RPC_FALLBACK_URLS` | approved public read fallback | approved public read fallback | Railway, exposed to browsers |
| `RELAYER_PRIVATE_KEY` | distinct funded staging role wallet | owner-controlled production role wallet | Railway secret, never share between environments |
| `GATE_SIGNER_PRIVATE_KEY` | distinct staging GATE_ROLE wallet | owner-controlled production GATE_ROLE wallet | Railway secret; verify on-chain role before use |
| `GATE_TOKEN` | operator-only staging token | operator-only production token | Railway secret; never bundle into JS; gate UI prompts operator |
| `TRUSTED_PROXY_HOPS` | measured at staging ingress | measured independently at production ingress | Railway; test `/api/ip` and forged headers before enabling real traffic |
| `DRIP_ENABLED` | `0` | `0` | Railway; no automated wallet funding |
| `STATIC_DIR` | unset | unset | Railway; only Vercel serves the static web |
| `ENVIRONMENT_LABEL` | `staging` | unset | Railway; visible safety label on staging |
| `VITE_SITE_URL` | `https://staging.turnstile.work` | `https://turnstile.work` | Vercel build-time, canonical/OG links and `www` script |
| `VITE_RP_ID` | unset (hostname-derived) | unset (hostname-derived) | Vercel build-time; do not share staging and production RP IDs |
| `VITE_API_URL` | unset (same-origin `/api`) | unset (same-origin `/api`) | Vercel build-time; never point the web app directly at Railway |
| `VITE_ENVIO_GRAPHQL_URL` | verified staging/indexer endpoint | verified production endpoint | Vercel build-time public URL; fresh Envio Cloud project required |
| `PORT` | Railway-provided | Railway-provided | Railway service listener; do not hardcode |

`EXPLORER_URL`, spend ceilings (`RELAY_*`, `GATE_*`, `DRIP_*`), reserve floors (`RELAYER_RESERVE_WEI`, `GATE_RESERVE_WEI`) and queue caps (`TX_QUEUE_MAX`, `TX_QUEUE_MAX_WAIT_MS`) must be reviewed for each environment. Defaults in `apps/relayer/.env.example` are not a funding or policy decision. Vercel builds fail without an explicit `VITE_SITE_URL`; passkey ceremonies reject `.vercel.app` and any host other than that approved site origin. Production passkey origin remains `https://turnstile.work` with RP ID `turnstile.work`; a restored canonical domain can use existing credentials only when the user's authenticator supports Mera PRF. Staging passkeys belong to `staging.turnstile.work` and do not stand in for production. Before treating staging as isolated, an operator must compare **derived wallet addresses** and database service identities across providers without exporting private keys, and verify both pairs differ.

## Offline validation (no transactions or deployments)

From repository root:

```sh
pnpm install --frozen-lockfile
pnpm hosting:check
pnpm test:hosting
VITE_SITE_URL=https://staging.turnstile.work pnpm --filter @turnstile/web build
node scripts/hosting-check.mjs --dist staging
```

The first checks validate route isolation, single-replica config and schema location; the dist check confirms staging canonical tags and that the build does not contain a production canonical origin. Before any future staging deployment, populate secrets **in staging providers only** and run `node scripts/hosting-check.mjs --env staging` in a securely scoped environment; it reports missing variable **names only**, not values. Run the read-only `db:check` against the correct managed DB. Once a staging site actually exists, run `pnpm preflight -- --origin https://staging.turnstile.work`, compare `/api/ip` with forged forwarding headers, read `/api/health`, inspect metadata/SVG and verify a refresh of nested web routes. Do not run `pnpm smoke`, the guided judge flow or any browser check-in without separate transaction approval.

## Explicit production blockers

Before production, independently verify official hackathon eligibility of testnet **10143** versus mainnet **143**; current authoritative DNS for `turnstile.work`; owner control of wallet keys, on-chain roles, nonce and funding; fresh Alchemy key scopes; live Envio Cloud GraphQL deployment; the managed DB choice, backups and possible old passport recovery; exact trusted proxy chain and single-writer rollout; and a complete canonical-domain passkey/API check. `www` and apex must not create separate passkey populations. Do not alter contract addresses or base URIs under this preparation.