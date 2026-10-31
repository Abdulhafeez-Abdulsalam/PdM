# ADR-0017: Running the server properly

- **Status:** Accepted
- **Date:** 2026-10-31

## Context
By chunk 5 of [Phase 5](../phase-5-plan.md) the server worked, but only as a development setup: two terminals, the Vite dev server in front, settings read loosely, no security headers, nothing stopping a program from trying sign-ins as fast as it liked. Chunk 6 makes it run as a service would, still on this laptop (no internet hosting in this phase).

## Decision
- **One command, one address.** `npm start` builds the web app in server mode (`apps/web/dist-server`) and starts the server, which serves the built app and the API together (`@fastify/static`, pinned). Hashed files under `/assets/` may be cached for a year; `index.html` and the app's page addresses (`/alarms`, `/assets/CBC-GT-101/vibration`…) are sent fresh every time, so a new version is picked up at once.
- **Settings from environment variables** (`config.ts`): `PORT`, `HOST`, `DB_FILE`, `SEED`, `WEB_DIST`, `LOG_LEVEL`, `COOKIE_SECURE`, checked with a schema at start-up. A wrong value stops the server with a message naming it. Listening on anything but this computer logs a warning (demo sign-in only).
- **Health check**: `GET /api/health` answers `ok` only if the database answers too (503 otherwise).
- **Structured logs**: one JSON line per event (Fastify's logger), with cookie headers redacted.
- **Security headers on every response**, written by hand (about 20 lines, so they can be read): a **Content Security Policy** (scripts, styles and workers only from this site; connections only to this site and the map's tile server; no plugins; no framing by other sites), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Opener-Policy`, `Permissions-Policy`. The policy started strict and was loosened only where browsing every module showed a real need: fonts may be `data:` addresses, because the build inlines the smallest font files. No `unsafe-inline`, no `unsafe-eval`. *Amended in the [Phase 5 review](../phase-5-review.md):* dialogs add a small style to stop the page behind them scrolling, which the policy blocked; every copy of the page now carries a fresh **nonce**, allowed for styles in its policy and handed to the app in a `<meta>` tag (`get-nonce`). The sign-in limit became a setting (`SIGN_IN_ATTEMPTS_PER_MINUTE`).
- **A limit on sign-in attempts**: 10 a minute per address, then `429 rate_limited` with `Retry-After` (a new `ApiError` code). In memory, written by hand; the sign-in page shows the server's message.
- **"Who is signed in?" answers `{ user: null }`** rather than 401 when nobody is: it's an answer, not an error, and browsers log every 401 as a console error.
- **A clean stop**: on Ctrl+C or a service manager's request, the server stops taking requests, finishes those in progress, closes live connections, saves the simulated clock and closes the database. If that takes more than 10 seconds, it ends anyway.
- **End-to-end tests against the real server**: `npm run e2e:server` builds the app, starts the server with a fresh database (under the git-ignored `apps/server/data/e2e`) and runs the main journeys in Chrome: sign-in and role checks (a hidden button's request is refused with 403), an acknowledgement surviving a reload, live values over the WebSocket, sign-out, and the headers. Any console error, a policy violation included, fails a test.

## Consequences
- Anyone with the repository can run the whole thing with `npm install` and `npm start`.
- The demo-mode suite (`npm run e2e`) is unchanged; the server-mode suite is separate and quick (about 30 seconds).
- The map's tiles come from a public service (`tiles.openfreemap.org`), which the policy has to name; a company deployment would host its own.
- **Not done, needed before the internet**: HTTPS (then `COOKIE_SECURE=true` and an HSTS header), real accounts and passwords or a company login, database backups, monitoring and alerts, and a limiter shared between servers if there is ever more than one.
