import { RULE_STEP_MINUTES } from "@pdm/contracts";
import { describe, expect, it } from "vitest";
import { createMockBackend } from "./backend";
import { ApiFailure } from "./errors";
import { tagValue } from "./signals";

const START = Date.UTC(2026, 9, 10, 8, 0, 0);
const makeBackend = () => createMockBackend({ seed: 42, startTime: START, realNow: () => 0, role: "reliability_engineer" });

describe("model registry", () => {
  it("has one production version per class, and predictions carry it", () => {
    const b = makeBackend();
    const models = b.request("models.list", {}).items;
    for (const m of models) expect(m.versions.filter((v) => v.status === "production")).toHaveLength(1);
    expect(models.some((m) => m.versions.some((v) => v.status === "candidate"))).toBe(true);
    for (const p of b.request("predictions.list", { limit: 50 }).items) expect(p.modelVersion).toBe("2.4.1");
  });

  it("approving a candidate puts it into production, retires the old one, and new predictions carry it", () => {
    const b = makeBackend();
    const open = b.request("predictions.list", { status: ["open"], limit: 200 }).items;
    const models = b.request("models.list", {}).items;
    const model = models.find((m) => m.versions.some((v) => v.status === "candidate") && open.some((p) => p.modelId === m.id))!;
    const entry = b.request("models.approve", { modelId: model.id, version: "2.5.0" });
    expect(entry.versions.find((v) => v.version === "2.5.0")).toMatchObject({
      status: "production",
      approvedBy: b.request("me.get", {}).id,
    });
    expect(entry.versions.find((v) => v.version === "2.4.1")!.status).toBe("retired");
    const prediction = b.request("predictions.list", { status: ["open"], limit: 200 }).items.find((p) => p.modelId === model.id)!;
    expect(prediction.modelVersion).toBe("2.5.0");
    expect(b.request("admin.audit", {}).items[0]).toMatchObject({
      action: "models.approve",
      targetId: model.id,
      detail: "2.5.0 into production",
    });
    // Only a candidate can be approved or rejected.
    expect(() => b.request("models.approve", { modelId: model.id, version: "2.4.1" })).toThrowError(ApiFailure);
  });

  it("rejecting a candidate retires it and leaves production alone", () => {
    const b = makeBackend();
    const model = b.request("models.list", {}).items.find((m) => m.versions.some((v) => v.status === "candidate"))!;
    const entry = b.request("models.reject", { modelId: model.id, version: "2.5.0" });
    expect(entry.versions.map((v) => `${v.version}:${v.status}`)).toEqual(["2.5.0:retired", "2.4.1:production", "2.3.0:retired"]);
  });
});

describe("rules", () => {
  it("counts the spells a rule would have fired, checked against the readings by hand", () => {
    const b = makeBackend();
    const cond = { assetClass: "pump" as const, signal: "BRG1_VIB", comparator: "above" as const, threshold: 3, durationMinutes: 10 };
    const result = b.request("rules.test", cond);
    expect(result.assetsChecked).toBeGreaterThan(10);
    // Recount one asset's spells by hand.
    const hit = result.examples[0]!;
    const tag = b.world.tags.get(hit.tagId)!;
    const step = RULE_STEP_MINUTES * 60_000;
    let run = 0;
    let spells = 0;
    for (let t = Date.parse(result.from); t <= Date.parse(result.to); t += step) {
      const r = tagValue(b.world, b.chaos, tag, t);
      if (r && r.value > cond.threshold) run++;
      else {
        if (run >= 2) spells++;
        run = 0;
      }
    }
    if (run >= 2) spells++;
    expect(result.examples.filter((e) => e.tagId === hit.tagId).length).toBe(Math.min(spells, 20));
    expect(hit.peak).toBeGreaterThan(cond.threshold);
  });

  it("fires less as the threshold rises or the duration lengthens", () => {
    const b = makeBackend();
    const base = { assetClass: "pump" as const, signal: "BRG1_VIB", comparator: "above" as const, threshold: 2.5, durationMinutes: 5 };
    const loose = b.request("rules.test", base).hits;
    expect(b.request("rules.test", { ...base, threshold: 4 }).hits).toBeLessThanOrEqual(loose);
    expect(b.request("rules.test", { ...base, durationMinutes: 60 }).hits).toBeLessThanOrEqual(loose);
  });

  it("saves a rule, lists it with its hits, and switches it off", () => {
    const b = makeBackend();
    const rule = b.request("rules.create", {
      name: "Hot pump bearings",
      assetClass: "pump",
      signal: "BRG1_VIB",
      comparator: "above",
      threshold: 3.5,
      durationMinutes: 15,
      priority: "p2",
    });
    const listed = b.request("rules.overview", {}).rules.find((r) => r.id === rule.id)!;
    expect(listed.hits).toBe(b.request("rules.test", { ...rule }).hits);
    expect(b.request("rules.setEnabled", { ruleId: rule.id, enabled: false }).enabled).toBe(false);
    expect(() => b.request("rules.create", { ...rule, signal: "NOPE", name: "Bad" })).toThrowError(/no signal/);
  });
});
