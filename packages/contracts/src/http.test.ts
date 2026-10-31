import { describe, expect, it } from "vitest";
import { endpoints, type EndpointName } from "./endpoints";
import { API_PREFIX, fromHttpRequest, toHttpRequest } from "./http";

/** What a server sees: the path values its router pulled out, and the query as strings. */
function receive(name: EndpointName, input: unknown) {
  const req = toHttpRequest(name, input);
  const url = new URL(req.url, "http://server");
  const template = `${API_PREFIX}${endpoints[name].path}`.split("/");
  const pathValues: Record<string, string> = {};
  url.pathname.split("/").forEach((part, i) => {
    const t = template[i]!;
    if (t.startsWith(":")) pathValues[t.slice(1)] = decodeURIComponent(part);
  });
  // Through JSON, as a real request body travels.
  const body = req.body === undefined ? undefined : JSON.parse(JSON.stringify(req.body));
  return { req, input: fromHttpRequest(name, pathValues, Object.fromEntries(url.searchParams), body) };
}

describe("requests over HTTP", () => {
  it("fills the path, and puts the rest of a GET in the query as JSON", () => {
    const { req, input } = receive("predictions.list", {
      status: ["open", "acknowledged"],
      limit: 50,
      scopeId: "EBC",
      minProbability: 0.5,
    });
    expect(req.method).toBe("GET");
    expect(req.url.startsWith("/api/predictions?")).toBe(true);
    expect(input).toEqual({ status: ["open", "acknowledged"], limit: 50, scopeId: "EBC", minProbability: 0.5 });
  });

  it("puts path values in the path, and leaves them out of the query", () => {
    const { req, input } = receive("assets.get", { assetId: "CBC-GT-101" });
    expect(req.url).toBe("/api/assets/CBC-GT-101");
    expect(input).toEqual({ assetId: "CBC-GT-101" });
  });

  it("sends a POST's input as its body, and path values can't be overridden by it", () => {
    const { req, input } = receive("admin.setLimits", { tagId: "CBC-GT-101.EXH_TEMP", limits: { highAlarm: 615 } });
    expect(req).toMatchObject({ method: "POST", url: "/api/tags/CBC-GT-101.EXH_TEMP/limits" });
    expect(input).toEqual({ tagId: "CBC-GT-101.EXH_TEMP", limits: { highAlarm: 615 } });
    expect(fromHttpRequest("admin.setLimits", { tagId: "REAL" }, {}, { tagId: "SNEAKY", limits: {} })).toMatchObject({ tagId: "REAL" });
  });

  it("round-trips strings that look like numbers, and characters that need escaping", () => {
    const { input } = receive("assets.list", { search: "101 & co/ü", limit: 5 });
    expect(input).toEqual({ search: "101 & co/ü", limit: 5 });
    expect(receive("data.tags", { search: "42" }).input).toEqual({ search: "42" });
  });

  it("refuses a query value that isn't JSON", () => {
    expect(() => fromHttpRequest("assets.list", {}, { limit: "fifty" }, undefined)).toThrow(/isn't JSON/);
  });

  it("has a method and a unique path for every endpoint", () => {
    const seen = new Set<string>();
    for (const [name, def] of Object.entries(endpoints)) {
      const key = `${def.method} ${def.path}`;
      expect(seen.has(key), `${name} repeats ${key}`).toBe(false);
      seen.add(key);
    }
  });
});
