# ADR-0006: Chart budget — 2,000 points per line, interval chosen by the data service

- **Status:** Accepted (replaces the spec's "1M+ points via downsampling")
- **Date:** 2026-10-10

## Context
The spec asked for charts handling 1M+ points with downsampling (LTTB), WebGL and Web Workers. The product owner asked for the smallest point count that works without any downsampling in the browser.

A screen is roughly 2,000 pixels wide. Drawing more points than pixels shows nothing extra.

## Decision
| Budget | Value |
|---|---|
| Max points per line (series) | **2,000** |
| Max lines per chart | **5** (so ≤ 10,000 points per chart) |
| Renderer | ECharts canvas (no WebGL needed) |

History requests include `from`, `to` and `maxPoints`. **The data service** (mock today, real backend later) picks the smallest "nice" interval that keeps the result under `maxPoints`:

Nice intervals: 1 s, 2 s, 5 s, 10 s, 15 s, 30 s, 1 min, 2 min, 5 min, 10 min, 15 min, 30 min, 1 h, 2 h, 6 h, 12 h, 1 day.

| Time range | Interval | Points |
|---|---|---|
| Last 1 hour | 2 s | 1,800 |
| Last 24 hours | 1 min | 1,440 |
| Last 7 days | 10 min | 1,008 |
| Last 30 days | 30 min | 1,440 |
| Last 1 year | 6 h | 1,460 |

> Correction: an earlier chat message said 7 days → 5 minutes. That gives 2,016 points, just over budget, so the rule picks 10 minutes.

Each point contains **average, minimum and maximum** for its interval:

```ts
type HistoryPoint = { t: string; avg: number; min: number; max: number; quality: "good" | "uncertain" | "bad" };
```

The chart draws `avg` as the line and `min`–`max` as a faint band. A 3-second pressure spike inside a 30-minute interval is invisible in the average but still visible in the band.

## Consequences
- ✅ No downsampling code in the browser; charts are always fast.
- ✅ Zooming in requests a shorter range, which returns a finer interval — detail comes back automatically.
- ❌ The backend must support aggregated queries. Industrial historians (OSIsoft PI / AVEVA, Aspen IP.21) already do this, so it is a realistic requirement.
- Vibration spectra (FFT) are a different data type with a fixed number of frequency bins, also kept ≤ 2,000.
