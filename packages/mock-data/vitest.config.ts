import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Some tests run the simulation for days (the demo storyline). That takes about half a
    // second alone, but `npm run check` runs every package's tests at once, and on a busy
    // laptop it once took nearly 6 s, just over Vitest's 5 s default. Allow more.
    testTimeout: 20_000,
  },
});
