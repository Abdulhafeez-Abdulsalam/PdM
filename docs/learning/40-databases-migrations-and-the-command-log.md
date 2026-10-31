# Learning note 40: Databases, migrations, and a command log

*This note goes with Phase 5 chunk 4. Run `npm run dev:server` and `npm run dev:connected`, sign in, change something (raise a work order, edit a limit), then stop the server with Ctrl+C and start it again.*

## 1. Why a database

A program's variables live in memory, and memory is wiped when the program stops. Until now, every work order you raised on the server disappeared on restart. A **database** keeps data in a file on disk, safely: it won't be left half-written if the power goes, and many readers and writers can use it at once.

**SQLite** is a whole database in one file (`apps/server/data/pdm.sqlite`). There's no separate database server to install or run. Node has it built in (`node:sqlite`). You talk to it in **SQL**: `CREATE TABLE` to make a table, `INSERT` to add a row, `SELECT` to read, `UPDATE` and `DELETE` to change.

## 2. Migrations: changing tables safely

Tables change as an app grows: a new column, a new table. You can't just edit the `CREATE TABLE` line, because existing databases (yours, a colleague's, production's) were made with the old one. Instead, each change is a **migration**: a numbered SQL file (`001-command-log-and-sessions.sql`, then `002-…`), applied in order, once. The database records which have run (a `schema_migrations` table), so opening an old file brings it up to date automatically.

Two rules: a migration runs **all or nothing** (inside a transaction), and once committed it is **never edited**. A fix is a new, higher-numbered migration.

## 3. The command log: keeping what happened, not what is

The usual design is a table per thing: `work_orders`, `permits`, `notes`… Each needs saving and loading code. We have a dozen kinds of thing, so we did something smaller.

Our plant is a **deterministic** simulation: the same seed and start time always give the same plant. So we store only **what people did**, in order, with when and who: the **command log**. When the server starts, it builds the plant from its seed and **replays** every command at the simulated moment it first happened. Everything comes back: work orders, permits, limits, role changes, even the audit log, which replay rebuilds too.

This is a simple cousin of **event sourcing**, used by banks, accounting systems and version control (a Git repository is a log of commits). Nice side effects: a perfect history of who changed what, and no second copy that could disagree with it.

## 4. Deterministic means *really* deterministic

Replay only works if doing the same things gives the same result. Testing it found a surprise: the alarm engine gave **different alarms** depending on how often the plant was ticked. Six simulated hours gave 293 alarms ticked every minute, 146 ticked every hour, and 141 in one jump, because the order it handled events in depended on the size of the step.

The fix: the engine always moves on **one simulated minute at a time, in a fixed order**, however big the jump. Now any way of getting there gives exactly the same alarms, and a test checks it. That's the general lesson: a property you rely on ("same input, same output") deserves a test that would fail if it broke.

## 5. Keeping secrets out of the file

Sessions are in the database now, so a restart signs nobody out. But a database file can be copied (a backup, a laptop left unlocked). So the session token itself is never stored, only its **fingerprint** (a SHA-256 hash). A hash can't be turned back into the token, so the copy is useless for signing in. Passwords are kept the same way, with a slower hash made for that purpose.

## 6. Exercises

1. Raise a work order in server mode, stop the server (Ctrl+C) and start it again. Is it still there? Look in the server's log for "replayed … changes".
2. Open the database with any SQLite viewer (or `node -e` with `node:sqlite`) and run `SELECT seq, name, user_id FROM commands`. What do you see? Can you find your session token in `sessions`?
3. Why must a migration never be edited once it's committed? What would happen to a database that already ran the old version?
4. Delete `apps/server/data` and start the server. What happens, and why is that a clean way to "reset the demo"?
