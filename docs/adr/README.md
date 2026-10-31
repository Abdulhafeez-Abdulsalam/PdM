# Architecture Decision Records (ADRs)

An ADR is a short note that records **one important technical decision**: what we chose, what else we considered, and why. When someone asks "why on earth did they use X?" in a year's time, the answer is here.

Rules:
- One decision per file, numbered in order.
- Never edit an accepted ADR's decision. If we change our mind, write a new ADR that **supersedes** the old one and update the old one's status.

| # | Decision | Status |
|---|---|---|
| [0001](0001-vite-spa.md) | Vite single-page app with TanStack Router | Accepted |
| [0002](0002-monorepo.md) | Monorepo with npm workspaces and Turborepo | Accepted |
| [0003](0003-open-source-charts-and-maps.md) | ECharts and MapLibre | Accepted |
| [0004](0004-mock-backend-in-web-worker.md) | Fake backend in a Web Worker behind a transport switch | Accepted |
| [0005](0005-live-data-budget.md) | Live data budget: 300 tags, 1 Hz | Accepted |
| [0006](0006-chart-point-budget.md) | Chart budget: 2,000 points per line, interval chosen by the data service | Accepted |
| [0007](0007-online-only.md) | Online-only; no offline sync | Accepted |
| [0008](0008-simple-role-based-views.md) | Simple role-based views, not security | Accepted |
| [0009](0009-english-only-text-catalog.md) | English only, but all text in a catalog | Accepted |
| [0010](0010-ai-provider-interface.md) | Scripted AI behind a provider interface | Accepted |
| [0011](0011-typescript-6-for-tooling.md) | TypeScript 6 (not 7) so linting works | Accepted |
| [0012](0012-fastify-server-and-http-format.md) | A Fastify server, and how requests travel over HTTP | Accepted |
| [0013](0013-live-values-over-a-websocket.md) | Live values over a WebSocket, one shared plant | Accepted |
| [0014](0014-sessions-and-server-role-checks.md) | Demo sign-in, sessions, and the server's role checks | Accepted |
| [0015](0015-sqlite-command-log-and-replay.md) | SQLite, a command log, and replay on restart | Accepted |

Template for new ADRs: [template.md](template.md).
