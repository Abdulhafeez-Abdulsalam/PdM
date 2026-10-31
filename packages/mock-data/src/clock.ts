/**
 * Simulated time. Runs at `speed` × real time, so a week-long story can play in minutes.
 * All times are milliseconds since 1970 (like Date.now()).
 */
export class SimClock {
  private anchorSim: number;
  private anchorReal: number;
  private currentSpeed = 1;

  /** @param realNow where real time comes from — Date.now in the app, a fake in tests. */
  constructor(
    private readonly realNow: () => number,
    startSimTime: number,
  ) {
    this.anchorReal = realNow();
    this.anchorSim = startSimTime;
  }

  now(): number {
    return this.anchorSim + (this.realNow() - this.anchorReal) * this.currentSpeed;
  }

  get speed(): number {
    return this.currentSpeed;
  }

  /** Set simulated time (replaying the server's command log, ADR-0015). The speed stays as it is. */
  jumpTo(simTime: number): void {
    this.anchorSim = simTime;
    this.anchorReal = this.realNow();
  }

  /** Changing speed re-anchors, so simulated time never jumps. */
  setSpeed(speed: number): void {
    this.anchorSim = this.now();
    this.anchorReal = this.realNow();
    this.currentSpeed = speed;
  }
}

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** ISO 8601 UTC without milliseconds: "2026-10-10T08:00:00Z". */
export function iso(ms: number): string {
  return new Date(Math.floor(ms / SECOND) * SECOND).toISOString().replace(".000Z", "Z");
}
