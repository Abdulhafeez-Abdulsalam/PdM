# ADR-0003: ECharts for charts, MapLibre for maps

- **Status:** Accepted
- **Date:** 2026-10-10

## Context
The spec allows ECharts or Highcharts, and MapLibre or Mapbox. We need time series, heatmaps, scatter matrices, gauges, and custom engineering plots; and maps with thousands of health-coloured markers.

## Options considered
| Option | Licence | Notes |
|---|---|---|
| **ECharts** | Apache 2.0 (free) | Very wide chart range, canvas rendering, custom series for engineering plots, built-in theming |
| Highcharts | Commercial licence for company use | Excellent, but costs money for an energy company |
| **MapLibre GL** | BSD (free) | Open-source fork of Mapbox GL v1; no access token needed |
| Mapbox GL | Proprietary, usage-billed, needs a token | Token would have to live in the client |

## Decision
ECharts and MapLibre GL (with deck.gl for dense layers like pipelines and heatmaps).

## Consequences
- ✅ No licence costs or API keys.
- ✅ ECharts themes can read our design tokens, so charts follow Light / Dark / Control-Room themes.
- ❌ Base-map tiles still have to come from somewhere. Demo uses a free tile source or a simple self-hosted style; production would use the company's own GIS tiles.
- All chart use goes through wrappers in `packages/charts`, so replacing the library later touches one package.
