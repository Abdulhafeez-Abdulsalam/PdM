/**
 * Number and time formatting (design system §7). Always through the browser's Intl API —
 * never hand-built strings — so separators and units are consistent everywhere.
 */
const LOCALE = "en-US";

const number0 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const number1 = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 });
const percent0 = new Intl.NumberFormat(LOCALE, { style: "percent", maximumFractionDigits: 0 });

export function formatNumber(value: number, decimals: 0 | 1 = 0): string {
  return (decimals === 0 ? number0 : number1).format(value);
}

/** 1,234,567 → "1.2M" */
export function formatCompact(value: number): string {
  return compact.format(value);
}

/** 0.72 → "72%" */
export function formatProbability(p: number): string {
  return percent0.format(p);
}

export function formatCurrency(amount: number, currency: string, compactForm = true): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    notation: compactForm ? "compact" : "standard",
    maximumFractionDigits: compactForm ? 1 : 0,
  }).format(amount);
}

const relative = new Intl.RelativeTimeFormat(LOCALE, { numeric: "auto", style: "short" });

/** How long ago `then` was, e.g. "12 sec. ago", "3 hr. ago". */
export function formatAgo(then: number, now: number): string {
  const seconds = Math.round((then - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return relative.format(seconds, "second");
  if (abs < 3600) return relative.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), "hour");
  return relative.format(Math.round(seconds / 86400), "day");
}

/**
 * Date-time formatter honouring the user's time-zone choice (design system §7):
 * "site" = the asset's site zone, "utc", or "user" = the browser's zone.
 */
export function makeTimeFormatter(mode: "site" | "utc" | "user", siteTimeZone?: string) {
  const timeZone = mode === "utc" ? "UTC" : mode === "site" ? (siteTimeZone ?? "UTC") : undefined;
  const f = new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
  return (ms: number) => f.format(new Date(ms));
}

/** "12 Oct 2026" */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
}
