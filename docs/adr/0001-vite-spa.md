# ADR-0001: Vite single-page app with TanStack Router

- **Status:** Accepted
- **Date:** 2026-10-10

## Context
The spec suggests Next.js (a framework that renders pages on a server) or a Vite single-page app (SPA: the server sends one HTML file and JavaScript builds every page in the browser).

Our app:
- is entirely behind a login — no public pages that search engines need to read;
- gets most of its data live, after the page has loaded;
- must run on control-room kiosk screens and be hostable as plain static files inside a company network.

## Options considered
1. **Next.js App Router** — server rendering, server components, built-in routing. Strong for public, content-heavy sites. Adds a server to run and concepts to learn (server vs client components) that bring little benefit here.
2. **Vite SPA + TanStack Router** — simple build, very fast dev server, output is static files. Router has type-safe URL search parameters, which suits our "every filter lives in the URL" rule.
3. **Vite SPA + React Router** — also fine; less type safety for search parameters.

## Decision
Vite SPA with TanStack Router.

## Consequences
- ✅ One mental model: everything runs in the browser. Easier to learn.
- ✅ Hosting is any static web server or CDN.
- ✅ Filters, time range and selected asset are typed URL parameters — links are shareable.
- ❌ First load downloads the app's JavaScript before showing anything. Mitigated by code-splitting per route and a fast skeleton screen.
