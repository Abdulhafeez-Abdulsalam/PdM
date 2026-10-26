import { describe, expect, it } from "vitest";
import { createMockBackend } from "./backend";
import { HOUR } from "./clock";
import { shiftAt } from "./handover";

// 08:00 UTC: two hours into the day shift.
const START = Date.UTC(2026, 9, 10, 8, 0, 0);
const makeBackend = () => createMockBackend({ seed: 42, startTime: START, realNow: () => 0, role: "control_room_operator" });

describe("shifts", () => {
  it("run 06:00–18:00 (day) and 18:00–06:00 (night) UTC", () => {
    expect(shiftAt(START)).toEqual({ name: "day", start: "2026-10-10T06:00:00Z", end: "2026-10-10T18:00:00Z" });
    expect(shiftAt(Date.UTC(2026, 9, 10, 18, 0))).toMatchObject({ name: "night", start: "2026-10-10T18:00:00Z" });
    expect(shiftAt(Date.UTC(2026, 9, 11, 5, 59))).toMatchObject({ name: "night", start: "2026-10-10T18:00:00Z" });
    expect(shiftAt(Date.UTC(2026, 9, 10, 6, 0))).toMatchObject({ name: "day", start: "2026-10-10T06:00:00Z" });
  });
});

describe("handover", () => {
  it("summarises this shift, with the previous shift's notes", () => {
    const h = makeBackend().request("handover.get", {});
    expect(h.shift.start).toBe("2026-10-10T06:00:00Z");
    expect(h.previous).toMatchObject({ name: "night", start: "2026-10-09T18:00:00Z" });
    expect(h.counts.urgentAlarms).toBeLessThanOrEqual(h.counts.alarmsRaised);
    expect(h.highlights.length).toBeLessThanOrEqual(12);
    for (const e of h.highlights) expect(Date.parse(e.t)).toBeGreaterThanOrEqual(Date.parse(h.shift.start));
    expect(h.notes.length).toBeGreaterThan(0);
    for (const n of h.notes) {
      expect(Date.parse(n.at)).toBeGreaterThanOrEqual(Date.parse(h.previous.start));
      expect(Date.parse(n.at)).toBeLessThanOrEqual(START);
    }
  });

  it("counts work created during the shift and keeps a new note, newest first", () => {
    const b = makeBackend();
    const before = b.request("handover.get", {});
    const asset = b.request("assets.list", { limit: 1 }).items[0]!;
    b.request("workOrders.create", {
      title: "Check the seal",
      description: "",
      assetId: asset.id,
      type: "corrective",
      priority: "normal",
      assigneeId: null,
      dueAt: null,
      source: { kind: "manual", refId: null },
      evidence: null,
    });
    const note = b.request("handover.addNote", { siteId: asset.siteId, text: "  Seal on the pump weeping; watch it.  " });
    expect(note.text).toBe("Seal on the pump weeping; watch it.");
    const after = b.request("handover.get", {});
    expect(after.counts.workCreated).toBe(before.counts.workCreated + 1);
    expect(after.notes[0]).toEqual(note);
  });

  it("shows a site's notes only in scopes that include it", () => {
    const b = makeBackend();
    b.request("handover.addNote", { siteId: "EBC", text: "Ebute note" });
    b.request("handover.addNote", { siteId: null, text: "For everyone" });
    const texts = (scopeId?: string) => b.request("handover.get", { scopeId }).notes.map((n) => n.text);
    expect(texts("EBC")).toEqual(expect.arrayContaining(["Ebute note", "For everyone"]));
    expect(texts("PCS")).toContain("For everyone");
    expect(texts("PCS")).not.toContain("Ebute note");
  });

  it("drops notes once they're more than a shift old", () => {
    let real = 0;
    const b = createMockBackend({ seed: 42, startTime: START, realNow: () => real, role: "control_room_operator" });
    expect(b.request("handover.get", {}).notes.length).toBeGreaterThan(0);
    real = 30 * HOUR;
    expect(b.request("handover.get", {}).notes).toEqual([]);
  });
});
