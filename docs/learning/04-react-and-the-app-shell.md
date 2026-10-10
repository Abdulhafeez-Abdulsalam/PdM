# Learning note 04 — React and the app shell

*Goes with Phase 1, chunk 1. Run `npm run dev`, open http://localhost:5173, and keep it open while you read.*

## 1. What happens when you open the page

```
index.html            an almost empty page with <div id="root">
  └─ src/main.tsx     loads fonts, styles, text; starts the mock backend worker; mounts React
       └─ Providers   data cache, API, theme, role sync          (app/providers.tsx)
            └─ Router picks the page for the URL                 (app/router.tsx)
                 └─ AppShell   top bar · alarm bar · menu · <Outlet/>   (app/shell/)
                      └─ the page for this URL (for now, ModulePage placeholders)
```

## 2. Components are functions that return what to show

```tsx
export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <EmptyState title={t("notFound.title")}>
      <p>{t("notFound.body")}</p>
    </EmptyState>
  );
}
```

- The HTML-looking part is **JSX**. `{ … }` inside it is ordinary JavaScript.
- `<EmptyState title=…>` uses another component and passes it **props** (inputs).
- `t("notFound.title")` looks the words up in [en.json](../../apps/web/src/shared/text/en.json) — no sentences are typed into components.

## 3. Hooks: functions starting with `use`

Hooks let a component remember things and react to changes. The ones in this chunk:

| Hook | What it does | Where |
|---|---|---|
| `useState` | Remember a value; changing it re-draws the component | Mobile menu open/closed in [AppShell.tsx](../../apps/web/src/app/shell/AppShell.tsx) |
| `useEffect` | Do something *after* drawing (talk to the outside world) | Setting `data-theme` on `<html>` in [providers.tsx](../../apps/web/src/app/providers.tsx) |
| `usePreferences` | Read/write saved preferences (a Zustand store) | Theme, role, units |
| `useApiQuery` | Fetch data with loading/error/caching handled | Built on TanStack Query |
| `useAlarmSummary` | Alarm counts, kept live | [AlarmBar.tsx](../../apps/web/src/app/shell/AlarmBar.tsx) |
| `useTranslation` | Get `t()` for the text catalog | Everywhere |

Rule: call hooks at the top of a component, never inside `if` or loops.

## 4. Three kinds of state, three homes

| Kind | Example | Lives in | Why there |
|---|---|---|---|
| Server data | Alarm counts | TanStack Query cache | It came from the backend; the cache knows when it's stale |
| Personal preference | Theme, role | Zustand + localStorage | Survives reload; personal |
| Shareable view | Time range | The URL (`?range=7d`) | Copy the link → same view |

Try it: pick "Last 7 days", copy the address bar, open it in a new tab.

## 5. Styling with Tailwind and tokens

```tsx
<header className="flex h-14 items-center gap-3 border-b border-line bg-surface px-3">
```

Each class is one small style: `flex` (lay children in a row), `h-14` (height), `bg-surface` (background = the **surface token**). Because `bg-surface` points to a CSS variable, switching theme changes it everywhere at once.

A bug caught in this chunk: writing `` `bg-alarm-${p}` `` builds a class name at runtime. Tailwind looks for **complete class names in the source code**, never saw `bg-alarm-p1`, and wouldn't generate it — the dot would have had no colour. The fix was a lookup table with every class written out.

## 6. How the app talks to the simulated backend

```
AlarmBar → useAlarmSummary → api.request("alarms.summary") → WorkerTransport ──postMessage──▶ Worker (mock-data)
                           ↖ live "alarm_summary" messages ←────────────────────────────────┘
```

The mock backend runs in a **Web Worker** — a separate thread — so simulating ~2,000 assets never makes the page stutter. In the browser's developer tools (F12 → Sources) you can see it listed as a separate thread.

## 7. Exercises

1. **Text**: In [en.json](../../apps/web/src/shared/text/en.json), change `"enterprise": "Enterprise"` to `"enterprise": "All sites"`. Save — the page updates instantly (that's Vite's hot reload).
2. **Tokens**: In [tokens.css](../../packages/ui/src/tokens.css), change the light theme's `--pdm-accent` to `#047857` (green). Switch to the Light theme and watch every link, button and active menu item change. Change it back.
3. **Roles**: In [roles.ts](../../apps/web/src/shared/roles/roles.ts), give the Field Technician access to Reliability by changing the 7th letter of the `reliability` row from `-` to `V`. Switch role to Field Technician — does Reliability appear? Run `npm test -w @pdm/web`. Change it back.
4. **Explore**: Set speed to 3600× and start the demo storyline. Watch the phase in the Simulation panel and the alarm counts. Around "Alarm raised", does P3 go up?
5. **Read**: Open [SideNav.tsx](../../apps/web/src/app/shell/SideNav.tsx). Find the line that decides which modules show for a role. Explain it in one sentence.
