import { bearingOrders, type Vibration } from "@pdm/contracts";
import { describe, expect, it } from "vitest";
import { createMockBackend } from "./backend";
import { ApiFailure } from "./errors";
import { bearingDefect } from "./vibration";

const START = Date.UTC(2026, 9, 10, 8, 0, 0);
const b = createMockBackend({ seed: 42, startTime: START, realNow: () => 0, role: "reliability_engineer" });
const vib = (assetId: string, point?: string): Vibration => b.request("assets.vibration", { assetId, point });
const running = (v: Vibration) => v.slices.filter((s) => s.amps !== null);
const codes = (v: Vibration, i = -1) =>
  running(v)
    .at(i)!
    .findings.map((f) => f.code);

describe("vibration spectra", () => {
  it("works out bearing defect frequencies from the geometry", () => {
    const o = bearingOrders({ designation: "6309", balls: 8, ballMm: 17.462, pitchMm: 72.5, contactDeg: 0 });
    expect(o.bpfo).toBeCloseTo(3.04, 2);
    expect(o.bpfi).toBeCloseTo(4.96, 2);
    expect(o.ftf).toBeCloseTo(0.38, 2);
    expect(o.bsf).toBeCloseTo(1.96, 2);
  });

  it("adds up to the vibration tag's reading, week after week", () => {
    const v = vib("PBU-PMP-106");
    expect(v.slices).toHaveLength(13);
    for (const s of running(v)) {
      const total = Math.sqrt(s.amps!.reduce((e, a) => e + a * a, 0));
      expect(total / s.overall!).toBeGreaterThan(0.98);
      expect(total / s.overall!).toBeLessThan(1.02);
    }
  });

  it("shows a worn rolling bearing at its defect frequency, before the overall level alarms", () => {
    const v = vib("PBU-PMP-106");
    const fault = b.world.faultsOf("PBU-PMP-106").find((f) => f.type.id === "bearing_wear")!;
    const code = bearingDefect(fault) === "outer" ? "bearing_outer_race" : "bearing_inner_race";
    const hits = running(v).map((s) => s.findings.find((f) => f.code === code));
    expect(hits.at(-1)).toBeDefined();
    expect(hits.at(-1)!.amplitude).toBeGreaterThan(hits.find((h) => h)!.amplitude);
    // The spectrum sees it while the overall level is still under its alert limit.
    expect(hits.some((h) => h?.level === "watch")).toBe(true);
    expect(v.orbit).toBeNull(); // rolling bearings: no proximity probes, no orbit
  });

  it("finds nothing wrong with the bearings of healthy pumps", () => {
    const healthy = [...b.world.assets.values()].filter(
      (a) => a.data.assetClass === "pump" && a.staticStatus === "normal" && b.world.faultsOf(a.data.id).length === 0,
    );
    expect(healthy.length).toBeGreaterThan(20);
    for (const a of healthy.slice(0, 20)) {
      for (const s of vib(a.data.id).slices) {
        expect(s.findings.map((f) => f.code)).not.toContain("bearing_outer_race");
        expect(s.findings.map((f) => f.code)).not.toContain("bearing_inner_race");
      }
    }
  });

  it("shows oil whirl on a worn journal bearing, with an orbit", () => {
    const v = vib("EBC-GT-102");
    expect(v.bearing.kind).toBe("journal");
    expect(codes(v)).toContain("oil_whirl");
    expect(v.orbit!.points).toHaveLength(7 * v.orbit!.pointsPerRev + 1);
    expect(v.orbit!.pkPkXUm).toBeGreaterThan(5);
  });

  it("shows flow noise on the bearing nearest the compressor heading for surge", () => {
    expect(codes(vib("GCM-CMP-105", "BRG2_VIB"))).toContain("flow_instability");
    expect(codes(vib("GCM-CMP-105", "BRG1_VIB"))).not.toContain("flow_instability");
    // It opens on the worse point.
    expect(vib("GCM-CMP-105").point).toBe("BRG2_VIB");
  });

  it("refuses equipment without vibration measurements and unknown points", () => {
    expect(() => vib("PBU-PMP-106", "BRG9_VIB")).toThrowError(ApiFailure);
    const tx = [...b.world.assets.values()].find((a) => a.data.assetClass === "transformer")!;
    expect(() => vib(tx.data.id)).toThrowError(ApiFailure);
  });
});
