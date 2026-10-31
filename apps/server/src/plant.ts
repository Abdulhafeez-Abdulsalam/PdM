/**
 * Keeping the plant across restarts (Phase 5 chunk 4, ADR-0015).
 *
 * The simulation is deterministic: the same seed and start time give the same plant, and the
 * same changes made at the same simulated moments give the same result. So the database keeps
 * only those (the **command log**), and starting the server rebuilds everything: a fresh
 * simulation, every logged change made again in order, and the clock carried on from where it
 * stopped. Work orders, permits, notes, limits, role changes and the audit log all come back,
 * without a table for each.
 */
import { createMockBackend, type Command, type LoggedCommand, type MockBackend } from "@pdm/mock-data";
import type { DatabaseSync } from "node:sqlite";

export interface PlantRecord {
  seed: number;
  startSimMs: number;
  clockSimMs: number;
}

export class PlantStore {
  constructor(private readonly db: DatabaseSync) {}

  read(): PlantRecord | null {
    const row = this.db.prepare("SELECT seed, start_sim_ms, clock_sim_ms FROM plant WHERE id = 1").get() as
      { seed: number; start_sim_ms: number; clock_sim_ms: number } | undefined;
    return row ? { seed: row.seed, startSimMs: row.start_sim_ms, clockSimMs: row.clock_sim_ms } : null;
  }

  create(seed: number, startSimMs: number): void {
    this.db.prepare("INSERT INTO plant (id, seed, start_sim_ms, clock_sim_ms) VALUES (1, ?, ?, ?)").run(seed, startSimMs, startSimMs);
  }

  /** Where the clock has got to, so a restart carries on from there. */
  saveClock(simMs: number): void {
    this.db.prepare("UPDATE plant SET clock_sim_ms = ? WHERE id = 1").run(Math.round(simMs));
  }

  /** Add one change to the end of the log. `userId`: who made it (the request's own, or who moved a control). */
  append({ command, at, tickedAt }: LoggedCommand, userId: string | null): void {
    this.db
      .prepare("INSERT INTO commands (at_sim_ms, ticked_at_sim_ms, at, user_id, kind, name, command) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(
        Math.round(at),
        Math.round(tickedAt),
        new Date().toISOString(),
        command.kind === "request" ? command.userId : userId,
        command.kind,
        command.kind === "request" ? command.name : command.control.type,
        JSON.stringify(command),
      );
  }

  commands(): LoggedCommand[] {
    const rows = this.db.prepare("SELECT at_sim_ms, ticked_at_sim_ms, command FROM commands ORDER BY seq").all() as {
      at_sim_ms: number;
      ticked_at_sim_ms: number;
      command: string;
    }[];
    return rows.map((r) => ({ command: JSON.parse(r.command) as Command, at: r.at_sim_ms, tickedAt: r.ticked_at_sim_ms }));
  }
}

export interface OpenedPlant {
  backend: MockBackend;
  store: PlantStore;
  /** How many logged changes were made again. */
  replayed: number;
  /** The seed the database was made with, when it differs from the one asked for. */
  keptSeed: number | null;
}

/**
 * The plant this database belongs to: a new one (seed, starting now) for a new database, or the
 * stored one rebuilt by replaying its log.
 */
export function openPlant(db: DatabaseSync, { seed, realNow = Date.now }: { seed: number; realNow?: () => number }): OpenedPlant {
  const store = new PlantStore(db);
  let record = store.read();
  if (!record) {
    store.create(seed, realNow());
    record = store.read()!;
  }
  const backend = createMockBackend({ seed: record.seed, startTime: record.startSimMs, realNow });
  const log = store.commands();
  log.forEach((entry, i) => {
    try {
      backend.replay(entry);
    } catch (error) {
      // Should never happen (the same changes on the same plant can't fail differently), so stop
      // rather than carry on with a plant that isn't what people left.
      throw new Error(`Replaying change ${i + 1} of ${log.length} failed: ${(error as Error).message}`);
    }
  });
  // Carry on from the latest moment we know of (a change can be newer than the last saved clock).
  const lastChange = log.at(-1)?.at ?? record.startSimMs;
  backend.clock.jumpTo(Math.max(record.clockSimMs, lastChange));
  backend.tick();
  return { backend, store, replayed: log.length, keptSeed: record.seed === seed ? null : record.seed };
}
