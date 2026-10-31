# ADR-0013: Live values over a WebSocket, one shared plant

- **Status:** Accepted
- **Date:** 2026-10-31

## Context
Chunk 1 of Phase 5 ([plan](../phase-5-plan.md)) put every request on HTTP ([ADR-0012](0012-fastify-server-and-http-format.md)), but live tag values, alarm changes and the simulation status are *pushed* by the backend: the browser can't know when to ask. In demo mode the Web Worker posts them; the server needs a connection that stays open. The live budget from [ADR-0005](0005-live-data-budget.md) still holds: at most 300 tags, one batch a second.

There was also a hidden assumption in the simulation: alarm changes were collected for "the" connection, which was true in the worker (one browser tab, one connection) but not on a server, where every browser has its own.

## Options considered
1. **Keep asking (polling)**: the browser asks for new values every second. Simple, but a request per second per screen, and values arrive up to a second late.
2. **Server-Sent Events**: the server streams messages over a normal HTTP response. One direction only; the browser's subscriptions would need separate requests.
3. **A WebSocket**: one connection, both directions, the standard for live dashboards. Fastify has an official plugin (`@fastify/websocket`, built on the widely used `ws` library).

## Decision
- **One WebSocket per browser** at `/api/live`, with `@fastify/websocket` (pinned to an exact version).
- **Same messages as the worker.** The browser sends the contract's `ClientMessage`s (subscribe to tags, watch alarms, ping); the server sends the worker's `live` and `status` envelopes (`LiveFrame` in `contracts/src/http.ts`). Both transports read them alike, so `LiveClient` and every page are unchanged.
- **Everything that arrives is checked** against the `ClientMessage` schema; a bad message gets an `error` reply and the connection stays open. Messages are capped at 64 KB, and a browser too slow to take what's sent (1 MB waiting) is disconnected, and reconnects.
- **One plant, one clock.** The server ticks the simulation once a second and pushes the status to every browser; a change from the simulation panel is pushed to all of them at once. Two browsers see the same plant at the same moment.
- **Alarm changes are collected once per tick and shared**, so every connection sees every change (fixed in `mock-data`, with a test).
- **Reconnecting is the browser's job.** If the connection drops, `HttpTransport` tries again after 1 s, then 2, 4, 8, at most 10 s, and tells the new connection what it was watching. The "Drop connection" switch closes the socket for real.
- **Only pages on this site may connect.** Browsers let any web page open a WebSocket to any address (including `127.0.0.1`), so the server refuses a connection whose `Origin` isn't its own address (403). Programs that aren't browsers send no `Origin`; sign-in (chunk 3) covers them.
- The once-a-second status request from chunk 1 is gone.

## Consequences
- Server mode now shows live values, alarm counts and a moving clock, like demo mode.
- The simulation panel controls the shared plant: speeding it up speeds it up for everyone. Fine for a demo; a real plant has no such panel.
- The Vite dev server forwards WebSockets too (`ws: true` on its `/api` proxy).
- The role in the status is still "the last one named" until chunk 3 gives each browser a session.
