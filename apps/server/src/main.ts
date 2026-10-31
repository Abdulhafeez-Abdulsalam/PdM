/**
 * Starts the PdM server. `npm start` (from the repository root) builds the web app and runs this,
 * serving the app and the API together; `npm run dev:server` runs the API alone and restarts when a
 * file changes. Settings come from environment variables: see config.ts.
 */
import { LIVE_FLUSH_INTERVAL_MS } from "@pdm/contracts";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { buildServer } from "./app";
import { loadConfig } from "./config";
import { openDatabase } from "./db";
import { openPlant } from "./plant";
import { AttemptLimiter } from "./security";

/** How long a clean stop may take before the process ends anyway. */
const STOP_TIMEOUT_MS = 10_000;

const config = loadConfig();
mkdirSync(dirname(config.dbFile), { recursive: true });
const db = openDatabase(config.dbFile);
// Rebuild the plant: the same simulation, with every change people made, made again (ADR-0015).
const started = performance.now();
const { backend, store, replayed, keptSeed } = openPlant(db, { seed: config.seed });

// The plant moves on by itself once a second, as it does in the browser's worker (the storyline
// advances, alarms are raised and cleared), and every connected browser hears about it.
const app = buildServer({
  backend,
  db,
  tickMs: LIVE_FLUSH_INTERVAL_MS,
  webDist: config.webDist,
  cookieSecure: config.cookieSecure,
  signInLimiter: new AttemptLimiter(config.signInAttemptsPerMinute, 60_000),
  // Structured logs: one JSON line per event, easy for log tools to search. Cookies never appear.
  logger: { level: config.logLevel, redact: ["req.headers.cookie", 'res.headers["set-cookie"]'] },
});
app.log.info({ dbFile: config.dbFile, replayed, ms: Math.round(performance.now() - started) }, "Plant rebuilt from the database");
if (keptSeed !== null) app.log.warn(`This database belongs to the plant with seed ${keptSeed}, so SEED=${config.seed} is ignored`);
app.log.info(config.webDist ? { webDist: config.webDist } : {}, config.webDist ? "Serving the web app" : "API only (no built web app)");
if (config.host !== "127.0.0.1" && config.host !== "localhost") {
  app.log.warn(`Listening on ${config.host}: other computers can reach this server. It has demo sign-in only.`);
}

/**
 * A clean stop (Ctrl+C, or a service manager asking): stop taking requests, let those in progress
 * finish, close the live connections, note where the clock got to, close the database. If that
 * takes too long, end anyway.
 */
let stopping = false;
const stop = async (signal: string) => {
  if (stopping) return;
  stopping = true;
  app.log.info({ signal }, "Stopping");
  setTimeout(() => {
    app.log.error("Didn't stop in time; ending now");
    process.exit(1);
  }, STOP_TIMEOUT_MS).unref();
  await app.close();
  store.saveClock(backend.now());
  db.close();
  process.exit(0);
};
process.once("SIGINT", () => void stop("SIGINT"));
process.once("SIGTERM", () => void stop("SIGTERM"));

await app.listen({ port: config.port, host: config.host });
