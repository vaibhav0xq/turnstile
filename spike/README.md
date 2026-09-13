# Turnstile · Mera passkey spike (throwaway)

Single-page, client-only proof of the Turnstile passkey design on `@category-labs/mera@0.2.0`:
one passkey → account namespace (EVM account) · presence namespace (per-event door key that signs an
EIP-712 `Entry`) · vault namespace (AES-256-GCM private passport) · second-device / stateless reconstruction.

```bash
npm install
node build.mjs      # bundles src/main.js into dist/index.html (self-contained, no CDN)
node verify.mjs     # headless Chromium + virtual PRF authenticator, 17 checks
```

Real devices need HTTPS and a shared hostname (rpId). Quickest stable options: GitHub Pages
(`dist/index.html` → `index.html` in a `turnstile-spike` repo) or Netlify Drop of `dist/`.
Fastest: `npx serve dist -l 3000` + `cloudflared tunnel --url http://localhost:3000` (hostname changes per run — finish the matrix in one sitting).

Record results in `../docs/device-matrix.md`; requirements and blockers are in `../docs/mera-spike-report.md`.

## Ceremony modes (steps 3 and 5)

`discoverable` (default) — no `allowCredentials`; the app verifies the *same* passkey answered by comparing credential ids.
`id` — `allowCredentials: [{ id }]`, what the app has after a discoverable sign-in (assertions carry no transports).
`id+transports` — `allowCredentials: [{ id, transports }]` with transports from creation, from device A's link (`t=`), or `["internal","hybrid"]`.

**Probe all 3 modes** in step 5 runs the vault namespace in each mode (three prompts) and records pass/fail, WebAuthn error name (`cause.name`) and elapsed ms per mode in the JSON under `namespaces.vault`. Every failure now carries `ms` and `cause` — `NotAllowedError` in under a second with no sheet means the browser could not match the credential id; several seconds means a cancel inside the sheet.

The verification link / stateless hash now also carries `c=<credentialId>` and `t=<transports>` (public identifiers; the discoverable path never reads them).
