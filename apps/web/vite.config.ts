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

/** `%SITE_URL%` in index.html, plus canonical + og:url only when there is a real public origin. */
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
              { tag: "link", attrs: { rel: "canonical", href: `${site}/` }, injectTo: "head" },
              { tag: "meta", attrs: { property: "og:url", content: `${site}/` }, injectTo: "head" },
            ]
          : [],
      }),
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), siteMeta(siteOrigin(mode))],
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
