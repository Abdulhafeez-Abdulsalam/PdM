import type { WorkOrder } from "@pdm/contracts";
import { describe, expect, it } from "vitest";
import { DAY_MS, assignLanes, bookedHours, boardDays, hoursPerDay, monthWeeks, overbooked, placeBar, startOnDay } from "./schedule";

const MON = Date.UTC(2026, 9, 12); // Monday 12 Oct 2026
const days = boardDays(MON + 5 * 3_600_000, 7); // Mon–Sun

const job = (start: string | null, hours: number) => ({ scheduledStart: start, estimatedHours: hours }) as WorkOrder;

describe("schedule arithmetic", () => {
  it("fills working days of 8 hours", () => {
    expect(hoursPerDay(3)).toEqual([3]);
    expect(hoursPerDay(8)).toEqual([8]);
    expect(hoursPerDay(20)).toEqual([8, 8, 4]);
  });

  it("starts the board at midnight of the given day", () => {
    expect(days[0]).toBe(MON);
    expect(days[6]).toBe(MON + 6 * DAY_MS);
  });

  it("places a bar on its days, clipped to the board", () => {
    expect(placeBar(job("2026-10-14T07:00:00Z", 20), days)).toMatchObject({
      column: 2,
      span: 3,
      continuesBefore: false,
      continuesAfter: false,
    });
    expect(placeBar(job("2026-10-11T07:00:00Z", 20), days)).toMatchObject({ column: 0, span: 2, continuesBefore: true });
    expect(placeBar(job("2026-10-18T07:00:00Z", 16), days)).toMatchObject({ column: 6, span: 1, continuesAfter: true });
    expect(placeBar(job("2026-10-01T07:00:00Z", 4), days)).toBeNull();
    expect(placeBar(job(null, 4), days)).toBeNull();
  });

  it("adds up a technician's hours per day and finds the overbooked ones", () => {
    const booked = bookedHours([job("2026-10-12T07:00:00Z", 6), job("2026-10-12T13:00:00Z", 4), job("2026-10-13T07:00:00Z", 12)], days);
    expect(booked).toEqual([10, 8, 4, 0, 0, 0, 0]);
    expect(overbooked(booked)).toEqual([0]); // Monday: 10 h; Tuesday's 8 h is a full day, not too much
  });

  it("stacks overlapping jobs on separate lanes and reuses free ones", () => {
    const bars = [job("2026-10-12T07:00:00Z", 16), job("2026-10-12T13:00:00Z", 4), job("2026-10-14T07:00:00Z", 4)].map((j) =>
      placeBar(j, days)!,
    );
    expect(assignLanes(bars).map((x) => x.lane)).toEqual([0, 1, 0]);
  });

  it("keeps the time of day when moving a job, and starts new work at 07:00", () => {
    expect(startOnDay(MON + 3 * DAY_MS, "2026-10-12T13:00:00.000Z")).toBe("2026-10-15T13:00:00.000Z");
    expect(startOnDay(MON, null)).toBe("2026-10-12T07:00:00.000Z");
  });

  it("lays out a month as Monday-first weeks", () => {
    const weeks = monthWeeks(2026, 9); // October 2026 starts on a Thursday
    expect(weeks).toHaveLength(5);
    expect(new Date(weeks[0]![0]!).toISOString().slice(0, 10)).toBe("2026-09-28");
    expect(new Date(weeks[0]![3]!).toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(new Date(weeks.at(-1)!.at(-1)!).toISOString().slice(0, 10)).toBe("2026-11-01");
  });
});
