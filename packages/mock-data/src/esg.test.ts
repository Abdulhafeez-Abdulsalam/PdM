import { ESG_DAYS } from "@pdm/contracts";
import { describe, expect, it } from "vitest";
import { createMockBackend } from "./backend";

const START = Date.UTC(2026, 9, 10, 8, 0, 0);
const b = createMockBackend({ seed: 42, startTime: START, realNow: () => 0, role: "esg_lead" });
const periodStart = START - (ESG_DAYS + 1) * 86_400_000;
const hadFault = (assetId: string, typeId: string) =>
  b.world.faultsOf(assetId).some((f) => f.type.id === typeId && (f.resolvedAt === null || f.resolvedAt > periodStart) && f.start < START);

describe("emissions", () => {
  it("adds up: days to totals, sources to the total, sites to the whole", () => {
    const o = b.request("esg.overview", {});
    expect(o.days).toHaveLength(ESG_DAYS);
    const sum = (k: "combustion" | "flaring" | "methane") => o.days.reduce((s, d) => s + d[k], 0);
    expect(o.totals.combustion).toBeCloseTo(sum("combustion"), -1);
    expect(o.totals.co2e).toBeCloseTo(o.totals.combustion + o.totals.flaring + o.totals.methane, 0);
    expect(o.sites.reduce((s, x) => s + x.co2e, 0)).toBeCloseTo(o.totals.co2e, -1);
  });

  it("counts a fouling turbine's extra fuel as avoidable, and nothing much for clean ones", () => {
    const turbines = b.request("esg.overview", {}).emitters.filter((e) => e.assetClass === "gas_turbine");
    expect(turbines.length).toBeGreaterThan(3);
    for (const e of turbines) {
      if (hadFault(e.assetId, "compressor_fouling")) {
        expect(e.avoidable).toBeGreaterThan(0);
        expect(e.reason).toBe("efficiency");
      } else {
        expect(e.avoidable).toBeLessThan(0.001 * e.co2e);
      }
    }
  });

  it("counts a corroding pipeline's extra methane as an avoidable leak", () => {
    const pipes = b.request("esg.overview", { scopeId: "GCM" }).emitters.filter((e) => e.assetClass === "pipeline_segment");
    for (const e of pipes) expect(e.reason === "leak").toBe(hadFault(e.assetId, "wall_loss") && e.avoidable > 0.05);
  });

  it("gives power plants a realistic intensity, and solar parks credit for what they displace", () => {
    const o = b.request("esg.overview", {});
    for (const s of o.sites.filter((x) => x.intensity?.unit === "t_per_mwh")) {
      expect(s.intensity!.value).toBeGreaterThan(0.3);
      expect(s.intensity!.value).toBeLessThan(0.6);
    }
    const solar = b.request("esg.overview", { scopeId: "PCS" });
    expect(solar.totals.co2e).toBe(0);
    expect(solar.totals.avoided).toBeGreaterThan(0);
  });
});
