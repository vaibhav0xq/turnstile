# Contributing

Turnstile is a solo hackathon build. Issues and small, focused pull requests are welcome.

## Setup

Node 24 or newer, pnpm 10 (`corepack enable`) and Foundry 1.8 or newer for `packages/contracts`.

```
pnpm install
cd packages/contracts && forge soldeer install && cd ../..
```

The root README covers running the product on a local chain.

## Before you open a pull request

Run `pnpm verify` from the root. It installs with a frozen lockfile, lints with biome, typechecks, runs the
node tests and the identity vector check, builds every package and runs the contracts' own check
(`forge fmt --check`, `forge lint`, build, tests and the gas snapshot). CI runs the same steps on pushes
to `main` and on every pull request, so a change that fails locally will fail there too.

## Conventions

- Formatting and lint rules come from `biome.json` and `forge fmt`. Do not hand-format.
- A change to `packages/identity/SPEC.md` needs regenerated vectors (`pnpm vectors`) and the matching
  Foundry vector tests.
- Read addresses from `packages/contracts/deployments/<chainId>.json`. Do not copy them into code or docs.
- Never commit `.env` files, keys or wallets. `.env.example` files hold variable names only.
- Keep copy short and plain. No hype, no long dashes as punctuation and no comma before "and" or "or".
