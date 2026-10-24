import { TWIN_REPLAY_HOURS } from "@pdm/contracts";
import { describe, expect, it } from "vitest";
import { createMockBackend } from "./backend";
import { HOUR } from "./clock";
import { ApiFailure } from "./errors";

const START = Date.UTC(2026, 9, 10, 8, 0, 0);
const b = createMockBackend({ seed: 42, startTime: START, realNow: () => 0, role: "control_room_operator" });
const twin = (areaId: string, hoursAgo?: number) => b.request("twin.area", { areaId, hoursAgo });

describe("digital twin", () => {
  it("shows every asset in a process area with its health, values and limits", () => {
    const area = twin("CBC-GT1");
    expect(area.kind).toBe("process");
    expect(area.siteName).toBe("Coastal Bend CCGT");
    const ids = area.assets.map((a) => a.assetId);
    expect(ids).toContain("CBC-GT-101");
    expect(ids.length).toBe(b.world.scopeAssets("CBC-GT1").filter((a) => a.data.areaId === "CBC-GT1").length);
    for (const a of area.assets) {
      expect(a.values.length).toBeGreaterThan(0);
      expect(a.limit === "normal").toBe(a.limitTag === null);
    }
    expect(area.hours).toHaveLength(TWIN_REPLAY_HOURS + 1);
  });

  it("knows a solar block and a pipeline when it sees one", () => {
    const block = twin("PCS-BLA");
    expect(block.kind).toBe("solar");
    const strings = block.assets.filter((a) => a.assetClass === "pv_string");
    expect(strings.every((s) => s.parentAssetId && block.assets.some((a) => a.assetId === s.parentAssetId))).toBe(true);
    expect(strings[0]!.values.map((v) => v.tag)).toEqual(["CURRENT", "PERF_INDEX"]);

    const pipe = twin("GCM-PLA");
    expect(pipe.kind).toBe("pipeline");
    const segments = pipe.assets.filter((a) => a.assetClass === "pipeline_segment").sort((x, y) => x.fromKm! - y.fromKm!);
    expect(segments).toHaveLength(14);
    expect(segments[0]!.fromKm).toBe(0);
    for (let i = 1; i < segments.length; i++) expect(segments[i]!.fromKm).toBe(segments[i - 1]!.toKm);
  });

  it("replays an earlier moment, within the last 72 hours", () => {
    const now = twin("CBC-GT1");
    const earlier = twin("CBC-GT1", 24);
    expect(Date.parse(earlier.t)).toBe(START - 24 * HOUR);
    const power = (a: typeof now) => a.assets.find((x) => x.assetId === "CBC-GT-101")!.values[0]!.value;
    expect(power(earlier)).not.toBe(power(now));
    expect(twin("CBC-GT1", TWIN_REPLAY_HOURS).t).toBe(now.from);
    // Further back than the window is refused.
    expect(() => twin("CBC-GT1", TWIN_REPLAY_HOURS + 1)).toThrowError(ApiFailure);
  });

  it("doesn't count a stopped machine's low readings as past a limit, but does count a failed one", () => {
    for (const areaId of ["SHP-ENG", "SHP-GTA", "PBU-WP1", "PBU-WP2"]) {
      for (const a of twin(areaId).assets) {
        if (a.status === "stopped" || a.status === "standby") expect(a.limit).toBe("normal");
        if (a.status === "tripped") expect(a.limit).toBe("trip");
      }
    }
  });

  it("marks the hours when something was past a limit", () => {
    const hours = twin("PCS-BLC").hours.concat(twin("GCM-CS1").hours);
    expect(hours.every((h) => (h.worst === "normal") === (h.assets === 0))).toBe(true);
  });

  it("refuses ids that aren't areas", () => {
    expect(() => twin("CBC-GT-101")).toThrowError(ApiFailure);
    expect(() => twin("NOPE")).toThrowError(ApiFailure);
  });
});
