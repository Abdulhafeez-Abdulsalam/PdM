/**
 * Who is signed in (Phase 5 chunk 3, ADR-0014). A session is a long random token: the browser
 * keeps it in a cookie, and only the server knows whose it is. Guessing one is hopeless (32 random
 * bytes), and the page's own code can't read the cookie (HttpOnly), so a script slipped into the
 * page can't steal it either.
 *
 * Sessions are kept in the database (chunk 4, ADR-0015), so restarting the server signs nobody
 * out. Only a fingerprint (SHA-256) of each token is stored: whoever gets a copy of the database
 * file still can't sign in as anyone, because the fingerprint can't be turned back into the token.
 */
import { createHash, randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export const SESSION_COOKIE = "pdm_session";
/** Signed out after this long without a request: about a shift. */
export const SESSION_IDLE_MS = 8 * 60 * 60 * 1000;

export interface Session {
  token: string;
  userId: string;
  lastSeen: number;
}

const fingerprint = (token: string) => createHash("sha256").update(token).digest("hex");

export class SessionStore {
  constructor(
    private readonly db: DatabaseSync,
    private readonly now: () => number = Date.now,
  ) {}

  create(userId: string): Session {
    const session = { token: randomBytes(32).toString("base64url"), userId, lastSeen: this.now() };
    this.db
      .prepare("INSERT INTO sessions (token_hash, user_id, last_seen_ms) VALUES (?, ?, ?)")
      .run(fingerprint(session.token), userId, session.lastSeen);
    return session;
  }

  /** The session for this token, if it exists and hasn't been idle too long. Using it keeps it alive. */
  use(token: string | undefined): Session | null {
    const session = this.peek(token);
    if (session) {
      session.lastSeen = this.now();
      this.db.prepare("UPDATE sessions SET last_seen_ms = ? WHERE token_hash = ?").run(session.lastSeen, fingerprint(session.token));
    }
    return session;
  }

  /** Like use, but doesn't count as activity (for checking open live connections). */
  peek(token: string | undefined): Session | null {
    if (!token) return null;
    const row = this.db.prepare("SELECT user_id, last_seen_ms FROM sessions WHERE token_hash = ?").get(fingerprint(token)) as
      { user_id: string; last_seen_ms: number } | undefined;
    if (!row) return null;
    if (this.now() - row.last_seen_ms > SESSION_IDLE_MS) {
      this.end(token);
      return null;
    }
    return { token, userId: row.user_id, lastSeen: row.last_seen_ms };
  }

  end(token: string | undefined): void {
    if (token) this.db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(fingerprint(token));
  }
}
