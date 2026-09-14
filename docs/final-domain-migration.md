# Final-domain migration — checklist

Staging runs at `https://turnstile-michellecox8789.replit.app` with `ENVIRONMENT_LABEL=staging`, and both
seed events' `baseURI` point at it. This is the ordered list for moving to the submission domain. Nothing in
it is done yet; **do not re-point `baseURI` until the final domain is chosen** — every switch is two testnet
transactions and a metadata cache to outlive.

Order matters: the new origin must serve metadata *before* the contracts point at it, and the smoke and
judge runs must pass *before* the README claims the domain.

## 0. Decide

- [ ] Final origin chosen: `https://<final>`. A custom domain is the clean case. Keeping the `.replit.app`
      name is possible but the web labels *any* `*.replit.app` host `staging` on its own
      (`apps/web/src/lib/environment.ts`, a rule the tests cover) — drop that rule in the commit that declares
      the origin final, skip §1, and still set §2's `PUBLIC_ORIGIN`.
- [ ] Web and API stay same-origin (the relayer serves the built web from `STATIC_DIR`). Do not split them:
      passkeys are bound to the web origin and the API derives every absolute URL from `PUBLIC_ORIGIN`.

## 1. Domain (custom domain only)

- [ ] Replit → Publishing → Settings → *Link a domain* → enter `<final>`; add the **A** and **TXT** records
      it prints at the registrar. The TXT record is permanent (certificate issuance and renewal).
- [ ] Wait for the domain to verify (minutes usually; DNS can take up to 48 h). `curl -sI https://<final>/`
      must return `200` with a valid certificate before anything below.

## 2. Production environment

Set through the deployment's environment (the *Publishing* pane, production scope), then republish:

| Variable | Set to | Why |
|----------|--------|-----|
| `PUBLIC_ORIGIN` | `https://<final>` (no trailing slash) | metadata `image` / `external_url`, ticket image links; the relayer refuses to trust `X-Forwarded-Host` |
| `ENVIRONMENT_LABEL` | **remove** | the STAGING chip and the tab-title prefix go away |
| `CORS_ORIGIN` | leave unset (`*`) — or `https://<final>` if you want it exact | same-origin web needs nothing; set it only if a second front-end origin appears |
| `VITE_RP_ID` | leave unset | web hostname is the RP ID; setting it wrongly breaks every passkey |
| `CHAIN_ID`, `EXPLORER_URL`, keys, `GATE_TOKEN`, `DATABASE_URL` | unchanged | |

- [ ] Republish. Watch the relayer boot log: no `PUBLIC_ORIGIN is not set` warning.

## 3. Verify the origin

- [ ] `curl -s https://<final>/api/health` → `ok: true`, `chainId: 10143`.
- [ ] `curl -s https://<final>/api/config | jq '.environmentLabel, .explorer'` → `null`, the explorer URL.
- [ ] `https://<final>/` loads the city; no STAGING chip; tab title is plain `Turnstile`.
- [ ] Metadata already answers on the new origin (nothing on-chain points here yet, that is fine):
      `curl -s https://<final>/api/events/1/tickets/1 | jq '.image, .external_url'` → both on `https://<final>`.
      Spoof check: `curl -s -H 'X-Forwarded-Host: evil.example' https://<final>/api/events/1/tickets/1 | jq .image`
      still on `https://<final>`.
- [ ] `https://<final>/api/events/1/tickets/1/image.svg` renders (the footer reads `0x79a3…21B5 · 1 of 300`).

## 4. Smoke and judge path on the new origin

From `turnstile/` with foundry on `PATH`:

- [ ] `pnpm smoke -- --relayer https://<final> --rpc https://testnet-rpc.monad.xyz`
      (needs a free seat on a free tier and a funded relayer; `--seed <word>` for a fresh dev identity).
- [ ] `pnpm --filter @turnstile/web run judge -- --base https://<final>` → `finished — <n> s on the bar`,
      three hashes, `judge-*.png` frames in `apps/web/shots/`. This burns one front-row seat (a throwaway
      passkey holds it) — acceptable; do not run it a dozen times.
- [ ] Open the frames: the bar top-right in the room, bottom-left at the door, followspot with nothing in the
      beam.

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
