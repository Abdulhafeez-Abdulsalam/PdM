import { ApiRequestError, HttpTransport, createApiClient } from "@pdm/api-client";
import { endpoints } from "@pdm/contracts";
import { createMockBackend } from "@pdm/mock-data";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildServer } from "./app";

const START = Date.UTC(2026, 9, 10, 8, 0, 0);
/** A plant frozen at START, so answers over HTTP can be compared with the simulation's own. */
const makeBackend = () => createMockBackend({ seed: 42, startTime: START, realNow: () => 0 });

describe("the server over real HTTP", () => {
  const server = buildServer({ backend: makeBackend() });
  const direct = makeBackend();
  let api: ReturnType<typeof createApiClient>;
  let transport: HttpTransport;

  beforeAll(async () => {
    // Port 0: the operating system picks a free one.
    const address = await server.listen({ port: 0, host: "127.0.0.1" });
    transport = new HttpTransport({ baseUrl: address, pollStatus: false });
    api = createApiClient(transport);
  });
  afterAll(async () => {
    transport.close();
    await server.close();
  });

  it("answers exactly what the simulation answers, for reads with filters and path values", async () => {
    const filters = { status: ["open" as const], sort: "probability" as const, limit: 5 };
    expect(await api.request("predictions.list", filters)).toEqual(direct.request("predictions.list", filters));
    expect(await api.request("assets.get", { assetId: "CBC-GT-101" })).toEqual(direct.request("assets.get", { assetId: "CBC-GT-101" }));
    expect(await api.request("data.tags", { search: "CBC-GT-101.EXH", limit: 3 })).toEqual(
      direct.request("data.tags", { search: "CBC-GT-101.EXH", limit: 3 }),
    );
  });

  it("makes changes that the next request sees", async () => {
    const asset = (await api.request("assets.list", { limit: 1 })).items[0]!;
    const wo = await api.request("workOrders.create", {
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
    expect((await api.request("workOrders.get", { workOrderId: wo.id })).title).toBe("Check the seal");
  });

  it("turns failures into the contract's errors, with matching HTTP statuses", async () => {
    await expect(api.request("assets.get", { assetId: "NOPE" })).rejects.toMatchObject({ code: "not_found" });
    await expect(api.request("assets.list", { limit: -1 })).rejects.toBeInstanceOf(ApiRequestError);
    const address = server.addresses()[0]!;
    const base = `http://${address.address}:${address.port}`;
    const missing = await fetch(`${base}/api/nowhere`);
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({ code: "not_found" });
    const notJson = await fetch(`${base}/api/assets?limit=fifty`);
    expect(notJson.status).toBe(400);
  });

  it("runs the simulation panel's controls, and plays the demo role it's told", async () => {
    expect((await transport.control({ type: "set_speed", speed: 60 })).speed).toBe(60);
    await transport.control({ type: "set_role", role: "hse_officer" });
    expect((await api.request("me.get", {})).role).toBe("hse_officer");
    const bad = await server.inject({ method: "POST", url: "/api/simulation/control", payload: { type: "set_speed", speed: 7 } });
    expect(bad.statusCode).toBe(400);
  });
});

describe("routes", () => {
  it("has one route for every endpoint in the contracts, at its method and path", async () => {
    const server = buildServer({ backend: makeBackend() });
    await server.ready();
    for (const def of Object.values(endpoints)) {
      expect(server.hasRoute({ method: def.method, url: `/api${def.path}` }), `${def.method} ${def.path}`).toBe(true);
    }
    await server.close();
  });
});
