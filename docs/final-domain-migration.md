# Final-domain migration — checklist

Staging runs at `https://turnstile-michellecox8789.replit.app` with `ENVIRONMENT_LABEL=staging`, and both
seed events' `baseURI` point at it. This is the ordered list for moving to the submission domain. Nothing in
it is done yet; **do not re-point `baseURI` until the final domain is chosen** — every switch is two testnet
transactions and a metadata cache to outlive.

Order matters: the new origin must serve metadata *before* the contracts point at it, and the smoke and
judge runs must pass *before* the README claims the domain.

## 0. Decide

- [x] Final origin chosen (14 Sep 2026, revised the same day): **`https://turnstile.work`** — `<final>` and
      `<apex>` below mean `turnstile.work`. (`turnstile.show` was the first pick and was dropped as too
      expensive for the MVP.) Backups if it is gone at checkout: `turnstile.club`, then `turnstile.one`; the
      runbook is identical, only the name changes. Canonical host `https://turnstile.work`, `www` → apex,
      RP ID = page hostname. Hosting stays option A (single Replit origin, Reserved VM through judging).
      **Bought and linked 15 Sep 2026** (Namecheap BasicDNS: A `34.111.179.208`, TXT `replit-verify=…` —
      keep the TXT for certificate renewals); Let's Encrypt certificate issued 09:55 UTC, `/api/health` 200.
      The domain is not bought or linked yet, so nothing below has run: no migration, no `baseURI` re-point,
      no final `PUBLIC_ORIGIN`; testing continues on the Replit staging URL.
- [ ] (Only if the plan changes back to the platform name.) Final origin `https://<final>`. A custom domain is the clean case. Keeping the `.replit.app`
      name is possible but the web labels *any* `*.replit.app` host `staging` on its own
      (`apps/web/src/lib/environment.ts`, a rule the tests cover) — drop that rule in the commit that declares
      the origin final, skip §1, and still set §2's `PUBLIC_ORIGIN`.
- [ ] Web and API stay same-origin (the relayer serves the built web from `STATIC_DIR`). Do not split them:
      passkeys are bound to the web origin and the API derives every absolute URL from `PUBLIC_ORIGIN`.

## 1. Domain (custom domain only)

- [x] Replit → Publishing → Settings → *Link a domain* → enter `<final>`; add the **A** and **TXT** records
      it prints at the registrar. The TXT record is permanent (certificate issuance and renewal).
- [x] Wait for the domain to verify (minutes usually; DNS can take up to 48 h). `curl -sI https://<final>/`
      must return `200` with a valid certificate before anything below.

## 2. Production environment

Set through the deployment's environment (the *Publishing* pane, production scope), then republish. **Done 15 Sep 2026
11:05 UTC** for `PUBLIC_ORIGIN`, `ENVIRONMENT_LABEL` (removed) and `VITE_SITE_URL`; `VITE_RP_ID` left unset; the
RPC rows and the `www` forward are still open (Alchemy keys, registrar):

| Variable | Set to | Why |
|----------|--------|-----|
| `PUBLIC_ORIGIN` | `https://<final>` (no trailing slash) | metadata `image` / `external_url`, ticket image links; the relayer refuses to trust `X-Forwarded-Host` |
| `ENVIRONMENT_LABEL` | **remove** | the STAGING chip and the tab-title prefix go away |
| `CORS_ORIGIN` | leave unset (`*`) — or `https://<final>` if you want it exact | same-origin web needs nothing; set it only if a second front-end origin appears |
| `VITE_SITE_URL` | `https://<final>` (bare origin) | canonical link, `og:url` and absolute `og:image` / `twitter:image` in the built `index.html`; unset, the image URLs stay relative and link previews stay blank |
| `VITE_RP_ID` | **leave unset** (revised 15 Sep) | the passkey RP ID defaults to the page hostname, which on the linked apex *is* `turnstile.work`; unset, the same build also keeps working on the `*.replit.app` hostname for rehearsals. Set it to the apex only if a subdomain must share credentials one day — a value that is not the page hostname or a registrable suffix of it breaks every passkey |
| `CHAIN_ID`, `EXPLORER_URL`, keys, `GATE_TOKEN`, `DATABASE_URL` | unchanged | |

- [ ] One canonical host: with `PUBLIC_ORIGIN=https://<apex>` the relayer already answers `www.<apex>` with a
      301 (308 for non-GET) to the same path on the apex, before static files or the API (`apps/relayer/src/
      canonical-host.ts`); add any other purchased alias (for example the backup domains, if bought) to
      `REDIRECT_HOSTS` as a comma-separated list. Check: `curl -sI https://www.<apex>/e/x` → `301` with
      `location: https://<apex>/e/x`. This keeps apex and `www` from growing separate passkey populations.
      **Caveat (found 15 Sep):** on the current Replit deployment the web is a static site served by the
      platform and only `/api/*` reaches the relayer (the asset headers prove it: lowercase charsets,
      `accept-ranges`), so the relayer's redirect covers API paths only. Page routes on `www` are the
      platform's business: link **only the apex** in Replit, and if `www` must resolve at all, use the
      registrar's URL forward (301 to `https://<apex>`) rather than a second linked host. `pnpm preflight`
      checks whatever answers on `www`.
- [x] RPC: `RPC_URL` = the Alchemy Monad testnet HTTPS URL (writes and reads), `RPC_FALLBACK_URLS` =
      `https://testnet-rpc.monad.xyz` (reads only fail over; transactions stay pinned to the primary),
      `PUBLIC_RPC_URL` = the browser-restricted Alchemy key, `PUBLIC_RPC_FALLBACK_URLS` = the public RPC.
      `/api/health` then reports `rpc.provider: "alchemy"` and the fallback host list.
      **Done 15 Sep 2026 11:29 UTC:** `RPC_URL` and `PUBLIC_RPC_URL` are Replit *Secrets* (the Alchemy URL carries the
      API key — never in files, never in this doc), the two fallback lists are plain production variables.
      `/api/health` → `rpc.provider: "alchemy"`, one fallback, `latencyMs` ~40; the browser RPC from `/api/config`
      answers `eth_blockNumber` with `access-control-allow-origin: https://turnstile.work`. Both variables hold the
      same key for now; if a domain allowlist is ever added on the Alchemy side, split into a server key and a
      browser key first (server calls carry no Origin header).
- [x] Republish. Watch the relayer boot log: no `PUBLIC_ORIGIN is not set` warning. (15 Sep: republished
      with the variables above; the rehearsal host serves the same build and now also answers without the label.)

## 3. Verify the origin

One command runs every check in this section (read-only, exit 1 on any failure) and prints what it saw:

```sh
pnpm preflight -- --origin https://<final> --final
```

`--final` additionally requires no environment label, `rpc.provider: "alchemy"` with a fallback, absolute
canonical / `og:url` / `og:image` (so `VITE_SITE_URL` was set at build time) and the `www` → apex redirect.
Without `--final` the same script checks staging (label allowed, platform hostname, relative OG). The manual
equivalents, for when something fails and you want to look at it. **15 Sep 2026 11:29 UTC, after the second republish (Alchemy RPC): 24 of 25 pass** — only `www` fails
(no registrar forward yet; optional). At 11:05 UTC, before the RPC rows, it was 22 of 25. `baseURI` may move
once §4 passes on `https://turnstile.work`.

- [x] `curl -s https://<final>/api/health` → `ok: true`, `chainId: 10143`.
- [x] `curl -s https://<final>/api/config | jq '.environmentLabel, .explorer'` → `null`, the explorer URL.
- [x] `https://<final>/` loads the city; no STAGING chip; the tab title is `Turnstile — access that follows
      you` with no `[staging]` prefix.
- [x] Metadata already answers on the new origin (nothing on-chain points here yet, that is fine):
      `curl -s https://<final>/api/events/1/tickets/1 | jq '.image, .external_url'` → both on `https://<final>`.
      Spoof check: `curl -s -H 'X-Forwarded-Host: evil.example' https://<final>/api/events/1/tickets/1 | jq .image`
      still on `https://<final>`.
- [x] `https://<final>/api/events/1/tickets/1/image.svg` renders (the footer reads `0x79a3…21B5 · 1 of 300`).

## 4. Smoke and judge path on the new origin

From `turnstile/` with foundry on `PATH`:

- [x] `pnpm smoke -- --relayer https://<final> --rpc https://testnet-rpc.monad.xyz`
      (needs a free seat on a free tier and a funded relayer; `--seed <word>` for a fresh dev identity).
      **Passed 15 Sep 2026 11:32 UTC** (`--seed final-1`): club · General Admission #4, 13.2 s end to end, no
      retries; buy `0x4be3e5…9602` (block 62 734 100, relayer 732 ms), bind `0x00382e…57c3`, listed
      `0x10fcba…eee9`, taken `0x528432…c025`, rebound `0xef9204…d8ec`, check-in `0x274ea4…dfb5` (relayer 710 ms).
- [x] `pnpm --filter @turnstile/web run judge -- --base https://<final>` → `finished — <n> s on the bar`,
      three hashes, `judge-*.png` frames in `apps/web/shots/`. This burns one front-row seat (a throwaway
      passkey holds it) — acceptable; do not run it a dozen times.
      **Passed 15 Sep 2026 11:33 UTC:** 45.9 s on the bar, 6 taps, 2 passkey prompts, club Row A · 14
      (token 14); mint 305 ms `0xf65af0…d318`, bind 720 ms `0x4e0d84…abf5`, admit 302 ms `0x3cbefd…a5fa`.
- [x] Open the frames: the bar top-right in the room, bottom-left at the door, followspot with nothing in the
      beam. (Checked on the 15 Sep frames — all three hold.)

Wallets after both runs (15 Sep 11:35 UTC): relayer 4.4859 → 4.2870 MON (7 relayed calls at the gas limit,
≈ 0.10 MON per full smoke + judge pair), gate signer 4.8898 → 4.8531 MON (2 check-ins), deployer unchanged
at 4.0681 MON.

## 5. Re-point `baseURI` (two transactions, deployer key)

Only after §3 and §4 pass. From `turnstile/packages/contracts`:

```sh
export PATH="$HOME/workspace/.config/.foundry/bin:$PATH"   # sandbox path; skip on your machine
BASE_URI=https://<final>/api/events/ EVENT_IDS=1,2 \
forge script script/SetBaseURI.s.sol --rpc-url monad_testnet --broadcast --slow \
  --private-key "$DEPLOYER_PRIVATE_KEY"        # or: --account deployer (keystore) on your machine
```

- [ ] `BASE_URI` ends in `/api/events/` **with** the trailing slash (the script asserts it); each event's
      URI becomes `<BASE_URI><eventId>/tickets/`.
- [ ] The broadcaster must hold `DEFAULT_ADMIN_ROLE` on both events (the deployer created them). Events it
      does not administer are skipped, not failed.
- [ ] Two `BaseURIUpdated` logs; note both tx hashes in `research/notes.md`.

Verify on-chain:

- [ ] `cast call 0x79a3e41Cbb8acd8c9A1A61a929bdBa302d3121B5 'tokenURI(uint256)(string)' 1 --rpc-url https://testnet-rpc.monad.xyz`
      → `https://<final>/api/events/1/tickets/1`.
- [ ] The theatre has no tokens, so read its storage instead: `baseURI` is slot 4 of `TurnstileEvent`
      (`cast storage 0x9c4b7a654680b5a4d382b22bdAA10FB05DC23029 4 --rpc-url …`; a long string lives at
      `keccak256(4)` — decode as in the staging notes) → `https://<final>/api/events/2/tickets/`.
- [ ] `curl -s "$(cast call <club> 'tokenURI(uint256)(string)' 1 --rpc-url …)" | jq .image` → the SVG on
      `https://<final>`; open it.

## 6. Repo and docs

- [ ] README: status paragraph (staging → final domain, date, the new judge-run numbers), the "Try it" link,
      the deployment table's origin.
- [ ] `docs/deploy-monad-testnet.md` §BASE_URI note: "re-pointed <date> to `<final>`".
- [ ] `research/notes.md`: the two `SetBaseURI` hashes and the judge-run numbers.
- [ ] Storyboard: record the video on `<final>` (label off); `docs/demo-video-storyboard.md` already assumes it.
- [ ] Gate (`pnpm verify`), commit as Vaibhav, push, CI green.

## 7. Afterwards

- [ ] Passkeys are per origin: the staging ones are dead on `<final>`; the front-row seats they hold on the
      club stay sold (chain state). Nothing to migrate.
- [ ] Staging can keep running (nothing points at it any more) or be unpublished. If it stays up, leave
      `ENVIRONMENT_LABEL=staging` on it so nobody mistakes it for the submission.
- [ ] The hosted indexer (Envio) reads the chain, not the origin — no change needed there
      (`docs/envio-hosted-handoff.md`).
- [ ] Any further web or relayer change needs a republish to reach `<final>`; the judge-run frames are the
      cheapest regression check after each one.
