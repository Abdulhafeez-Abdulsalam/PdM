# ADR-0015: SQLite, a command log, and replay on restart

- **Status:** Accepted
- **Date:** 2026-10-31

## Context
Until chunk 4 of [Phase 5](../phase-5-plan.md), everything people did on the server (work orders, acknowledged alarms, permits, limits, role changes, sessions) lived in memory and vanished on restart. The plant itself is a simulation: the same seed and start time give the same assets, readings and faults. SQLite was chosen with the user (one file, nothing to install; PostgreSQL was weighed and left for later).

The simulation keeps people's work in a dozen in-memory stores. Giving each its own tables would mean writing and keeping in step a dozen pieces of saving-and-loading code.

## Options considered
1. **A table per kind of thing** (work_orders, permits, notes…): the usual design, but a large rewrite of the simulation's stores, and each new feature needs its own tables.
2. **Saving a snapshot** of the whole simulation now and then: simple to describe, but the stores hold maps, closures and derived caches that don't serialise cleanly, and a crash loses everything since the last snapshot.
3. **A command log**: store every change in order (who, what, when), and on restart rebuild the simulation from its seed and make each change again. A simple cousin of *event sourcing*. Every store becomes persistent at once, and new features need nothing extra.

For the database driver: **Node's built-in `node:sqlite`** (no native add-on to compile at install time; "Stability: 1.2 – Release candidate" since Node 24.15) or `better-sqlite3` (mature, but a native module with an install script).

## Decision
- **A command log**, in SQLite, through `node:sqlite`. One file, `apps/server/data/pdm.sqlite` by default (`DB_FILE` to change it; the folder is ignored by git). Write-ahead logging (WAL) is on, so a crash loses nothing that was committed.
- **Migrations**: numbered SQL files in `apps/server/migrations`, applied in order at start-up, each exactly once, inside a transaction; which have run is recorded in a `schema_migrations` table. A committed migration is never edited.
- **Three tables** (migration 001): `plant` (the seed, the start time, and where the clock got to, saved every 10 ticks and on a clean stop), `commands` (the log: the simulated time of each change and of the tick before it, who, what, and the whole change as JSON), and `sessions`.
- **Only changes are logged**: requests that change something (one shared definition, `changesThings` in the contracts) and the simulation controls (speed, chaos, storyline). Reads aren't, including the two long reads sent as POST, which until now were wrongly written to the audit log too.
- **Replay** (`MockBackend.replay`): for each logged change, move the plant to the tick before it, then make the change at its own simulated time, as the person who made it. Then carry the clock on from where it stopped. If a change ever fails to replay, the server refuses to start rather than run a plant that isn't what people left.
- **The audit log and role changes aren't stored separately**: they're rebuilt by replay, so they can't disagree with the log. (The plan listed tables for people and the audit log; with a command log they would be second copies.)
- **Sessions are stored as fingerprints** (SHA-256 of the token), so a copy of the database can't be used to sign in.
- **The simulation had to become truly repeatable.** Testing replay showed the alarm engine gave different alarms depending on how often it was ticked (293, 146 or 141 alarms for the same six simulated hours). It now always moves on one simulated minute at a time, in a fixed order, so ticking once a second, at any speed, or in one jump all give exactly the same alarms (tested). An alarm now appears at the first whole simulated minute after it happens; its time stays exact.

## Consequences
- Stop the server, start it again: every work order, permit, note, limit, role change, audit entry and session is back, and the clock carries on. Tested with a real database file and a real restart, and by hand with a forced stop.
- Start-up takes longer the further the simulated clock has run: replay moves the plant through every simulated minute. **Measured in the [Phase 5 review](../phase-5-review.md)**, it grows faster than that: 0.7 s after 1 simulated day, 6.9 s after 7, 99 s after 30, because the alarm list only ever grows and each minute scans it. *Fixed after the review:* the alarm engine now keeps small indexes instead of scanning every alarm, and works out each fault's limit crossings once; restarts cost a steady 0.8–0.9 s per simulated day (27 s after 30 days, 49 s after 60), with exactly the same alarms (see [learning note 44](../learning/44-making-it-scale-without-changing-it.md)). Snapshots would make restarts nearly instant whatever the plant's age.
- The database belongs to one plant: its seed is stored, and a different `SEED` is ignored with a warning. Delete the file to start afresh.
- Moving to PostgreSQL later changes `db.ts`, `plant.ts` and `sessions.ts`, not the app.
- `node:sqlite` is a release candidate, not yet "stable"; its API could still change in a later Node version.
