# Deliverable 3 — Information Architecture

## In plain words first

**Information architecture (IA)** answers: *what pages exist, how are they organised, how do people move between them, and who sees what?* It's the floor plan of the app, drawn before any walls are built.

This document covers:
1. The **app shell**: the frame around every page
2. The **sitemap**: every page and its web address (URL)
3. **Navigation**: how the left menu is grouped
4. The **role-to-module matrix**: who sees what
5. **Home screens per role**
6. How the **key user journeys** meet the acceptance criteria
7. **URL and shortcut** conventions

---

## 1. App shell

The shell is the part that stays the same on every page.

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ☰ PdM │ Enterprise › Gulf Region › Site A › Train 2 ▾ │ 🔍 Ctrl+K │ ⏱ 24h ▾ │ SI ▾ │ 🔔 │ ● Live │ 👤 │
├──────────────────────────────────────────────────────────────────────────────────────┤
│ ALARMS  ◆ P1 2   ▲ P2 7   ■ P3 15   ● P4 31   │  Shelved 4                           │ ← alarm bar (always visible)
├────────────┬───────────────────────────────────────────────────────────┬─────────────┤
│ MONITOR    │                                                           │ Right panel │
│  Command   │                                                           │ (optional)  │
│  Assets    │                    PAGE CONTENT                           │             │
│  Alarms    │                                                           │ • Asset     │
│  Operations│                                                           │   quick view│
│  Twin      │                                                           │ • Comments  │
│ PREDICT    │                                                           │ • AI        │
│  …         │                                                           │   assistant │
└────────────┴───────────────────────────────────────────────────────────┴─────────────┘
```

| Shell element | Purpose |
|---|---|
| **Left navigation** | Modules grouped by purpose; collapsible to icons; shows only what the role may see |
| **Asset context selector** | Breadcrumb-style picker for the hierarchy *Enterprise → Region → Business Unit → Site → Area/Unit → Equipment → Component → Sensor*. Sets the scope for every page. |
| **Global search** (Ctrl/Cmd + K) | Find assets, tags, alarms, work orders, pages, actions |
| **Time range** | Live / 1 h / 24 h / 7 d / 30 d / custom / compare to previous period |
| **Unit system** | SI / Imperial / Oilfield |
| **Notifications** (🔔) | Assignments, mentions, prediction updates |
| **Connection status** | Live / degraded / disconnected |
| **User menu** | Theme, time zone, role (demo), shortcuts, help, sign out |
| **Alarm summary bar** | Counts per priority, always visible; click → filtered alarm list |
| **Right panel** | Asset quick view, comments, AI assistant, without leaving the page |

On phones the left nav becomes a bottom bar with 4–5 key items plus "More", and the alarm bar collapses to a single badge.

---

## 2. Sitemap

Phase tags show when each page is built. 🟢 = Phase 1.

```
/                                   → redirects to the role's home
│
├─ MONITOR
│  ├─ /command-center               🟢 Command Center (role-specific widget layout)
│  ├─ /assets                       🟢 Asset registry — tree · table · cards · map views
│  │  ├─ /assets/compare            P2 Fleet comparison
│  │  ├─ /assets/watchlist          🟢 My watchlist
│  │  └─ /assets/:assetId           🟢 Asset 360
│  │      ├─ /overview              🟢
│  │      ├─ /telemetry             🟢 live + history charts
│  │      ├─ /health                🟢 health breakdown, RUL, predictions
│  │      ├─ /alarms                🟢
│  │      ├─ /maintenance           🟢 history (read) — work orders full in P2
│  │      ├─ /documents             P2
│  │      ├─ /spares                P4
│  │      ├─ /failures              P3
│  │      ├─ /performance           P3
│  │      ├─ /twin                  P3
│  │      ├─ /related               P2
│  │      ├─ /audit                 P4
│  │      └─ /comments              P2
│  ├─ /alarms                       🟢 Live alarm list
│  │  ├─ /alarms/events             🟢 Event timeline (basic)
│  │  ├─ /alarms/analytics          P2 Alarm KPIs, bad actors, floods
│  │  └─ /alarms/shelved            🟢 Shelved & suppressed
│  ├─ /operations                   P3 Operations dashboards
│  │  ├─ /operations/oil-gas        P3 upstream · midstream · downstream
│  │  ├─ /operations/power          P3 gas turbines, HRSG, generators, transformers
│  │  └─ /operations/solar          P3 plant, inverters, strings, trackers, BESS
│  └─ /twin                         P3 Digital twin: P&ID, 3D, solar layout, pipeline route
│
├─ PREDICT & IMPROVE
│  ├─ /predictive                   P2 Prediction console
│  │  ├─ /predictive/:predictionId  P2 Prediction detail (evidence, XAI, action)
│  │  ├─ /predictive/anomalies      P2
│  │  ├─ /predictive/models         P4 Model registry
│  │  ├─ /predictive/rules          P4 Rule builder
│  │  └─ /predictive/what-if        P4 Simulator
│  └─ /reliability                  P3 KPIs, Weibull, FMEA, RCA, criticality
│
├─ ACT
│  ├─ /maintenance                  P2 Work orders (Kanban · list · calendar · Gantt)
│  │  ├─ /maintenance/:workOrderId  P2
│  │  ├─ /maintenance/schedule      P2 Schedule board
│  │  ├─ /maintenance/pm            P3 PM programs
│  │  └─ /maintenance/turnarounds   P4
│  ├─ /field                        P2 Field technician: my tasks (online, mobile layout)
│  │  └─ /field/tasks/:taskId       P2
│  └─ /inventory                    P4 Spares, stock, vendors
│
├─ GOVERN
│  ├─ /hse                          P4 Safety-critical elements, permits, incidents, MoC
│  ├─ /esg                          P4 Emissions, flaring, methane, reports
│  ├─ /financials                   P4 Value realisation, cost of downtime, budgets
│  └─ /reports                      P4 Report studio, library, shift handover
│
└─ SYSTEM
   ├─ /data                         P4 Data sources, tags, data quality
   └─ /admin                        P4 Users, roles, hierarchy, thresholds, audit log
```

---

## 3. Navigation groups

The left menu groups the 16 modules by **what the user is trying to do**, not by the org chart:

| Group | Modules | The question it answers |
|---|---|---|
| **Monitor** | Command Center, Assets, Alarms, Operations, Digital Twin | *What is happening now?* |
| **Predict & Improve** | Predictive Analytics & AI, Reliability | *What will happen, and why?* |
| **Act** | Maintenance, Field, Inventory | *What do we do about it?* |
| **Govern** | HSE, ESG, Financials, Reports | *Are we safe, compliant, and getting value?* |
| **System** | Data & Integrations, Administration | *Is the platform itself healthy?* |

Pages not yet built (later phases) are **hidden** from the menu, not shown as "coming soon" — except in demo mode, where they appear greyed with a phase label so stakeholders can see the roadmap.

---

## 4. Role-to-module matrix

Legend: **●** use (can view and take actions) · **○** view only (action buttons hidden) · **—** hidden

> ⚠️ Reminder ([ADR-0008](../adr/0008-simple-role-based-views.md)): this controls what is *shown*, for usability. It is **not security**. A real backend must enforce access.

| Module ↓ / Role → | Exec | Plant Mgr | Reliab. Eng | Cond. Mon. Analyst | Control Room Op | Maint. Planner | Field Tech | HSE | Procure. | ESG | Admin |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Command Center | ● | ● | ● | ● | ● | ● | ○ | ● | ○ | ○ | ○ |
| Assets | ○ | ● | ● | ● | ● | ● | ○ | ○ | ○ | ○ | ● |
| Predictive & AI | ○ | ○ | ● | ● | ○ | ○ | — | — | — | — | ● |
| Alarms & Events | ○ | ○ | ○ | ○ | ● | ○ | ○ | ○ | — | — | ○ |
| Maintenance | ○ | ● | ○ | ○ | ○ | ● | ○ | ○ | ○ | — | ○ |
| Reliability | ○ | ○ | ● | ○ | — | ○ | — | ○ | — | — | ○ |
| Operations | ○ | ● | ○ | ○ | ● | ○ | — | ○ | — | ○ | ○ |
| Digital Twin | ○ | ○ | ● | ● | ● | ○ | ○ | ○ | — | — | ○ |
| Inventory | ○ | ○ | ○ | — | — | ● | ○ | — | ● | — | ○ |
| HSE & Compliance | ○ | ○ | ○ | — | ○ | ○ | ○ | ● | — | ○ | ○ |
| Energy & ESG | ○ | ○ | — | — | — | — | — | ○ | — | ● | ○ |
| Financials | ● | ● | ○ | — | — | ○ | — | — | ○ | ○ | ○ |
| Reports | ● | ● | ● | ● | ● | ● | — | ● | ● | ● | ● |
| Field | — | ○ | — | — | — | ○ | ● | ○ | — | — | ○ |
| Data & Integrations | — | — | ○ | ● | — | — | — | — | — | — | ● |
| Administration | — | — | — | — | — | — | — | — | — | — | ● |

### Key actions per role (examples)

`canDo(action)` controls buttons. A sample of the action list (full list lives in `roles.ts`):

| Action | Roles allowed |
|---|---|
| `alarm.acknowledge`, `alarm.shelve` | Control Room Op |
| `alarm.createWorkOrder` | Control Room Op, Plant Mgr, Maint. Planner, Reliab. Eng |
| `prediction.feedback` (confirm / reject) | Reliab. Eng, Cond. Mon. Analyst, Field Tech |
| `workOrder.approve` | Plant Mgr |
| `workOrder.schedule` | Maint. Planner |
| `workOrder.execute`, `workOrder.close` | Field Tech |
| `asset.addToWatchlist` | everyone who can see Assets |
| `layout.edit` (customise dashboard) | everyone who can see Command Center (●) |
| `threshold.edit`, `model.approve` | Reliab. Eng, Cond. Mon. Analyst, Admin |
| `admin.*` | Admin |

---

## 5. Home screen per role

Every role lands on a page that answers **their** first question of the day. Until a role's dedicated module is built, it lands on the Command Center with a widget layout tuned for that role.

| Role | First question | Final home | Phase 1 home (Command Center layout) |
|---|---|---|---|
| Executive / VP Ops | "Are we OK, and what is it costing?" | `/command-center` (executive layout) | Enterprise health, KPI strip, top risks, value delivered, map |
| Plant / Asset Manager | "How is my site doing?" | `/command-center` (site layout) | Site health, top risks, backlog, alarms, KPI strip |
| Reliability Engineer | "Which assets are degrading?" | `/reliability` | Top risks, health trends, bad actors, recent predictions |
| Cond. Monitoring Analyst | "Which signals look abnormal?" | `/predictive` | Top risks, anomaly list, data quality |
| Control Room Operator | "What needs action right now?" | `/command-center` (operator layout, Control-Room theme default) | Alarm list (large), process overview, top risks |
| Maintenance Planner | "What's coming and what's scheduled?" | `/maintenance` | Upcoming critical maintenance, top risks, crew availability |
| Field Technician | "What are my jobs today?" | `/field` | My assets' health, alarms near me (until P2) |
| HSE Officer | "Is anything safety-critical at risk?" | `/hse` | Safety-critical asset health, P1 alarms, top risks |
| Procurement / Inventory | "Do we have the parts we'll need?" | `/inventory` | Top risks (→ upcoming part demand), KPI strip |
| ESG Lead | "Are we on track for emissions targets?" | `/esg` | Health of high-emission assets, KPI strip |
| System Admin | "Is the platform healthy?" | `/admin` | Data freshness, connection status, KPI strip |

Every Command Center layout has the **Top risks** widget visible without scrolling. That is how acceptance criterion 1 is met for every role.

---

## 6. Key journeys vs acceptance criteria

### A. "Find the top 5 riskiest assets within 10 seconds of login"
1. Log in → land on role home.
2. **Top risks** widget is in the first screenful: assets ranked by *failure probability × consequence*, each with health badge, predicted failure mode, and time horizon.
3. Target: widget shows data within ~2 s of page load (skeleton first, then data).

### B. "Trace any prediction to evidence, explanation, confidence and action within 2 clicks"
1. **Click 1:** click a prediction anywhere (top-risks row, Asset 360 Health tab, prediction console).
2. A **prediction drawer** opens with everything on one screen: evidence chart (the signals that triggered it), explanation (which sensors contributed and by how much), confidence + data-quality flags, recommended action with cost of failure vs cost of intervention.
3. **Click 2 (optional):** "Open full detail" → `/predictive/:id` page.

So the criterion is met in **one** click; two is the maximum.

### C. "An alarm becomes an assigned work order in under 30 seconds"
1. In the alarm list, click **Create work order** on the alarm row (or press `W` with the row selected).
2. A dialog opens **pre-filled**: asset, priority (from alarm priority), title and description (from alarm text), evidence snapshot (chart image + values at alarm time).
3. Pick an assignee (searchable; suggested crew shown first) → **Create**.
4. Toast: "WO-10482 created and assigned to …" with a link.

Three interactions, typically 10–15 seconds.

### D. Connection lost during a field task (replaces the offline criterion)
1. Banner appears: no connection.
2. Form keeps everything typed; Submit is disabled with a reason.
3. Connection returns → banner clears → Submit enabled → technician submits.

---

## 7. Conventions

### URLs and state

| Kind of state | Where it lives | Example | Why |
|---|---|---|---|
| Which page / which asset / which tab | URL path | `/assets/GT-101/telemetry` | Shareable, bookmarkable |
| Filters, time range, scope, sort, view mode | URL search parameters | `?range=7d&scope=site:SITE-04&view=map` | Shareable — a colleague opening the link sees the same view |
| Personal preferences: theme, units, time zone, collapsed nav | Browser local storage | — | Personal; a shared link opens in *the recipient's* units |
| Server data | TanStack Query cache | — | Fetched, cached, refreshed automatically |
| Live values | Live-data store | — | Updated once per second |

### Keyboard shortcuts

| Keys | Action |
|---|---|
| `Ctrl/Cmd + K` | Command palette (search everything) |
| `?` | Shortcut cheat sheet |
| `g` then `h` | Go home |
| `g` then `a` | Go to Assets |
| `g` then `l` | Go to Alarms |
| `g` then `m` | Go to Maintenance |
| `[` | Collapse / expand left navigation |
| `.` | Open / close right panel |
| `/` | Focus the search/filter box on the current page |
| `t` | Open time range picker |
| Alarm list: `A` / `S` / `W` | Acknowledge / Shelve / Create work order for selected alarm |

Single-letter shortcuts never fire while typing in a text field.

### Naming
- Asset IDs are the plant **tag** (e.g. `GT-101`, `INV-B03-12`), shown in monospace.
- Page titles = module name + context ("Asset 360 · GT-101 Gas Turbine").
