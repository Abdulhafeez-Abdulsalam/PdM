-- The server's first tables (Phase 5 chunk 4, ADR-0015).
--
-- The plant itself isn't stored: it's rebuilt from its seed and start time (in `plant`), and
-- then every change people made (in `commands`) is made again, in order. So this is all it
-- takes to bring back every work order, permit, note, limit, role change and audit entry.

-- Which simulated plant this database belongs to, and where its clock had got to.
CREATE TABLE plant (
  id INTEGER PRIMARY KEY CHECK (id = 1), -- only ever one row
  seed INTEGER NOT NULL,
  start_sim_ms INTEGER NOT NULL,
  clock_sim_ms INTEGER NOT NULL
) STRICT;

-- Every change, oldest first: the command log.
CREATE TABLE commands (
  seq INTEGER PRIMARY KEY,         -- the order they happened in
  at_sim_ms INTEGER NOT NULL,      -- the simulated time of the change
  ticked_at_sim_ms INTEGER NOT NULL, -- the simulated time of the tick before it
  at TEXT NOT NULL,                -- the real time, for people reading the table
  user_id TEXT,                    -- who made it
  kind TEXT NOT NULL CHECK (kind IN ('request', 'control')),
  name TEXT NOT NULL,              -- the endpoint, or the control (set_speed…)
  command TEXT NOT NULL            -- the whole change, as JSON
) STRICT;

-- Who is signed in. Only a fingerprint (SHA-256) of each token is kept, so a copy of this file
-- can't be used to sign in as anyone.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  last_seen_ms INTEGER NOT NULL
) STRICT;
