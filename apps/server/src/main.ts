/**
 * Starts the PdM server: `npm run dev:server` (restarts when a file changes) or
 * `npm run start:server`. Settings come from environment variables:
 *   PORT     where to listen (default 4000); only this computer can connect (127.0.0.1)
 *   SEED     which simulated plant, for a new database (default 20261010, the same as demo mode)
 *   DB_FILE  the database file (default apps/server/data/pdm.sqlite). Delete it to start afresh.
 */
import { LIVE_FLUSH_INTERVAL_MS } from "@pdm/contracts";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildServer } from "./app";
import { openDatabase } from "./db";
import { openPlant } from "./plant";

const port = Number(process.env.PORT ?? 4000);
const seed = Number(process.env.SEED ?? 20261010);
const dbFile = process.env.DB_FILE ?? fileURLToPath(new URL("../data/pdm.sqlite", import.meta.url));

mkdirSync(dirname(dbFile), { recursive: true });
const db = openDatabase(dbFile);
// Rebuild the plant: the same simulation, with every change people made, made again (ADR-0015).
const started = performance.now();
const { backend, store, replayed, keptSeed } = openPlant(db, { seed });

// The plant moves on by itself once a second, as it does in the browser's worker (the storyline
// advances, alarms are raised and cleared), and every connected browser hears about it.
const app = buildServer({ backend, db, logger: true, tickMs: LIVE_FLUSH_INTERVAL_MS });
app.log.info(`Database ${dbFile}: replayed ${replayed} changes in ${Math.round(performance.now() - started)} ms`);
if (keptSeed !== null) app.log.warn(`This database belongs to the plant with seed ${keptSeed}, so SEED=${seed} is ignored`);

// Stopping (Ctrl+C, or the dev server restarting): note where the clock got to, and close the file cleanly.
const stop = async () => {
  await app.close();
  store.saveClock(backend.now());
  db.close();
  process.exit(0);
};
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());

await app.listen({ port, host: "127.0.0.1" });
