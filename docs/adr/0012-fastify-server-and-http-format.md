# ADR-0012: A Fastify server, and how requests travel over HTTP

- **Status:** Accepted
- **Date:** 2026-10-31

## Context
Phase 5 adds a real server ([plan](../phase-5-plan.md)). It must answer the same requests the in-browser mock answers ([ADR-0004](0004-mock-backend-in-web-worker.md)), so the app can switch between them without a single page changing. Every request and response is already defined in `packages/contracts`, each endpoint with a method and a path (`GET /assets/:assetId`). The server is TypeScript, in this repository, as decided with the user.

Two things had to be settled: which server framework, and exactly how an endpoint's input becomes an HTTP request, since inputs include numbers, lists and nested filters (`status: ["open"]`, `limits: {highAlarm: 615}`).

## Options considered
1. **Express**: the best known, but older; no built-in schema handling, slower, and testing needs an extra library.
2. **Fastify**: mature and fast, with built-in request testing (`inject`) and a plugin for WebSockets (chunk 2). Its route syntax (`/assets/:assetId`) is the same as the contracts'.
3. **Hono**: small and modern, built for many hosting platforms; less established for a long-running Node server with WebSockets.

For the HTTP format:
- **Plain query strings** (`?status=open&status=acknowledged&limit=50`): conventional, but every value arrives as text, so the server must guess what's a number or a list for each endpoint.
- **JSON values in the query string** (`?status=["open"]&limit=50`): slightly unusual-looking, but exact: what was sent is what arrives.

## Decision
- **Fastify** (version 5), in `apps/server`, run with **tsx** in development (the shared packages are TypeScript source).
- **Every endpoint is one route** at its contract method and path under `/api`. The server runs the same simulation as demo mode, and the simulation checks every input and output against the contracts.
- **GET**: path values fill the path; every other value goes in the query string **as JSON**. **POST**: the whole input is a JSON body; path values in the path always win. One copy of this (`contracts/src/http.ts`) is used by both the browser and the server.
- **Errors** are the contract's `ApiError`, with matching HTTP statuses (400, 404, 409, 422, 503, 500). An unexpected error is logged on the server and reported to the browser only as "internal": details of a failure never leave the server.
- **The simulation panel's controls** have their own route (`POST /api/simulation/control`), checked against a schema like everything else.
- **Until sign-in exists (chunk 3)**, the browser names the demo role it's playing in an `X-Demo-Role` header. It is not security; chunk 3 replaces it with sessions and the server's own role checks.

## Consequences
- The web app picks a transport at start-up (`vite --mode server` for the server), and nothing else changes; a test checks every endpoint has its route.
- A request can be typed into a browser's address bar to look at the raw data (`/api/assets/CBC-GT-101`).
- In chunk 1 one simulated plant serves everyone and the role is the last one named; fine for one person developing, replaced in chunk 3.
- Live values and status still need the WebSocket (chunk 2); until then the browser asks for the status once a second.
