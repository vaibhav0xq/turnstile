#!/usr/bin/env node
// Low-memory static build: Tailwind CLI + esbuild, ~150 MB peak instead of Vite's ~1 GB.
//
// `pnpm build` (Vite) is the real production build. This one exists so the app can be smoke-tested
// and screenshotted on machines where Vite's bundler cannot get enough RAM (a 1.5 GB sandbox, a
// small CI runner). Output goes to dist-lite/; serve it with `node scripts/serve-lite.mjs`.
//
//   VITE_RP_ID=localhost VITE_API_URL= node scripts/build-lite.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import * as esbuild from "esbuild";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "dist-lite");
const assets = path.join(out, "assets");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(assets, { recursive: true });

// 1. Tailwind → plain CSS with the @imports inlined.
const twOut = path.join(assets, "tw.css");
execFileSync(
  path.join(root, "node_modules/.bin/tailwindcss"),
  ["-i", path.join(root, "src/styles.css"), "-o", twOut, "--minify"],
  { cwd: root, stdio: "inherit" },
);
const twCss = fs.readFileSync(twOut, "utf8");
fs.rmSync(twOut);
// url()s of imported font files are rebased either to the output or to the input file; detect which.
const firstUrl = /url\(["']?([^"')]+)["']?\)/.exec(twCss)?.[1];
const resolveDir =
  firstUrl && !/^(data:|https?:|\/)/.test(firstUrl) && fs.existsSync(path.resolve(assets, firstUrl))
    ? assets
    : path.join(root, "src");

// 2. esbuild bundle; the raw styles.css import is swapped for the compiled sheet.
const dev = process.env["BUILD_DEV"] === "1"; // keeps the dev-only identity switcher for smoke tests
const env = {
  DEV: dev,
  PROD: !dev,
  MODE: dev ? "development" : "production",
  VITE_RP_ID: process.env["VITE_RP_ID"] ?? "localhost",
  VITE_API_URL: process.env["VITE_API_URL"] ?? "",
};
const result = await esbuild.build({
  entryPoints: { main: path.join(root, "src/main.tsx") },
  bundle: true,
  format: "esm",
  splitting: true,
  platform: "browser",
  target: "es2023",
  outdir: assets,
  publicPath: "/assets",
  minify: true,
  sourcemap: false,
  jsx: "automatic",
  legalComments: "none",
  logLevel: "warning",
  metafile: true,
  define: { "import.meta.env": JSON.stringify(env), "process.env.NODE_ENV": '"production"' },
  loader: {
    ".woff2": "file",
    ".woff": "file",
    ".ttf": "file",
    ".wasm": "file",
    ".svg": "file",
    ".png": "file",
    ".jpg": "file",
    ".glsl": "text",
  },
  plugins: [
    {
      name: "tailwind-precompiled",
      setup(build) {
        build.onLoad({ filter: /[\\/]src[\\/]styles\.css$/ }, () => ({
          contents: twCss,
          loader: "css",
          resolveDir,
        }));
      },
    },
  ],
});

// 3. index.html + public/.
const html = fs
  .readFileSync(path.join(root, "index.html"), "utf8")
  .replace(
    '<script type="module" src="/src/main.tsx"></script>',
    '<link rel="stylesheet" href="/assets/main.css" />\n    <script type="module" src="/assets/main.js"></script>',
  );
fs.writeFileSync(path.join(out, "index.html"), html);
fs.cpSync(path.join(root, "public"), out, { recursive: true });

const total = Object.values(result.metafile.outputs).reduce((sum, o) => sum + o.bytes, 0);
console.log(
  `[build-lite] ${Object.keys(result.metafile.outputs).length} files, ${(total / 1024).toFixed(0)} KB → ${path.relative(process.cwd(), out)}`,
);
