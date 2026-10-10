# Deliverable 2 — Design System

## In plain words first

A **design system** is the set of rules and parts that make every screen look and behave the same way: colours, fonts, spacing, and reusable building blocks like buttons and charts.

The core idea is **design tokens**: named values instead of raw ones.

```css
/* ❌ Raw value: if we want a different red, we must hunt through 400 files */
color: #B91C1C;

/* ✅ Token: change it once, everywhere updates. Each theme can give it a different value. */
color: var(--color-severity-critical);
```

That one idea is what makes Light, Dark and Control-Room themes possible, and what makes "zero hard-coded colours" achievable.

Components live in `packages/ui` (and charts in `packages/charts`). The full component list is in [components.md](components.md).

---

## 1. Token layers

Tokens come in three layers. Components only ever use layers 2 and 3.

| Layer | Example | Meaning | Who uses it |
|---|---|---|---|
| **1. Primitive** | `--grey-700: #374151` | A raw colour from the palette. No meaning. | Only the theme files |
| **2. Semantic** | `--color-text-primary`, `--color-severity-critical` | A *purpose*. Each theme maps it to a primitive. | Components |
| **3. Component** | `--button-primary-bg` | A specific part, pointing at a semantic token | One component |

Themes are switched by an attribute on the page: `<html data-theme="light | dark | control-room">`. Tailwind reads the same CSS variables, so `bg-surface` or `text-health-critical` follow the theme automatically.

**Naming in code** (see [`packages/ui/src/tokens.css`](../../packages/ui/src/tokens.css) and [`theme.css`](../../packages/ui/src/theme.css)): raw tokens are written `--pdm-…` (e.g. `--pdm-bg-surface`, `--pdm-health-critical`) and change per theme. `theme.css` exposes them to Tailwind under short names (`bg-surface`, `text-fg-muted`, `border-line`, `text-health-critical`, `bg-alarm-p1`). The `--color-…` names used in the tables below are the conceptual names.

---

## 2. Themes

| | **Light** | **Dark** | **Control-Room** |
|---|---|---|---|
| For | Office desktops, daylight | Evenings, preference | 24/7 operator consoles and wall screens |
| Idea | Clean, high contrast | Low brightness, comfortable | **ISA-101 high-performance HMI**: normal = grey, colour only means a problem |
| Background | Off-white | Near-black blue | Mid-dark neutral grey (no blue tint) |
| Healthy equipment | Green | Green | **Grey** — normal must not attract the eye |
| Animation | Normal | Normal | Minimal; no decorative motion |

### Why Control-Room mode is different
Operators watch screens for 12-hour shifts. If every healthy pump is bright green, the screen is a wall of colour and a real problem doesn't stand out. ISA-101 says: **show normal in grey, and reserve colour for abnormal conditions** so the eye jumps straight to trouble. It also reduces blue light and glare.

### Base semantic colours

| Token | Light | Dark | Control-Room |
|---|---|---|---|
| `--color-bg-canvas` (page) | `#F7F8FA` | `#0B0F14` | `#2B2E31` |
| `--color-bg-surface` (cards) | `#FFFFFF` | `#131A22` | `#34383C` |
| `--color-bg-raised` (menus, dialogs) | `#FFFFFF` | `#1A2330` | `#3D4246` |
| `--color-border` | `#D1D5DB` | `#2A3441` | `#4A4F54` |
| `--color-text-primary` | `#111827` | `#E5E7EB` | `#D9DCDF` |
| `--color-text-secondary` | `#4B5563` | `#9CA3AF` | `#A3A8AD` |
| `--color-accent` (links, focus, selected) | `#1D4ED8` | `#60A5FA` | `#C8C2B4` (warm neutral, low blue) |
| `--color-focus-ring` | `#1D4ED8` | `#93C5FD` | `#F2E8C9` |

All text/background pairs must reach **WCAG AA contrast** (4.5 : 1 for normal text, 3 : 1 for large text and icons). Values above are starting points; Phase 1 includes an automated contrast check over every token pair, and any failing value gets adjusted.

---

## 3. Health & severity scale

Every asset, sensor and widget uses the same 7 states. **Colour is never the only signal** — each state also has an icon, a shape and a pattern, so colour-blind users and greyscale printouts still work.

| State | Meaning | Icon | Shape (map markers) | Pattern (heatmaps) |
|---|---|---|---|---|
| **Healthy** | Operating normally | check | circle | solid |
| **Watch** | Early sign, keep an eye on it | eye | circle with ring | dots (sparse) |
| **Degraded** | Measurably worse, plan action | trending-down | triangle pointing down | diagonal lines |
| **Warning** | Action needed soon | triangle with ! | triangle pointing up | cross-hatch |
| **Critical** | Act now / failure imminent | octagon with ✕ | diamond | dense solid + outline |
| **Offline / No data** | No trustworthy data | slashed circle | dashed circle | grey stripes |
| **Maintenance** | Intentionally out of service | wrench | square | horizontal lines |

| Token | Light | Dark | Control-Room |
|---|---|---|---|
| `--color-health-healthy` | `#15803D` | `#4ADE80` | `#A3A8AD` (grey — normal) |
| `--color-health-watch` | `#0E7490` | `#22D3EE` | `#8FB3BF` |
| `--color-health-degraded` | `#A16207` | `#FACC15` | `#D4B254` |
| `--color-health-warning` | `#C2410C` | `#FB923C` | `#E8913A` |
| `--color-health-critical` | `#B91C1C` | `#F87171` | `#E5484D` |
| `--color-health-offline` | `#6B7280` | `#9CA3AF` | `#6E7378` |
| `--color-health-maintenance` | `#6D28D9` | `#A78BFA` | `#9D8FC7` |

### Alarm priorities (ISA-18.2)

ISA-18.2 is the industry standard for managing alarms. Alarms have a **priority** (how urgent) and a **state** (where they are in their life).

| Priority | Response expected | Token (maps to) | Icon |
|---|---|---|---|
| **P1 — Urgent** | Immediate | `--color-alarm-p1` → critical | octagon ✕ |
| **P2 — High** | Within minutes | `--color-alarm-p2` → warning | triangle ! |
| **P3 — Medium** | Within the shift | `--color-alarm-p3` → degraded | square ! |
| **P4 — Low** | When convenient | `--color-alarm-p4` → watch | circle i |
| Journal / diagnostic | Record only, not shown as alarm | text secondary | — |

| Alarm state | Display |
|---|---|
| Active, unacknowledged | Priority colour, **bold**, subtle pulse on the icon (no pulse with reduced motion) |
| Active, acknowledged | Priority colour, normal weight, no pulse |
| Returned to normal, unacknowledged | Outline only, "RTN" label |
| Shelved | Grey, clock icon, shows expiry time |
| Suppressed / out of service | Grey, eye-off icon, listed separately |

Nothing ever flashes faster than 3 times per second (seizure safety rule in WCAG).

---

## 4. Typography

| Token | Value | Use |
|---|---|---|
| `--font-sans` | **Inter**, then system UI fonts | All interface text |
| `--font-mono` | **JetBrains Mono**, then system monospace | Tag names, IDs, codes |
| Numbers | `font-variant-numeric: tabular-nums` **everywhere** | Digits all the same width, so changing values don't jiggle and columns line up |

| Size token | px | Use |
|---|---|---|
| `--text-xs` | 12 | Table secondary text, axis labels |
| `--text-sm` | 14 | **Default body** (dense industrial UI) |
| `--text-md` | 16 | Form inputs, mobile body |
| `--text-lg` | 20 | Card titles |
| `--text-xl` | 24 | Page titles |
| `--text-2xl` | 32 | KPI headline numbers |
| `--text-wall` | 48+ | Wall-display / kiosk mode KPIs |

Rules:
- **Units always visible** next to a value: `412 °C`, never just `412`.
- Value and unit come from one formatter (`formatQuantity`), never assembled by hand.

---

## 5. Spacing, shape, depth

| Token group | Values |
|---|---|
| Spacing (4 px grid) | `--space-1` 4 · `--space-2` 8 · `--space-3` 12 · `--space-4` 16 · `--space-6` 24 · `--space-8` 32 · `--space-12` 48 |
| Radius | `--radius-sm` 4 · `--radius-md` 6 · `--radius-lg` 10 · `--radius-full` |
| Elevation | `--shadow-1` cards · `--shadow-2` menus · `--shadow-3` dialogs (Control-Room uses borders instead of shadows) |
| Touch target | min 40 × 40 px desktop, **48 × 48 px** on touch screens and field technician pages |
| Breakpoints | `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280 · `2xl` 1536 · `wall` 2560 |

Layout uses CSS logical properties (`padding-inline-start`, not `padding-left`) — costs nothing and keeps future right-to-left languages possible.

---

## 6. Units

All data is stored and transferred in **SI base units**. Conversion happens only at display time, in one module (`apps/web/src/shared/units`).

| Quantity | SI | Imperial | Oilfield |
|---|---|---|---|
| Temperature | °C | °F | °F |
| Pressure | bar | psi | psi |
| Liquid flow | m³/h | gal/min | bbl/d (barrels per day) |
| Gas flow | Sm³/d | scf/d | **MMscfd** (million standard cubic feet per day) |
| Length / wall thickness | mm | in | in |
| Mass | kg | lb | lb |
| Power | kW / MW | hp (mechanical) / MW (electrical) | hp / MW |
| Energy | MWh | MWh | MWh |
| Vibration velocity | mm/s | in/s | in/s |
| Heat rate | kJ/kWh | Btu/kWh | Btu/kWh |

> **Known subtlety:** "standard" gas volumes depend on the reference conditions (15 °C vs 60 °F). Converting Sm³ to scf is about ×35.3147 only if the reference conditions match; otherwise a small correction applies. The unit module will document which reference it uses.

---

## 7. Time and number formatting

| Rule | Detail |
|---|---|
| Storage | All timestamps in **UTC**, ISO 8601 format |
| Display zone | User picks: **site local** (default), **UTC**, or **my time zone**. Shown in the top bar. |
| Formatting | Browser `Intl.DateTimeFormat` and `Intl.NumberFormat` — no hand-made formats |
| Relative times | "12 s ago", "3 h ago" for freshness badges; hover shows the exact time |
| Global time range | Live · 1 h · 24 h · 7 d · 30 d · custom · "compare to previous period" — stored in the URL |

---

## 8. Accessibility rules (WCAG 2.2 AA)

1. Everything works by **keyboard**: visible focus ring, logical tab order, Esc closes overlays.
2. **Colour is never the only signal** (see health scale).
3. Every chart has a **"View as table"** toggle and an accessible summary ("Exhaust temperature rose 8% over 24 h; 2 threshold crossings").
4. Respect **reduced motion**: no pulses, no animated transitions.
5. Every icon-only button has a text label for screen readers.
6. Automated **axe** checks on every component story and every Playwright page test, in all three themes.

---

## 9. Interaction patterns

| Situation | Pattern |
|---|---|
| Waiting for data | **Skeleton** shaped like the content (not a spinner) |
| No data | **Empty state** that explains why and what to do ("No alarms in this area. Change filters or time range.") |
| Error | **Error state** with a clear message and a Retry button. Widget-level, never whole-page. |
| Stale data | Value greyed + clock icon + "last updated 2 min ago" |
| Fast feedback | **Optimistic updates** (e.g. acknowledging an alarm updates immediately; rolls back with a message if the server refuses) |
| Destructive actions | **Undo** toast for 10 s, or confirmation dialog when undo is impossible |
| Actions needing a reason | Required "reason for change" field (shelving alarms, editing thresholds) |
| Search anything | **Command palette** (Ctrl/Cmd + K) |
| Keyboard help | Press **?** to open the shortcut cheat sheet |

---

## 10. Widget contract

Every dashboard widget (KPI card, chart, list, map) follows the same rules. This is built once into a `<Widget>` frame component so individual widgets get it for free.

| Every widget has | Why |
|---|---|
| Title + optional subtitle | Says what it is |
| **Freshness badge** ("updated 12 s ago") | Users must know how current data is |
| **Lineage tooltip** ("Calculated from 14 tags at Site A, method: …") | Users must know where a number came from |
| Loading, empty, error, stale states | No blank or broken boxes |
| Its own **error boundary** | One broken widget never blanks the dashboard |
| Menu: view as table, export CSV, full screen, copy link | Consistent extras |
