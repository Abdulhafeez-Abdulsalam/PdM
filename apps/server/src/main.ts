/**
 * Starts the PdM server: `npm run dev:server` (restarts when a file changes) or
 * `npm run start:server`. Settings come from environment variables:
 *   PORT  where to listen (default 4000); only this computer can connect (127.0.0.1)
 *   SEED  which simulated plant (default 20261010, the same as demo mode)
 */
import { LIVE_FLUSH_INTERVAL_MS } from "@pdm/contracts";
import { createMockBackend } from "@pdm/mock-data";
import { buildServer } from "./app";

const port = Number(process.env.PORT ?? 4000);
const seed = Number(process.env.SEED ?? 20261010);

const backend = createMockBackend({ seed });
// The plant moves on by itself once a second, as it does in the browser's worker (the storyline
// advances, alarms are raised and cleared), and every connected browser hears about it.
const app = buildServer({ backend, logger: true, tickMs: LIVE_FLUSH_INTERVAL_MS });
await app.listen({ port, host: "127.0.0.1" });
