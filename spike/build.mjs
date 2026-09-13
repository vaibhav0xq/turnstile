// Bundles src/main.js with esbuild and inlines it into a single self-contained dist/index.html.
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const result = await build({
  entryPoints: ["src/main.js"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022", "safari17", "chrome120"],
  minify: true,
  write: false,
  legalComments: "none",
  logLevel: "warning",
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const html = readFileSync("src/index.html", "utf8").replace("<!--APP-->", () => js);
mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.html", html);
writeFileSync("dist/spike.js", js);
console.log(`dist/index.html ${(html.length / 1024).toFixed(1)} KB (bundle ${(js.length / 1024).toFixed(1)} KB)`);
