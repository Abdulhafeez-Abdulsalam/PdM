/**
 * The server's database (Phase 5 chunk 4, ADR-0015): one SQLite file, opened with Node's built-in
 * node:sqlite (no native add-on to compile).
 *
 * Its tables are built and changed by **migrations**: numbered SQL files in ../migrations, applied
 * in order, each exactly once. Which ones have run is recorded in the database itself, so opening an
 * older file brings it up to date, and every copy of the database ends up with the same tables.
 * A migration that has been committed is never edited; a change is a new, higher-numbered file.
 */
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const MIGRATIONS = new URL("../migrations/", import.meta.url);

/** Open (or create) the database at `file` (":memory:" for one that lives only as long as the process). */
export function openDatabase(file: string): DatabaseSync {
  const db = new DatabaseSync(file);
  // Write-ahead logging: readers don't wait for a writer, and a crash mid-write loses nothing committed.
  if (file !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
}

/** The migration files, in order: "001-command-log-and-sessions.sql" → id 1. */
export function migrationFiles(): { id: number; name: string }[] {
  return readdirSync(MIGRATIONS)
    .filter((name) => /^\d{3}-[a-z0-9-]+\.sql$/.test(name))
    .map((name) => ({ id: Number(name.slice(0, 3)), name }))
    .sort((a, b) => a.id - b.id);
}

function migrate(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  ) STRICT`);
  const applied = new Set((db.prepare("SELECT id FROM schema_migrations").all() as { id: number }[]).map((r) => r.id));
  for (const { id, name } of migrationFiles()) {
    if (applied.has(id)) continue;
    // All of a migration, or none of it: a half-built table would be worse than none.
    db.exec("BEGIN");
    try {
      db.exec(readFileSync(new URL(name, MIGRATIONS), "utf8"));
      db.prepare("INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)").run(id, name, new Date().toISOString());
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw new Error(`Migration ${name} failed: ${(error as Error).message}`);
    }
  }
}
