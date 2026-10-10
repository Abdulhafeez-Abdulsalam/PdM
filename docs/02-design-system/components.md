# Component Library

Every shared component gets a **Storybook story** covering its states: default, loading, empty, error, stale, and extreme values (very long names, huge numbers, negative values), in all three themes.

**Phase** = when it's first built. P1 = Phase 1.

## Foundations (`packages/ui`)

| Component | What it is | Usage guidance | Phase |
|---|---|---|---|
| `Button` | Primary / secondary / ghost / danger variants | One primary button per area. Danger only for destructive actions. | P1 |
| `IconButton` | Icon-only button | Always has an accessible label and a tooltip | P1 |
| `Input`, `Textarea`, `NumberInput` | Text and number fields | `NumberInput` shows the unit inside the field | P1 |
| `Select`, `Combobox` | Choose from a list (Combobox = with search) | Use Combobox when > 10 options | P1 |
| `Checkbox`, `Switch`, `RadioGroup` | Choices | Switch = takes effect immediately; Checkbox = part of a form | P1 |
| `Tabs` | Switch between views in one area | Tab choice is stored in the URL | P1 |
| `Dialog` | Modal window | For decisions that block work; Esc to close | P1 |
| `Sheet` (side drawer) | Panel sliding in from the side | Quick details without leaving the page | P1 |
| `Popover`, `Tooltip`, `DropdownMenu` | Small overlays | Tooltips only for extra info, never essential info | P1 |
| `Toast` | Short message in a corner | Success / info / undo. Errors that need action use a dialog or inline message. | P1 |
| `Badge` | Small label | Counts, statuses | P1 |
| `Card` | Content container | Base for `Widget` | P1 |
| `Skeleton`, `EmptyState`, `ErrorState` | Loading / nothing / failure | See interaction patterns | P1 |
| `Banner` | Full-width notice | Connection lost, demo mode, maintenance notices | P1 |

## Industrial building blocks (`packages/ui`)

| Component | What it is | Usage guidance | Phase |
|---|---|---|---|
| `HealthBadge` | Health state with colour + icon + label | The **only** way to show health. Compact (icon only) and full variants. | P1 |
| `SeverityIcon` | Alarm priority icon | Shape differs per priority | P1 |
| `Quantity` | A value with its unit, formatted for the user's unit system | The **only** way to show measurements | P1 |
| `FreshnessBadge` | "updated 12 s ago" / stale warning | Every widget | P1 |
| `KpiCard` | Big number + trend + sparkline + target | Trend arrow colour depends on whether up is good or bad for that KPI | P1 |
| `Widget` | Frame with title, freshness, lineage, menu, error boundary | Wrap every dashboard tile | P1 |
| `DataTable` | Virtualized table (TanStack) | Sort, filter, column pinning, grouping, saved views | P1 |
| `AssetTree` | Hierarchy Enterprise → … → Sensor | Keyboard navigable, lazy-loads children, shows health per node | P1 |
| `AssetContextSelector` | Breadcrumb-style hierarchy picker in the top bar | Sets the scope for every page | P1 |
| `AlarmSummaryBar` | Counts per priority, always visible | Click a count → filtered alarm list | P1 |
| `AlarmList` | Live alarm table with grouping and actions | Acknowledge / shelve / create work order inline | P1 |
| `TimeRangePicker` | Live / 1 h / 24 h / 7 d / 30 d / custom / compare | Global, in the top bar | P1 |
| `UnitSystemToggle` | SI / Imperial / Oilfield | Global, in the top bar | P1 |
| `RoleSwitcher` | Demo-mode role picker | Hidden when not in demo mode | P1 |
| `CommandPalette` | Ctrl/Cmd + K search | Assets, alarms, work orders, pages, actions | P1 |
| `ConnectionStatus` | Live / degraded / disconnected indicator | Top bar | P1 |
| `WorkOrderBoard` | Kanban board of work orders | Drag between lifecycle columns | P2 |
| `ExplainabilityPanel` | Why a prediction was made (feature contributions, confidence, data quality) | Every prediction | P2 |
| `ReasonForChangeField` | Required justification input | Any action that must be audited | P1 |

## Charts (`packages/charts`)

All charts: follow the theme, have "View as table", have an accessible summary, and respect the 2,000-points-per-line budget.

| Component | What it is | Phase |
|---|---|---|
| `TimeSeriesChart` | Lines over time; min/max band; threshold bands (alert/alarm/trip); event markers; zoom & brush; several y-axes; synchronized crosshair across charts | P1 |
| `Sparkline` | Tiny trend line inside KPI cards and tables | P1 |
| `RiskMatrix` | 5×5 probability × consequence grid with assets plotted | P1 |
| `HealthBreakdownChart` | Waterfall showing what pulls the health score down | P1 |
| `RulChart` | Remaining Useful Life fan chart with confidence bands | P1 |
| `MapView` | MapLibre map with clustered health markers | P1 |
| `TimelineCanvas` | Alarms + actions + maintenance + predictions on one time axis | P1 (basic), P2 (full) |
| `Heatmap` | Grid coloured by value (e.g. inverter fleet) | P3 |
| `SpectrumPlot` | Vibration FFT with fault-frequency markers | P3 |
| `WaterfallLossChart` | Solar loss waterfall | P3 |
| `WeibullPlot` | Reliability curve fitting | P3 |
| `DuvalTriangle` | Transformer gas analysis | P3 |
| `ScatterMatrix` | Fleet comparison | P3 |
