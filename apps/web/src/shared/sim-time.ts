/**
 * "Now" for data purposes. In demo mode that's the simulation's clock (which can run at
 * 3600×); with a real backend it's the real clock.
 */
import { useSimulationStatus } from "@pdm/api-client";
import type { TimeRange } from "./time-range";
import { rangeWindow } from "./time-range";

export function useSimNow(): { now: number; speed: number } {
  const status = useSimulationStatus();
  return status ? { now: Date.parse(status.simTime), speed: status.speed } : { now: Date.now(), speed: 1 };
}

/**
 * The time window for a range, with its end rounded so the request (and its cache key)
 * only changes every few seconds/minutes rather than every second.
 */
export function roundedWindow(range: TimeRange, now: number): { from: number; to: number } {
  const step = range === "live" || range === "1h" ? 10_000 : range === "24h" ? 60_000 : 300_000;
  return rangeWindow(range, Math.floor(now / step) * step);
}

/** ISO 8601 without milliseconds, as the contracts use. */
export function toIso(ms: number): string {
  return new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(".000Z", "Z");
}
