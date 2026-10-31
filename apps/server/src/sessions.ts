/**
 * Who is signed in (Phase 5 chunk 3, ADR-0014). A session is a long random token: the browser
 * keeps it in a cookie, and only the server knows whose it is. Guessing one is hopeless (32 random
 * bytes), and the page's own code can't read the cookie (HttpOnly), so a script slipped into the
 * page can't steal it either.
 *
 * Kept in memory for now, so restarting the server signs everyone out; chunk 4 keeps sessions in
 * the SQLite database.
 */
import { randomBytes } from "node:crypto";

export const SESSION_COOKIE = "pdm_session";
/** Signed out after this long without a request: about a shift. */
export const SESSION_IDLE_MS = 8 * 60 * 60 * 1000;

export interface Session {
  token: string;
  userId: string;
  lastSeen: number;
}

export class SessionStore {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly now: () => number = Date.now) {}

  create(userId: string): Session {
    const session = { token: randomBytes(32).toString("base64url"), userId, lastSeen: this.now() };
    this.sessions.set(session.token, session);
    return session;
  }

  /** The session for this token, if it exists and hasn't been idle too long. Using it keeps it alive. */
  use(token: string | undefined): Session | null {
    const session = this.peek(token);
    if (session) session.lastSeen = this.now();
    return session;
  }

  /** Like use, but doesn't count as activity (for checking open live connections). */
  peek(token: string | undefined): Session | null {
    if (!token) return null;
    const session = this.sessions.get(token);
    if (!session) return null;
    if (this.now() - session.lastSeen > SESSION_IDLE_MS) {
      this.sessions.delete(token);
      return null;
    }
    return session;
  }

  end(token: string | undefined): void {
    if (token) this.sessions.delete(token);
  }
}
