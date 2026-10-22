import { describe, expect, it } from "vitest";
import { findMentions } from "./asset-info";
import { createMockBackend } from "./backend";
import { ApiFailure } from "./errors";

const START = Date.UTC(2026, 9, 10, 8);
const backend = () => createMockBackend({ seed: 42, startTime: START, realNow: () => 0, role: "reliability_engineer" });

describe("documents", () => {
  it("every asset has its manual, datasheet, P&ID and procedure; pressure equipment has a certificate", () => {
    const b = backend();
    const kinds = (id: string) => b.request("assets.documents", { assetId: id }).items.map((d) => d.kind);
    for (const id of ["CBC-GT-101", "GCM-PMP-106"])
      expect(kinds(id)).toEqual(expect.arrayContaining(["manual", "datasheet", "pid", "procedure"]));
    const vessel = b.request("assets.list", { assetClass: ["pressure_vessel"], limit: 1 }).items[0]!;
    expect(kinds(vessel.id)).toContain("certificate");
  });

  it("is the same every time (generated from the seed), newest first", () => {
    const one = backend().request("assets.documents", { assetId: "CBC-GT-101" }).items;
    expect(backend().request("assets.documents", { assetId: "CBC-GT-101" }).items).toEqual(one);
    expect(one.map((d) => d.issuedAt)).toEqual([...one.map((d) => d.issuedAt)].sort().reverse());
  });
});

describe("related assets", () => {
  it("links a part to its parent, and the parent to its parts", () => {
    const b = backend();
    const strings = b.request("assets.list", { assetClass: ["pv_string"], limit: 1 }).items;
    const child = strings[0]!;
    const up = b.request("assets.related", { assetId: child.id });
    expect(up.parent?.id).toBe(child.parentAssetId);
    const down = b.request("assets.related", { assetId: child.parentAssetId! });
    expect(down.children.total).toBeGreaterThan(0);
    expect(down.children.items.length).toBeLessThanOrEqual(24);
  });

  it("lists sister assets: same type, same site, worst health first, never itself", () => {
    const b = backend();
    const r = b.request("assets.related", { assetId: "CBC-GT-101" });
    expect(r.sisters.items.every((s) => s.assetClass === "gas_turbine" && s.id !== "CBC-GT-101")).toBe(true);
    const scores = r.sameArea.items.map((s) => s.healthScore);
    expect(scores).toEqual([...scores].sort((x, y) => x - y));
    expect(r.sameArea.items.some((s) => s.id === "CBC-GT-101")).toBe(false);
  });
});

describe("comments", () => {
  it("seeds a short discussion on assets with a developing fault, and none on healthy ones", () => {
    const b = backend();
    const faulty = b.request("anomalies.fleet", { state: ["anomalous"], limit: 500 }).items.map((a) => a.assetId);
    const discussed = faulty.filter((id) => b.request("assets.comments", { assetId: id }).items.length > 0);
    expect(discussed.length).toBeGreaterThan(0);
    const list = b.request("assets.comments", { assetId: discussed[0]! }).items;
    expect(list.length).toBeGreaterThanOrEqual(2);
    expect(list.some((c) => c.mentions.length > 0)).toBe(true);
    expect(b.request("assets.comments", { assetId: "CBC-GT-101" }).items).toEqual([]); // healthy until the storyline starts
  });

  it("adds a comment by the current user, works out mentions, and lists it first", () => {
    const b = backend();
    const planner = b.request("users.list", { role: "maintenance_planner", limit: 1 }).items[0]!;
    const added = b.request("assets.addComment", {
      assetId: "GCM-PMP-106",
      body: `Vibration doubled since Monday. @${planner.name} please plan a check.`,
    });
    expect(added.authorId).toBe(b.request("me.get", {}).id);
    expect(added.mentions).toEqual([planner.id]);
    expect(b.request("assets.comments", { assetId: "GCM-PMP-106" }).items[0]!.id).toBe(added.id);
  });

  it("refuses an empty comment or an unknown asset", () => {
    const b = backend();
    expect(() => b.request("assets.addComment", { assetId: "GCM-PMP-106", body: "   " })).toThrowError(ApiFailure);
    expect(() => b.request("assets.addComment", { assetId: "NOPE", body: "hello" })).toThrowError(/not found/);
  });

  it("only counts a mention with the full name", () => {
    const users = [
      { id: "u1", name: "Ada Obi" },
      { id: "u2", name: "Ada Okafor" },
    ];
    expect(findMentions("thanks @Ada Okafor", users)).toEqual(["u2"]);
    expect(findMentions("thanks @Ada", users)).toEqual([]);
  });
});
