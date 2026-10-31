import { ENTERPRISE_SCOPE, type ServerMessage } from "@pdm/contracts";
import { beforeAll, describe, expect, it } from "vitest";
import { createMockBackend, type MockBackend } from "./backend";
import { DAY, HOUR, MINUTE, iso } from "./clock";
import { ApiFailure } from "./errors";
import { progress } from "./faults";
import { operating, tagValue } from "./signals";
import { predictionId } from "./snapshot";

const START = Date.UTC(2026, 9, 10, 8, 0, 0); // 10 Oct 2026 08:00 UTC

/** A backend whose clock we move by hand. */
function makeBackend(seed = 42) {
  let real = 0;
  const backend = createMockBackend({ seed, startTime: START, realNow: () => real });
  const advance = (simMs: number) => {
    real += simMs / backend.clock.speed;
    backend.tick();
  };
  return { backend, advance };
}

let shared: MockBackend;
beforeAll(() => {
  shared = makeBackend().backend;
});

describe("world", () => {
  it("has 3 regions, 12 sites, ~1,900 assets and their tags", () => {
    const w = shared.world;
    expect(w.sites.size).toBe(12);
    expect(w.assets.size).toBeGreaterThan(1800);
    expect(w.assets.size).toBeLessThan(2100);
    expect(w.tags.size).toBeGreaterThan(9000);
    expect(w.users).toHaveLength(44);
    expect(w.faults.length).toBeGreaterThan(40);
  });

  it("is identical for the same seed and different for another", () => {
    const again = makeBackend(42).backend;
    const other = makeBackend(7).backend;
    const top = (b: MockBackend) => b.request("risks.top", { limit: 10 }).items.map((r) => r.assetId);
    expect(top(again)).toEqual(top(shared));
    expect(top(other)).not.toEqual(top(shared));
  });
});

describe("every endpoint returns contract-valid data", () => {
  // validateOutput is on, so any shape mismatch throws.
  it("answers all 24 endpoints", () => {
    const b = shared;
    const asset = b.request("assets.list", { limit: 1 }).items[0];
    expect(asset).toBeDefined();
    const assetId = asset!.id;
    const tagId = b.request("assets.tags", { assetId }).items[0]!.id;
    const alarm = b.request("alarms.list", { limit: 1 }).items[0]!;
    const prediction = b.request("predictions.list", { limit: 1 }).items[0]!;
    const from = iso(START - DAY);
    const to = iso(START);

    b.request("me.get", {});
    b.request("users.list", { role: "field_technician" });
    b.request("hierarchy.node", { nodeId: ENTERPRISE_SCOPE });
    b.request("hierarchy.children", { nodeId: ENTERPRISE_SCOPE });
    b.request("hierarchy.path", { nodeId: assetId });
    b.request("sites.list", {});
    b.request("assets.get", { assetId });
    b.request("timeseries.history", { tagIds: [tagId], from, to });
    b.request("timeseries.latest", { tagIds: [tagId] });
    b.request("risks.top", {});
    b.request("predictions.get", { predictionId: prediction.id });
    b.request("alarms.summary", {});
    b.request("events.list", { from, to });
    b.request("kpis.get", {});
    b.request("briefing.daily", { scopeId: "CBC" });
    b.request("workOrders.list", {});
    expect(alarm.id).toMatch(/^ALM-/);
  });

  it("rejects bad input with bad_request", () => {
    expect(() => shared.request("assets.list", { limit: 9999 })).toThrowError(ApiFailure);
    try {
      shared.request("risks.top", { limit: 0 });
    } catch (e) {
      expect((e as ApiFailure).code).toBe("bad_request");
    }
  });

  it("returns not_found for unknown ids", () => {
    expect(() => shared.request("assets.get", { assetId: "NOPE-1" })).toThrowError(/not found/);
  });
});

describe("time series", () => {
  it("returns ≤ 2,000 points per tag at the interval ADR-0006 prescribes, with min ≤ avg ≤ max", () => {
    const res = shared.request("timeseries.history", {
      tagIds: ["CBC-GT-101.EXH_TEMP", "CBC-GT-101.POWER"],
      from: iso(START - 7 * DAY),
      to: iso(START),
    });
    expect(res.intervalSeconds).toBe(600);
    for (const s of res.series) {
      expect(s.points.length).toBeLessThanOrEqual(2000);
      expect(s.points.length).toBeGreaterThan(1000);
      for (const p of s.points) {
        expect(p.min).toBeLessThanOrEqual(p.avg);
        expect(p.avg).toBeLessThanOrEqual(p.max);
      }
    }
  });

  it("solar output follows the sun: zero at night, high at noon", () => {
    const tag = shared.world.tags.get("PCS-INV-101.AC_POWER")!;
    // Pecos is UTC−6: 00:00 local = 06:00 UTC, 12:00 local = 18:00 UTC.
    const night = tagValue(shared.world, shared.chaos, tag, Date.UTC(2026, 9, 9, 6))!;
    const noon = tagValue(shared.world, shared.chaos, tag, Date.UTC(2026, 9, 9, 18))!;
    expect(night.value).toBeLessThan(50);
    expect(noon.value).toBeGreaterThan(2000);
  });

  it("healthy equipment at steady load stays inside its alert limits", () => {
    const w = shared.world;
    let samples = 0;
    const violations: string[] = [];
    for (const asset of [...w.assets.values()].filter((a, i) => i % 7 === 0)) {
      if (asset.staticStatus !== "normal" || w.faultsOf(asset.data.id).length > 0) continue;
      for (let k = 0; k < 24; k++) {
        const t = START - k * 7 * HOUR;
        if (operating(w, asset, t).r < 1) continue; // skip stopped / ramping / night
        for (const tag of asset.tags) {
          const { lowAlert, highAlert } = tag.tag.limits;
          if (tag.flatline || (lowAlert === undefined && highAlert === undefined)) continue;
          const v = tagValue(w, shared.chaos, tag, t)?.value;
          if (v === undefined) continue;
          samples++;
          if ((highAlert !== undefined && v > highAlert) || (lowAlert !== undefined && v < lowAlert)) violations.push(`${tag.tag.id}=${v}`);
        }
      }
    }
    expect(samples).toBeGreaterThan(5000);
    expect(violations, violations.slice(0, 10).join(", ")).toHaveLength(0);
  });
});

describe("faults, health, predictions and risk", () => {
  it("an advanced fault lowers health, raises a prediction and alarms", () => {
    const w = shared.world;
    const fault = w.faults.find((f) => progress(f, START) > 0.8 && f.asset.tags.some((t) => t.template.bad))!;
    expect(fault).toBeDefined();
    const asset = shared.request("assets.get", { assetId: fault.asset.data.id });
    expect(asset.health.score).toBeLessThan(50);
    const prediction = shared.request("predictions.get", { predictionId: predictionId(fault) });
    expect(prediction.probability).toBeGreaterThan(0.7);
    expect(shared.alarms.forFault(fault).length).toBeGreaterThan(0);
  });

  it("ranks top risks by probability × consequence, each linked to a prediction", () => {
    const { items } = shared.request("risks.top", { limit: 5 });
    expect(items).toHaveLength(5);
    for (let i = 1; i < items.length; i++) expect(items[i - 1]!.riskScore).toBeGreaterThanOrEqual(items[i]!.riskScore);
    expect(items[0]!.predictionId).not.toBeNull();
  });

  it("the alarm bar has a believable mix of priorities", () => {
    const s = shared.request("alarms.summary", {});
    const active = s.active.p1 + s.active.p2 + s.active.p3 + s.active.p4;
    expect(active).toBeGreaterThan(10);
    expect(s.active.p4 + s.active.p3).toBeGreaterThan(s.active.p1);
    expect(s.shelved).toBeGreaterThan(0);
  });
});

describe("operator actions", () => {
  it("acknowledge → shelve (reason + ≤ 24 h) → unshelve", () => {
    const { backend: b } = makeBackend();
    const alarm = b.request("alarms.list", { states: ["active_unacked"], limit: 1 }).items[0]!;
    expect(alarm).toBeDefined();

    const [acked] = b.request("alarms.acknowledge", { alarmIds: [alarm.id] }).items;
    expect(acked!.state).toBe("active_acked");
    expect(acked!.acknowledgedBy).not.toBeNull();

    expect(() => b.request("alarms.shelve", { alarmId: alarm.id, reason: "ok", until: iso(START + HOUR) })).toThrowError(ApiFailure);
    expect(() =>
      b.request("alarms.shelve", { alarmId: alarm.id, reason: "Transmitter being replaced", until: iso(START + 30 * HOUR) }),
    ).toThrowError(/24 hours/);

    const shelved = b.request("alarms.shelve", { alarmId: alarm.id, reason: "Transmitter being replaced", until: iso(START + 4 * HOUR) });
    expect(shelved.state).toBe("shelved");
    expect(b.request("alarms.unshelve", { alarmId: alarm.id }).state).toBe("active_acked");
  });

  it("answers as a named person when the server says who is asking, and audits that person", () => {
    const { backend: b } = makeBackend();
    const operator = b.request("users.list", { role: "control_room_operator", limit: 2 }).items[1]!;
    expect(b.request("me.get", {}, operator.id)).toEqual(operator);
    const alarm = b.request("alarms.list", { states: ["active_unacked"], limit: 1 }).items[0]!;
    const [acked] = b.request("alarms.acknowledge", { alarmIds: [alarm.id] }, operator.id).items;
    expect(acked!.acknowledgedBy).toBe(operator.id);
    expect(b.request("admin.audit", { limit: 1 }).items[0]).toMatchObject({ userId: operator.id, action: "alarms.acknowledge" });
    // Afterwards, back to the demo role: nobody stays "signed in" inside the simulation.
    expect(b.request("me.get", {}).role).toBe("executive");
  });

  it("creating a work order from an alarm links them (acceptance criterion C)", () => {
    const { backend: b } = makeBackend();
    const alarm = b.request("alarms.list", { limit: 1 }).items[0]!;
    const technician = b.request("users.list", { role: "field_technician", limit: 1 }).items[0]!;
    const wo = b.request("workOrders.create", {
      title: `Investigate: ${alarm.message}`.slice(0, 120),
      description: "",
      assetId: alarm.assetId,
      type: "corrective",
      priority: "urgent",
      assigneeId: technician.id,
      dueAt: null,
      source: { kind: "alarm", refId: alarm.id },
      evidence: null,
    });
    expect(wo.number).toMatch(/^WO-\d+$/);
    expect(b.alarms.get(alarm.id).workOrderId).toBe(wo.id);
  });
});

describe("live data", () => {
  it("streams subscribed tags once per tick, rejects > 300 tags, and sends alarm counts", () => {
    const { backend: b, advance } = makeBackend();
    const received: ServerMessage[] = [];
    const conn = b.connect((m) => received.push(m));

    conn.handle({ type: "subscribe_tags", tagIds: ["CBC-GT-101.POWER", "CBC-GT-101.EXH_TEMP"] });
    conn.handle({ type: "subscribe_alarms", scopeId: ENTERPRISE_SCOPE });
    expect(received.some((m) => m.type === "alarm_summary")).toBe(true);

    advance(1000);
    advance(1000);
    const batches = received.filter((m) => m.type === "tag_values");
    expect(batches).toHaveLength(2);
    expect(batches.map((m) => (m.type === "tag_values" ? m.seq : -1))).toEqual([0, 1]);

    const tooMany = [...b.world.tags.keys()].slice(0, 301);
    conn.handle({ type: "subscribe_tags", tagIds: tooMany.slice(0, 300) });
    const last = received.at(-1);
    expect(last?.type === "error" && last.error.code).toBe("too_many_tags");
  });

  it("tells every open connection about an alarm change, not just the first (the server has several)", () => {
    const { backend: b } = makeBackend();
    const inboxes: ServerMessage[][] = [[], []];
    for (const inbox of inboxes) b.connect((m) => inbox.push(m)).handle({ type: "subscribe_alarms", scopeId: ENTERPRISE_SCOPE });
    const alarm = b.request("alarms.list", { states: ["active_unacked"], limit: 1 }).items[0]!;
    b.request("alarms.acknowledge", { alarmIds: [alarm.id] });
    for (const inbox of inboxes) {
      expect(inbox.some((m) => m.type === "alarm_changed" && m.alarm.id === alarm.id && m.alarm.state === "active_acked")).toBe(true);
    }
  });
});

/** The plant moves on a simulated minute at a time (ADR-0015), so walking through days takes seconds. */
const DAYS_LONG = 60_000;

describe("demo storyline: gas turbine compressor fouling", () => {
  it("plays out anomaly → prediction → alarm → work order → repair → verified", { timeout: DAYS_LONG }, () => {
    const { backend: b, advance } = makeBackend();
    b.control({ type: "set_speed", speed: 3600 });
    b.control({ type: "start_storyline" });
    const fault = b.world.faultsOf("CBC-GT-101").at(-1)!;
    const predId = predictionId(fault);
    const step = (days: number) => {
      for (let h = 0; h < days * 24; h++) advance(HOUR);
    };

    step(1);
    expect(() => b.request("predictions.get", { predictionId: predId })).toThrowError(/not found/);

    step(1); // day 2
    expect(b.request("predictions.get", { predictionId: predId }).status).toBe("open");

    step(2); // day 4
    const alarms = b.request("alarms.list", { assetId: "CBC-GT-101", limit: 50 }).items;
    expect(alarms.some((a) => a.tagId === "CBC-GT-101.COMP_EFF")).toBe(true);

    step(0.5); // day 4.5
    const wo = b.request("predictions.get", { predictionId: predId }).workOrderId;
    expect(wo).not.toBeNull();

    step(1); // day 5.5
    expect(b.request("assets.get", { assetId: "CBC-GT-101" }).health.state).toBe("healthy");

    step(1); // day 6.5
    const closed = b.request("predictions.get", { predictionId: predId });
    expect(closed.status).toBe("closed");
    expect(closed.feedback).toBe("true_positive");
    expect(b.status().storyline?.phase).toBe("verified");
    const timeline = b.request("events.list", { assetId: "CBC-GT-101", from: iso(START), to: iso(b.now()) }).items;
    expect(timeline.some((e) => e.title.includes("water wash completed"))).toBe(true);
  });
});

describe("chaos mode", () => {
  it("adds data gaps and bad-quality data only while it is on", () => {
    const { backend: b, advance } = makeBackend();
    const tags = [...b.world.tags.values()].filter((t) => t.asset.staticStatus === "normal" && !t.flatline).slice(0, 200);
    const count = () => {
      let gaps = 0;
      let bad = 0;
      for (const tag of tags) {
        for (let m = 0; m < 60; m += 5) {
          const r = tagValue(b.world, b.chaos, tag, b.now() - m * MINUTE);
          if (!r) gaps++;
          else if (r.quality === "bad") bad++;
        }
      }
      return { gaps, bad };
    };

    expect(count()).toEqual({ gaps: 0, bad: 0 });
    b.control({ type: "set_chaos", enabled: true });
    b.control({ type: "set_speed", speed: 3600 });
    advance(2 * HOUR);
    const withChaos = count();
    expect(withChaos.gaps).toBeGreaterThan(0);
    expect(withChaos.bad).toBeGreaterThan(0);
  });
});
