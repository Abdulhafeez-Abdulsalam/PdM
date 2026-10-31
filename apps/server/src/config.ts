/**
 * The server's settings (Phase 5 chunk 6, ADR-0017), from environment variables, checked once at
 * start-up: a wrong setting stops the server with a message saying which and why, rather than
 * surfacing later as something odd. Nothing secret lives here yet; when it does (a model's API
 * key), it comes from the environment too, never from a file in git.
 *
 *   PORT           where to listen (default 4000)
 *   HOST           which network address to listen on (default 127.0.0.1: this computer only)
 *   SEED           which simulated plant, for a new database (default 20261010)
 *   DB_FILE        the database file (default apps/server/data/pdm.sqlite)
 *   WEB_DIST       the built web app to serve (default apps/web/dist-server, if it has been built)
 *   LOG_LEVEL      fatal | error | warn | info | debug | trace | silent (default info)
 *   COOKIE_SECURE  "true" behind HTTPS, so the session cookie is never sent over plain HTTP (default false)
 *   SIGN_IN_ATTEMPTS_PER_MINUTE  from one address (default 10; the browser tests sign in more often)
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const DEFAULT_WEB_DIST = here("../../web/dist-server");

const Env = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  HOST: z.string().min(1).default("127.0.0.1"),
  SEED: z.coerce.number().int().default(20261010),
  DB_FILE: z.string().min(1).default(here("../data/pdm.sqlite")),
  WEB_DIST: z.string().min(1).optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false"),
  SIGN_IN_ATTEMPTS_PER_MINUTE: z.coerce.number().int().min(1).default(10),
});

export interface Config {
  port: number;
  host: string;
  seed: number;
  dbFile: string;
  /** null: no built app to serve (API only, e.g. with the Vite dev server in front). */
  webDist: string | null;
  logLevel: z.infer<typeof Env>["LOG_LEVEL"];
  cookieSecure: boolean;
  signInAttemptsPerMinute: number;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`The server's settings aren't right:\n${problems}`);
  }
  const e = parsed.data;
  if (e.WEB_DIST !== undefined && !existsSync(e.WEB_DIST)) throw new Error(`WEB_DIST: no built app at ${e.WEB_DIST}`);
  return {
    port: e.PORT,
    host: e.HOST,
    seed: e.SEED,
    dbFile: e.DB_FILE,
    webDist: e.WEB_DIST ?? (existsSync(DEFAULT_WEB_DIST) ? DEFAULT_WEB_DIST : null),
    logLevel: e.LOG_LEVEL,
    cookieSecure: e.COOKIE_SECURE === "true",
    signInAttemptsPerMinute: e.SIGN_IN_ATTEMPTS_PER_MINUTE,
  };
}
