# Deliverable 4 — Data Contracts

## In plain words first

A **contract** is the agreed shape of data that passes between the frontend and the backend. "An Asset always has an `id`, a `name`, a `health` with a `score` between 0 and 100…"

If both sides follow the same contract, either side can be swapped out — today's fake backend for tomorrow's real one — without breaking anything.

The contract is **code**, not just a document: it lives in [`packages/contracts`](../../packages/contracts/src/). Each shape is written once as a **Zod schema**, which gives us two things:

| From one schema we get… | Which does… | When |
|---|---|---|
| A **TypeScript type** (`type Asset`) | Lets the editor catch mistakes like `asset.helth` | While you write code |
| A **runtime check** (`Asset.parse(data)`) | Rejects bad data from the server, e.g. a probability of 1.5 | While the app runs |

Run the checks yourself:

```bash
npm run check
```

## 1. Files

| File | What it defines |
|---|---|
| [common.ts](../../packages/contracts/src/common.ts) | IDs, timestamps, health scale, data quality, money, paging, errors |
| [users.ts](../../packages/contracts/src/users.ts) | The 11 roles, users |
| [hierarchy.ts](../../packages/contracts/src/hierarchy.ts) | Hierarchy levels and nodes, sites |
| [quantities.ts](../../packages/contracts/src/quantities.ts) | What sensors measure, and the SI unit each is sent in |
| [tags.ts](../../packages/contracts/src/tags.ts) | Sensor tags and their alert/alarm/trip limits |
| [assets.ts](../../packages/contracts/src/assets.ts) | Asset classes, operating status, health, Remaining Useful Life, asset list filters |
| [timeseries.ts](../../packages/contracts/src/timeseries.ts) | History requests/responses, the interval rule from ADR-0006, live values |
| [predictions.ts](../../packages/contracts/src/predictions.ts) | Predictions, explanations, data-quality flags, recommended actions, top-risk rows |
| [alarms.ts](../../packages/contracts/src/alarms.ts) | ISA-18.2 priorities and states, alarms, alarm summary, acknowledge/shelve requests |
| [events.ts](../../packages/contracts/src/events.ts) | Timeline events |
| [work-orders.ts](../../packages/contracts/src/work-orders.ts) | Work order types, lifecycle, priorities, create request |
| [kpis.ts](../../packages/contracts/src/kpis.ts) | Command Center KPIs |
| [briefing.ts](../../packages/contracts/src/briefing.ts) | AI daily briefing with citations |
| [realtime.ts](../../packages/contracts/src/realtime.ts) | Live message formats and budgets |
| [endpoints.ts](../../packages/contracts/src/endpoints.ts) | **The API endpoint list** — ties it all together |
| [contracts.test.ts](../../packages/contracts/src/contracts.test.ts) | 22 tests proving the rules hold |

## 2. Rules every contract follows

1. **Timestamps** are ISO 8601 strings in UTC: `"2026-10-10T08:30:00Z"`.
2. **Measurements** are always in the canonical SI unit for their quantity (`CANONICAL_UNIT`). The frontend converts for display.
3. **"No value"** is `null`, never a missing field, `0`, or `-1`. (Optional *filters* in requests may be left out.)
4. **Labels the user reads** (KPI names, briefing headings, enum values) are **not** in the data — the data carries a key (`"pm_compliance"`) and the UI's text catalog supplies the words.
5. **Lists** are either `{ items }` (small, bounded) or a page `{ items, total, offset, limit }`.
6. **Errors** always have the `ApiError` shape: `{ code, message, details? }`.

## 3. API endpoint list (Phase 1)

Path parameters (`:assetId`) are filled from the input. For `GET`, the other input fields become the query string; for `POST`, the JSON body.

| Name | Method & path | Purpose |
|---|---|---|
| `me.get` | `GET /me` | Signed-in user (demo: chosen role) |
| `users.list` | `GET /users` | People search (assignee picker) |
| `hierarchy.node` | `GET /hierarchy/nodes/:nodeId` | One hierarchy node |
| `hierarchy.children` | `GET /hierarchy/nodes/:nodeId/children` | Tree, one level at a time |
| `hierarchy.path` | `GET /hierarchy/nodes/:nodeId/path` | Breadcrumb ancestors |
| `sites.list` | `GET /sites` | All sites (map) |
| `assets.list` | `GET /assets` | Registry: filter, sort, page |
| `assets.get` | `GET /assets/:assetId` | Asset 360 header |
| `assets.tags` | `GET /assets/:assetId/tags` | Sensor tags + limits |
| `timeseries.history` | `POST /timeseries/history` | Aggregated history (avg/min/max, ≤ 2,000 points) |
| `timeseries.latest` | `POST /timeseries/latest` | Latest value per tag (on load and after reconnect) |
| `risks.top` | `GET /risks/top` | Top risks — **acceptance criterion A** |
| `predictions.list` | `GET /predictions` | Predictions with filters |
| `predictions.get` | `GET /predictions/:predictionId` | Full prediction — **criterion B** |
| `alarms.list` | `GET /alarms` | Alarm list |
| `alarms.summary` | `GET /alarms/summary` | Alarm bar counts |
| `alarms.acknowledge` | `POST /alarms/acknowledge` | Acknowledge alarms |
| `alarms.shelve` | `POST /alarms/:alarmId/shelve` | Shelve with reason + expiry |
| `alarms.unshelve` | `POST /alarms/:alarmId/unshelve` | Un-shelve |
| `events.list` | `GET /events` | Event timeline |
| `kpis.get` | `GET /kpis` | KPI strip |
| `briefing.daily` | `GET /briefing/daily` | AI daily briefing |
| `workOrders.list` | `GET /work-orders` | Work orders |
| `workOrders.create` | `POST /work-orders` | Create (e.g. from alarm) — **criterion C** |

Later phases add endpoints to the same table (work-order lifecycle, reliability, inventory, …).

## 4. Live messages

Same shapes over a WebSocket (real) or worker messages (demo).

**Client → server**

| `type` | Payload | Meaning |
|---|---|---|
| `subscribe_tags` | `tagIds` (≤ 300) | Start sending these tags |
| `unsubscribe_tags` | `tagIds` | Stop |
| `subscribe_alarms` | `scopeId` | Send alarm changes + counts under this hierarchy node |
| `unsubscribe_alarms` | — | Stop |
| `ping` | `t` | Connection health check |

**Server → client**

| `type` | Payload | When |
|---|---|---|
| `tag_values` | `seq`, `t`, `values[]` | At most once per second, only changed tags |
| `alarm_changed` | full `alarm` | Any alarm state change |
| `alarm_summary` | `summary` | Alarm bar counts changed |
| `pong` | `t` | Reply to ping |
| `error` | `ApiError` | e.g. `too_many_tags` |

**Gap detection:** `seq` increases by exactly 1 per batch. If the client sees a jump, it calls `timeseries.latest` to resynchronise.

Budgets: `MAX_SUBSCRIBED_TAGS = 300`, `LIVE_FLUSH_INTERVAL_MS = 1000`, `STALE_AFTER_MS = 10000`.

## 5. What the real backend team must also do

These cannot be enforced by the frontend contract and must be in the backend's requirements:

1. **Access control** on every endpoint and live subscription (ADR-0008).
2. Shelve `until` must be in the future and ≤ 24 h away.
3. History aggregation must use `pickIntervalSeconds` and return avg/min/max per interval.
4. Reject subscriptions beyond 300 tags with `too_many_tags`.
5. Record every state-changing request (acknowledge, shelve, create work order) in an audit log with who, what, when.

## 6. Decisions made in this deliverable

| Decision | Why |
|---|---|
| Asset `id` **is** the plant tag (`GT-101`) | One identifier people already know; readable URLs |
| Criticality is 1–5 (5 = severe) | Same scale as the 5×5 risk matrix's consequence axis |
| Pressure travels in **bar** | Common in process plants; one fixed SI-family unit avoids kPa/bar confusion |
| `timeseries.history` is a `POST` | A list of tags plus a range can be long for a URL |
| Empty history intervals are omitted | Smaller responses; the chart breaks the line where points are missing |
| Turborepo deferred until `apps/web` exists | With one package, plain npm workspace scripts are enough |
