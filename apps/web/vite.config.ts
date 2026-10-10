import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, strictPort: true },
  worker: { format: "es" },
  // MapLibre starts its own tile-processing worker from a file next to itself. Vite's
  // dependency pre-bundling moves the code and breaks that path, so leave MapLibre as-is.
  optimizeDeps: { exclude: ["maplibre-gl"] },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // Whole-journey tests compile lazily-loaded pages on first use; allow time for that.
    testTimeout: 20_000,
  },
});
