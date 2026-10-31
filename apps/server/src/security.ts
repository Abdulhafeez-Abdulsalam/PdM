/**
 * Protections that don't depend on who you are (Phase 5 chunk 6, ADR-0017).
 *
 * **Security headers** go on every response, telling the browser what this site allows itself to
 * do. The most important is the **Content Security Policy**: the page may only run scripts and load
 * styles, fonts and images from this site, and only talk to this site (and the map's tile server).
 * If an attacker ever got some HTML into a page (say, in a work-order description that wasn't
 * escaped), the browser would still refuse to run their script or send data elsewhere.
 *
 * **A limit on sign-in attempts** stops a program from trying sign-ins as fast as it can.
 */
import type { FastifyInstance } from "fastify";

/** Where the Command Center map loads its tiles from (apps/web/src/features/command-center/map-style.ts). */
const MAP_TILES = "https://tiles.openfreemap.org";

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  // The build turns the smallest font files into data: addresses inside the stylesheet. Fonts
  // can't run code, so this is safe (found by browsing every page under this policy).
  "font-src 'self' data:",
  // 'self' includes this site's own WebSocket (ws://) for live values.
  `connect-src 'self' ${MAP_TILES}`,
  // The map draws its tiles in a worker it starts itself.
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // No other site may show this one in a frame (clickjacking).
  "frame-ancestors 'none'",
].join("; ");

export const SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  // Use the declared content type; never guess (a "picture" that is really a script).
  "X-Content-Type-Options": "nosniff",
  // Don't tell other sites which page a link was followed from (addresses can contain asset ids).
  "Referrer-Policy": "no-referrer",
  // Keep other sites' windows from reaching into this one.
  "Cross-Origin-Opener-Policy": "same-origin",
  // This app needs no camera, microphone or location.
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

export function addSecurityHeaders(app: FastifyInstance): void {
  app.addHook("onSend", async (_request, reply, payload) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) void reply.header(name, value);
    return payload;
  });
}

/**
 * At most `limit` attempts per `windowMs` from one address. A "fixed window": the count starts
 * again each window. Simple, and enough to make guessing hopeless; kept in memory, so a restart
 * forgets it.
 */
export class AttemptLimiter {
  private readonly windows = new Map<string, { startedAt: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Counts an attempt; false once there have been too many in this window. */
  allow(key: string): boolean {
    const now = this.now();
    let w = this.windows.get(key);
    if (!w || now - w.startedAt >= this.windowMs) {
      w = { startedAt: now, count: 0 };
      this.windows.set(key, w);
      // Forget addresses whose window has passed, so the map can't grow without end.
      if (this.windows.size > 10_000) {
        for (const [k, old] of this.windows) if (now - old.startedAt >= this.windowMs) this.windows.delete(k);
      }
    }
    w.count++;
    return w.count <= this.limit;
  }

  /** Seconds until this address may try again. */
  retryAfterSeconds(key: string): number {
    const w = this.windows.get(key);
    return w ? Math.max(1, Math.ceil((w.startedAt + this.windowMs - this.now()) / 1000)) : 0;
  }
}
