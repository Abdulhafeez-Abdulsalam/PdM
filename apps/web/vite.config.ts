import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    // Server mode (`npm run dev:connected`): pass API calls on to the PdM server, so the page and
    // the API share one address. Unused in demo mode, which never calls /api.
    proxy: { "/api": "http://127.0.0.1:4000" },
  },
  worker: { format: "es" },
  // MapLibre starts its own tile-processing worker from a file next to itself. Vite's
  // dependency pre-bundling moves the code and breaks that path, so leave MapLibre as-is.
  optimizeDeps: { exclude: ["maplibre-gl"] },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // e2e/ holds Playwright tests, which run in a real browser with `npm run e2e`.
    exclude: [...configDefaults.exclude, "e2e/**"],
    // Whole-journey tests compile lazily-loaded pages on first use; allow time for that. 45 s since
    // Phase 4 chunk 4: run alone, the slowest tests take 5–10 s, but with 30 test files sharing a
    // laptop's CPU in `npm run check` a few went just past the old 20 s now and then.
    testTimeout: 45_000,
    // `npm run check` runs typecheck, lint and every package's tests at once; leave CPU for them
    // so these heavier tests don't time out on a laptop.
    maxWorkers: "50%",
  },
});
