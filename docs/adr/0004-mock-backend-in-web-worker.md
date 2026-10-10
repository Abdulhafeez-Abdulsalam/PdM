# ADR-0004: Fake backend in a Web Worker behind a transport switch

- **Status:** Accepted
- **Date:** 2026-10-10

## Context
There is no real backend. The spec requires realistic mock data and that switching to real APIs needs **no UI changes**.

The fake data is large (~2,000 assets, ~50,000 tags) and generating it takes real computing work. A web page normally does everything on one thread (the "main thread"); heavy work there makes clicks and scrolling freeze.

## Options considered
1. **Hard-coded JSON files** — simple but static: no live data, no storyline, no chaos mode.
2. **MSW (Mock Service Worker)** — intercepts real HTTP calls. Good for REST, awkward for live WebSocket streams, and generation still runs on the main thread.
3. **Custom generator in a Web Worker** — a separate background thread. The app talks to it with messages shaped exactly like real API requests and real WebSocket messages.

## Decision
Option 3. The API client talks to a **transport** interface:

```ts
interface Transport {
  request<T>(endpoint: string, params: unknown): Promise<T>;
  subscribe(tagIds: string[]): void;
  unsubscribe(tagIds: string[]): void;
  onMessage(handler: (msg: LiveMessage) => void): () => void;
}
```

Two implementations: `WorkerTransport` (demo) and `HttpTransport` (real HTTP + WebSocket). One environment variable chooses which.

The generator is **seeded**: the same seed always produces the same sites, assets and histories, so demos and tests are repeatable.

## Consequences
- ✅ The UI never knows whether data is fake.
- ✅ Heavy generation never freezes the screen.
- ✅ Supports the demo storyline, simulation speed, and "chaos" toggle (gaps, bad quality, alarm bursts).
- ❌ We must write the message protocol ourselves (small, and good practice).
- Every response is validated against `packages/contracts`, so the fake and real backends are held to the same shapes.
