import { ApiRequestError, HttpTransport, createApiClient } from "@pdm/api-client";
import { endpoints } from "@pdm/contracts";
import { createMockBackend } from "@pdm/mock-data";
import type { LiveFrame, ServerMessage, SimulationStatus } from "@pdm/contracts";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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
    transport = new HttpTransport({ baseUrl: address, live: false });
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

describe("live values over a WebSocket", () => {
  const server = buildServer({ backend: makeBackend(), tickMs: 20 });
  let base: string;
  const browsers: HttpTransport[] = [];

  /** A browser in server mode: its transport, and everything it has heard. */
  const openBrowser = () => {
    const transport = new HttpTransport({ baseUrl: base });
    browsers.push(transport);
    const heard: ServerMessage[] = [];
    const statuses: SimulationStatus[] = [];
    transport.onMessage((m) => heard.push(m));
    transport.onStatus((s) => statuses.push(s));
    let state = "";
    transport.onConnection((s) => (state = s));
    const values = (tagId: string) => heard.filter((m) => m.type === "tag_values" && m.values.some((v) => v.tagId === tagId));
    return { transport, heard, statuses, values, isLive: () => state === "live" };
  };

  beforeAll(async () => {
    base = await server.listen({ port: 0, host: "127.0.0.1" });
  });
  afterAll(async () => {
    for (const b of browsers) b.close();
    await server.close();
  });

  it("streams the tags a browser asks for, and only to that browser", async () => {
    const a = openBrowser();
    const b = openBrowser();
    await vi.waitFor(() => expect(a.isLive() && b.isLive()).toBe(true));
    a.transport.send({ type: "subscribe_tags", tagIds: ["CBC-GT-101.POWER"] });
    await vi.waitFor(() => expect(a.values("CBC-GT-101.POWER").length).toBeGreaterThan(0));
    expect(b.values("CBC-GT-101.POWER")).toHaveLength(0);
  });

  it("shares one plant: a change of speed in one browser reaches the other", async () => {
    const a = openBrowser();
    const b = openBrowser();
    await vi.waitFor(() => expect(a.isLive() && b.isLive()).toBe(true));
    await a.transport.control({ type: "set_speed", speed: 600 });
    await vi.waitFor(() => expect(b.statuses.at(-1)?.speed).toBe(600));
  });

  it("reconnects after the connection drops, and asks for its tags again", async () => {
    const a = openBrowser();
    a.transport.send({ type: "subscribe_tags", tagIds: ["CBC-GT-101.EXH_TEMP"] }); // before it's even open
    await vi.waitFor(() => expect(a.values("CBC-GT-101.EXH_TEMP").length).toBeGreaterThan(0));
    a.transport.setDisconnected(true);
    expect(a.isLive()).toBe(false);
    a.heard.length = 0;
    a.transport.setDisconnected(false);
    await vi.waitFor(() => expect(a.values("CBC-GT-101.EXH_TEMP").length).toBeGreaterThan(0));
  });

  it("answers a message that isn't a live message with an error, and stays open", async () => {
    const socket = new WebSocket(`${base.replace("http", "ws")}/api/live`);
    const frames: LiveFrame[] = [];
    socket.onmessage = (event) => frames.push(JSON.parse(String(event.data)) as LiveFrame);
    await vi.waitFor(() => expect(socket.readyState).toBe(WebSocket.OPEN));
    socket.send("not json");
    socket.send(JSON.stringify({ type: "subscribe_tags", tagIds: [] }));
    await vi.waitFor(() =>
      expect(frames.filter((f) => f.kind === "live" && f.message.type === "error" && f.message.error.code === "bad_request")).toHaveLength(
        2,
      ),
    );
    expect(frames[0]?.kind).toBe("status"); // the status comes first, so the app knows "now" at once
    expect(socket.readyState).toBe(WebSocket.OPEN);
    socket.close();
  });

  it("refuses a live connection from a page on another site", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/live",
      headers: { origin: "https://evil.example", host: "127.0.0.1:4000", connection: "Upgrade", upgrade: "websocket" },
    });
    expect(response.statusCode).toBe(403);
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
