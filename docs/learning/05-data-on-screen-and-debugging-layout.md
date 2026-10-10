# Learning note 05 — Getting data on screen, and debugging layout

*Goes with Phase 1, chunk 2 (hierarchy picker + Command Center).*

## 1. One request, three states

Every widget fetches data the same way:

```tsx
const risks = useApiQuery("risks.top", { scopeId, limit: 5 }, { refetchInterval: 30_000 });
```

`risks` is in one of three states, and the widget must handle all of them:

| State | `risks.isPending` | `risks.isError` | `risks.data` | What the user sees |
|---|---|---|---|---|
| Loading | true | false | undefined | Skeleton shaped like the content |
| Failed | false | true | undefined | "Couldn't load" + Retry button |
| Ready | false | false | the data | The table |

Writing that in every widget would be repetitive, so [DashboardWidget.tsx](../../apps/web/src/shared/widgets/DashboardWidget.tsx) does it once. A widget just passes `query={risks}`.

`refetchInterval: 30_000` asks again every 30 seconds — the "Updated 5 sec. ago" label shows how fresh the data is, and turns orange if it gets stale.

## 2. The cache key is the question

TanStack Query stores answers under a key: `["risks.top", { scopeId: "R-ME", limit: 5 }]`. Change the scope and the key changes → it's a *different question* → fetch again. Go back to the previous scope and the answer is already in the cache → instant.

You'll see `placeholderData: keepPreviousData` in [ScopeSelector.tsx](../../apps/web/src/features/hierarchy/ScopeSelector.tsx). It means "while the new answer loads, keep showing the old one". Without it, the picker briefly flashed back to the top level each time you clicked — a bug found by clicking through it in the browser.

## 3. State in the URL

`?scope=R-ME&range=7d` — the hierarchy scope and time range live in the address. That's why:
- Copying the link gives a colleague the same view.
- The browser's Back button undoes a scope change.
- Every widget reads the scope from the same place (`useGlobalSearch()`), so they always agree.

## 4. Lazy loading

The map library is about 1 MB. Most visits to most pages don't need it, so:

```tsx
const MapCanvas = lazy(() => import("./MapCanvas"));
…
<Suspense fallback={<Skeleton … />}>
  <MapCanvas … />
</Suspense>
```

`import()` with brackets loads a file *on demand*. The build output proves it worked — the map is its own file:

```
index-….js       195 kB (gzipped)   ← loaded on every visit
MapCanvas-….js   284 kB (gzipped)   ← only when a map is shown
```

## 5. Three layout bugs found in the browser (not by tests)

All tests passed. These were found by **looking at the running app**:

| Symptom | Cause | Fix |
|---|---|---|
| Map area blank, "Worker failed to load" | Vite's dependency optimiser repackaged MapLibre and broke the path to its internal worker | `optimizeDeps.exclude: ["maplibre-gl"]` in [vite.config.ts](../../apps/web/vite.config.ts) |
| Whole page scrolled, white gap at the bottom | MapLibre's CSS forced the map container to `position: relative`, overriding our `absolute`; the container collapsed to 0 px and the canvas spilled out | Give the container its own height: `h-[360px]` |
| Page still taller than the window | Screen-reader-only labels are `position: absolute`. With no positioned ancestor, they're placed relative to the *document*, stretching it | Add `relative` to the scroll container (`<main>`) |
| Map buttons stayed white in dark themes | MapLibre's CSS loads after ours (with the lazy map) and wins a tie | Raise our rule's specificity with `:root .maplibregl-…` |

How they were tracked down — techniques worth learning:
1. **Read the console** (F12 → Console). The worker error was right there.
2. **Ask the browser, don't guess**: `getComputedStyle(el).position`, `el.getBoundingClientRect()`, `document.scrollingElement.scrollHeight`.
3. **Change one thing, look again.**

## 6. Exercises

1. Open the Command Center, pick a site from the hierarchy picker, then press the browser's **Back** button. What happens, and why?
2. In [presets.ts](../../apps/web/src/features/command-center/presets.ts), give the Control Room Operator two more KPIs (pick from the list in `KpiKey`). Switch role and check the strip.
3. In [TopRisks.tsx](../../apps/web/src/features/command-center/TopRisks.tsx), change `limit: 5` to `limit: 10`. Does the test in `CommandCenterPage.test.tsx` still pass? Read the test to see why (or why not). Change it back.
4. Open developer tools → **Network**, reload the Command Center, and switch the Sites widget to **List** then back to **Map**. When does the `MapCanvas` file load?
5. In the console, run `getComputedStyle(document.querySelector("main")).position`. Then find the line in [AppShell.tsx](../../apps/web/src/app/shell/AppShell.tsx) that causes that answer.
