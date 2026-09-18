import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

// The relayer runs on :8787 in development; the app talks to it through same-origin /api so the
// production build can sit behind the same host (or set VITE_API_URL to a separate origin).
//
// Behind a proxied preview (Replit, tunnels) the dev server is reached under another host name:
// set VITE_ALLOWED_HOSTS=all, or to a comma-separated list of host names, to let those through.
const allowedHostsEnv = process.env["VITE_ALLOWED_HOSTS"];
const allowedHosts =
  allowedHostsEnv === undefined
    ? {}
    : { allowedHosts: allowedHostsEnv === "all" || allowedHostsEnv.split(",").filter(Boolean) };

/**
 * Public origin for the canonical / Open Graph URLs in index.html. Read through Vite's own env loading so
 * `.env.production` and the process environment both work. Empty — the default until the domain is live —
 * keeps the image URLs relative and omits canonical + og:url, so a rehearsal host is never baked into a
 * build (a relative canonical would be worse than none).
 */
function siteOrigin(mode: string): string {
  const raw = loadEnv(mode, process.cwd(), "VITE_")["VITE_SITE_URL"]?.trim() ?? "";
  if (!raw) return "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`VITE_SITE_URL must be an absolute origin such as https://example.com, got "${raw}"`);
  }
  if (!/^https?:$/.test(url.protocol) || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`VITE_SITE_URL must be a bare http(s) origin with no path, got "${raw}"`);
  }
  return url.origin;
}

/**
 * One canonical host, enforced by the page itself. Passkeys are scoped to the host, so an app reachable as
 * both `<apex>` and `www.<apex>` would grow two passkey populations. The relayer redirects `www` for `/api/*`
 * (`apps/relayer/src/canonical-host.ts`), but on the published origin page routes are served by the
 * platform's static hosting and never reach it — so the first bytes of the page send `www` to the apex,
 * before any stylesheet, module or credential. Only `www.<apex>` is an alias here (the relayer's
 * `REDIRECT_HOSTS` extras are API-only); every other host — localhost, the dev origin, the platform
 * hostname — is left alone. `pnpm preflight` looks for the `data-canonical-host` marker on `www`.
 */
function canonicalHostScript(site: string): string {
  const apex = new URL(site).hostname.toLowerCase();
  return (
    `(function(){if(location.hostname.toLowerCase()===${JSON.stringify(`www.${apex}`)})` +
    `location.replace(${JSON.stringify(site)}+location.pathname+location.search+location.hash)})()`
  );
}

/** `%SITE_URL%` in index.html, plus canonical + og:url and the `www` → apex script only when there is a real public origin. */
function siteMeta(site: string): Plugin {
  return {
    name: "turnstile:site-meta",
    transformIndexHtml: {
      // Before Vite's own env substitution and asset pass, so `%SITE_URL%/og.jpg` is a plain URL by then.
      order: "pre",
      handler: (html) => ({
        html: html.replaceAll("%SITE_URL%", site),
        tags: site
          ? [
              {
                tag: "script",
                attrs: { "data-canonical-host": new URL(site).hostname.toLowerCase() },
                children: canonicalHostScript(site),
                injectTo: "head-prepend",
              },
              { tag: "link", attrs: { rel: "canonical", href: `${site}/` }, injectTo: "head" },
              { tag: "meta", attrs: { property: "og:url", content: `${site}/` }, injectTo: "head" },
            ]
          : [],
      }),
    },
  };
}

/**
 * A `modulepreload` for the scene chunk. The app imports the scene lazily so the shell paints while the three
 * stack downloads, which also means the browser only hears of that chunk once the shell has run: in production
 * the two downloads ran strictly one after the other. The hint starts the scene with the page instead.
 *
 * Added by a small script placed after the stylesheet rather than as a plain link tag: a classic script waits
 * for the stylesheets before it, so the scene's bytes only start once the page can paint. The host shares the
 * connection evenly between streams, and measured with a plain tag the 44 KB stylesheet arrived after both
 * megabyte chunks, holding the boot veil back by a second. Low fetch priority for the servers that honour it.
 * (Tailwind scans this file too: keep utility names such as the word for in-page scripts out of the comment.)
 */
function scenePreload(): Plugin {
  let base = "/";
  return {
    name: "turnstile:scene-preload",
    apply: "build",
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: "post",
      handler: (_html, ctx) => {
        const scene = Object.values(ctx.bundle ?? {}).find(
          (out) => out.type === "chunk" && out.facadeModuleId?.endsWith("/src/scene/World.tsx"),
        );
        if (!scene) throw new Error("scene-preload: no chunk for src/scene/World.tsx in the bundle");
        const href = JSON.stringify(`${base}${scene.fileName}`);
        return [
          {
            tag: "script",
            attrs: { "data-scene-preload": scene.fileName },
            children:
              `(function(){var l=document.createElement("link");l.rel="modulepreload";l.href=${href};` +
              `l.crossOrigin="";l.fetchPriority="low";document.head.appendChild(l)})()`,
            injectTo: "head",
          },
        ];
      },
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), siteMeta(siteOrigin(mode)), scenePreload()],
  server: {
    ...allowedHosts,
    proxy: { "/api": { target: process.env["RELAYER_URL"] ?? "http://127.0.0.1:8787", changeOrigin: true } },
  },
  preview: {
    proxy: { "/api": { target: process.env["RELAYER_URL"] ?? "http://127.0.0.1:8787", changeOrigin: true } },
  },
  optimizeDeps: {
    // Keep the dev pre-bundle small enough for low-memory machines (1 CPU / 1.5 GB sandboxes):
    // these are pure ESM and are served straight from node_modules in development.
    exclude: ["three", "viem", "postprocessing"],
  },
  build: {
    target: "es2023",
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
}));
