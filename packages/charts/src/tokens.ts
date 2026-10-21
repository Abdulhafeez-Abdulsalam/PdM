/** Reads design-token colours at draw time, so charts follow the current theme. */
export interface ChartColors {
  series1: string;
  series2: string;
  grid: string;
  axis: string;
  text: string;
  textMuted: string;
  surface: string;
  border: string;
  alert: string;
  alarm: string;
  trip: string;
}

function token(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export function readChartColors(): ChartColors {
  return {
    series1: token("--pdm-series-1", "#2a78d6"),
    series2: token("--pdm-series-2", "#eb6834"),
    grid: token("--pdm-grid", "#e5e7eb"),
    axis: token("--pdm-border", "#d1d5db"),
    text: token("--pdm-text-primary", "#111827"),
    textMuted: token("--pdm-text-secondary", "#4b5563"),
    surface: token("--pdm-bg-raised", "#ffffff"),
    border: token("--pdm-border", "#d1d5db"),
    // Limit lines are status, so they use the status (health) colours, never series colours.
    alert: token("--pdm-health-degraded", "#94590a"),
    alarm: token("--pdm-health-warning", "#c2410c"),
    trip: token("--pdm-health-critical", "#b91c1c"),
  };
}

/** Canvas drawing available? (Not in some test environments or locked-down browsers.) */
export function canvasAvailable(): boolean {
  try {
    return typeof document !== "undefined" && document.createElement("canvas").getContext("2d") !== null;
  } catch {
    return false;
  }
}
