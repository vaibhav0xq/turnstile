import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The relayer runs on :8787 in development; the app talks to it through same-origin /api so the
// production build can sit behind the same host (or set VITE_API_URL to a separate origin).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
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
});
