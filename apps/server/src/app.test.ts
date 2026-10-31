import { ApiRequestError, HttpTransport, createApiClient, createSessionClient } from "@pdm/api-client";
import { LIVE_CLOSE_SIGNED_OUT, endpoints, type LiveFrame, type RoleId, type ServerMessage, type SimulationStatus } from "@pdm/contracts";
import { createMockBackend } from "@pdm/mock-data";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import NodeWebSocket from "ws";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildServer } from "./app";
import { loadConfig } from "./config";
import { migrationFiles, openDatabase } from "./db";
import { openPlant } from "./plant";
import { AttemptLimiter, CONTENT_SECURITY_POLICY, SECURITY_HEADERS } from "./security";
import { SESSION_IDLE_MS, SessionStore } from "./sessions";

const START = Date.UTC(2026, 9, 10, 8, 0, 0);
/** A plant frozen at START, so answers over HTTP can be compared with the simulation's own. */
const makeBackend = () => createMockBackend({ seed: 42, startTime: START, realNow: () => 0 });

/**
 * A browser, as far as the server can tell: it signs in as someone with this role, then sends
 * the session cookie with every request and its live connection, as a real browser does by itself.
 */
async function signIn(base: string, role: RoleId, nth = 0) {
  const person = (await createSessionClient({ baseUrl: base }).people()).filter((p) => p.role === role)[nth]!;
  const response = await fetch(`${base}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: person.id }),
  });
  const cookie = response.headers.get("set-cookie")!.split(";")[0]!;
  const withCookie: typeof fetch = (url, init) => fetch(url, { ...init, headers: { ...(init?.headers as object), cookie } });
  return {
    person,
    cookie,
    setCookie: response.headers.get("set-cookie")!,
    fetch: withCookie,
    openSocket: (url: string) => new NodeWebSocket(url, { headers: { cookie } }) as unknown as WebSocket,
  };
}

describe("the server over real HTTP", () => {
  const server = buildServer({ backend: makeBackend() });
  const direct = makeBackend();
  let api: ReturnType<typeof createApiClient>;
  let transport: HttpTransport;

  beforeAll(async () => {
    // Port 0: the operating system picks a free one.
    const address = await server.listen({ port: 0, host: "127.0.0.1" });
    const planner = await signIn(address, "maintenance_planner");
    transport = new HttpTransport({ baseUrl: address, live: false, fetch: planner.fetch });
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
  });

  it("runs the simulation panel's controls, but the role comes from who signed in", async () => {
    expect((await transport.control({ type: "set_speed", speed: 60 })).speed).toBe(60);
    await expect(transport.control({ type: "set_role", role: "system_admin" })).rejects.toMatchObject({ code: "forbidden" });
    expect((await api.request("me.get", {})).role).toBe("maintenance_planner");
  });
});

describe("sign-in and the server's role checks", () => {
  let real = 0;
  const db = openDatabase(":memory:");
  const server = buildServer({ backend: makeBackend(), db, sessions: new SessionStore(db, () => real) });
  let base: string;

  beforeAll(async () => {
    base = await server.listen({ port: 0, host: "127.0.0.1" });
  });
  afterAll(() => server.close());

  const as = (who: { fetch: typeof fetch }) => createApiClient(new HttpTransport({ baseUrl: base, live: false, fetch: who.fetch }));

  it("answers nothing about the plant to someone who hasn't signed in, except who they could sign in as", async () => {
    expect((await fetch(`${base}/api/assets/CBC-GT-101`)).status).toBe(401);
    expect((await fetch(`${base}/api/simulation/status`)).status).toBe(401);
    expect(await (await fetch(`${base}/api/assets`)).json()).toMatchObject({ code: "unauthenticated" });
    expect(await createSessionClient({ baseUrl: base }).current()).toBeNull();
    expect((await createSessionClient({ baseUrl: base }).people()).length).toBeGreaterThan(11);
  });

  it("keeps the session in a cookie the page's own code can't read, and knows who it is", async () => {
    const operator = await signIn(base, "control_room_operator");
    expect(operator.setCookie).toMatch(/HttpOnly/i);
    expect(operator.setCookie).toMatch(/SameSite=Strict/i);
    expect(await createSessionClient({ baseUrl: base, fetch: operator.fetch }).current()).toEqual(operator.person);
    expect(await as(operator).request("me.get", {})).toEqual(operator.person);
  });

  it("refuses what the role may not do (403), allows what it may, and audits the real person", async () => {
    const executive = await signIn(base, "executive");
    const operator = await signIn(base, "control_room_operator", 1);
    const admin = await signIn(base, "system_admin");
    const alarm = (await as(operator).request("alarms.list", { states: ["active_unacked"], limit: 1 })).items[0]!;

    await expect(as(executive).request("alarms.acknowledge", { alarmIds: [alarm.id] })).rejects.toMatchObject({ code: "forbidden" });
    const [acked] = (await as(operator).request("alarms.acknowledge", { alarmIds: [alarm.id] })).items;
    expect(acked!.acknowledgedBy).toBe(operator.person.id);

    // The audit log is for administrators, and names the person who acted.
    await expect(as(operator).request("admin.audit", { limit: 1 })).rejects.toMatchObject({ code: "forbidden" });
    expect((await as(admin).request("admin.audit", { limit: 1 })).items[0]).toMatchObject({
      userId: operator.person.id,
      action: "alarms.acknowledge",
    });
  });

  it("applies a role change at once: the session belongs to a person, not a role", async () => {
    const operator = await signIn(base, "control_room_operator", 2);
    const admin = await signIn(base, "system_admin");
    await as(admin).request("admin.setUserRole", { userId: operator.person.id, role: "esg_lead" });
    const alarm = (await as(operator).request("alarms.list", { states: ["active_unacked"], limit: 1 })).items[0]!;
    await expect(as(operator).request("alarms.acknowledge", { alarmIds: [alarm.id] })).rejects.toMatchObject({ code: "forbidden" });
  });

  it("ends the session on sign-out, and after a shift without any requests", async () => {
    const planner = await signIn(base, "maintenance_planner");
    await createSessionClient({ baseUrl: base, fetch: planner.fetch }).signOut();
    expect((await planner.fetch(`${base}/api/assets`)).status).toBe(401);

    const engineer = await signIn(base, "reliability_engineer");
    real += SESSION_IDLE_MS - 1000;
    expect((await engineer.fetch(`${base}/api/assets`)).status).toBe(200); // that request counts as activity
    real += SESSION_IDLE_MS + 1000;
    expect((await engineer.fetch(`${base}/api/assets`)).status).toBe(401);
  });

  it("answers the copilot through the AI provider, with only the asker's tools (ADR-0016)", async () => {
    const esg = await signIn(base, "esg_lead");
    const answer = await as(esg).request("copilot.ask", { question: "Which alarms are urgent right now?" });
    expect(answer).toMatchObject({ generatedBy: "scripted" });
    expect(answer.paragraphs[0]!.text).toMatch(/outside what your role can see/);
    const tools = (await (await esg.fetch(`${base}/api/ai/tools`)).json()) as { provider: string; tools: { name: string }[] };
    expect(tools.provider).toBe("scripted");
    expect(tools.tools.map((t) => t.name)).toContain("esg.overview");
    expect(tools.tools.map((t) => t.name)).not.toContain("alarms.list");
    expect((await fetch(`${base}/api/ai/tools`)).status).toBe(401);
    expect((await as(esg).request("briefing.daily", {})).sections.length).toBeGreaterThan(0);
  });

  it("refuses changes sent from a page on another site, or as plain text", async () => {
    const planner = await signIn(base, "maintenance_planner");
    const control = (headers: Record<string, string>, body: string) =>
      planner.fetch(`${base}/api/simulation/control`, { method: "POST", headers, body });
    const json = JSON.stringify({ type: "set_chaos", enabled: false });
    expect((await control({ "Content-Type": "application/json", Origin: "https://evil.example" }, json)).status).toBe(403);
    expect((await control({ "Content-Type": "text/plain" }, json)).status).toBe(415);
    expect((await control({ "Content-Type": "application/json", Origin: base }, json)).status).toBe(200);
  });
});

describe("live values over a WebSocket", () => {
  let server: FastifyInstance;
  let base: string;
  const browsers: HttpTransport[] = [];

  /** A signed-in browser in server mode: its transport, and everything it has heard. */
  const openBrowser = async (role: RoleId = "control_room_operator") => {
    const who = await signIn(base, role);
    const transport = new HttpTransport({ baseUrl: base, fetch: who.fetch, openSocket: who.openSocket });
    browsers.push(transport);
    const heard: ServerMessage[] = [];
    const statuses: SimulationStatus[] = [];
    transport.onMessage((m) => heard.push(m));
    transport.onStatus((s) => statuses.push(s));
    let state = "";
    let signedOut = false;
    transport.onConnection((s) => (state = s));
    transport.onSignedOut(() => (signedOut = true));
    const values = (tagId: string) => heard.filter((m) => m.type === "tag_values" && m.values.some((v) => v.tagId === tagId));
    return { who, transport, heard, statuses, values, isLive: () => state === "live", isSignedOut: () => signedOut };
  };

  beforeAll(async () => {
    server = buildServer({ backend: makeBackend(), tickMs: 20 });
    base = await server.listen({ port: 0, host: "127.0.0.1" });
  });
  afterAll(async () => {
    for (const b of browsers) b.close();
    await server.close();
  });

  it("streams the tags a browser asks for, and only to that browser", async () => {
    const a = await openBrowser();
    const b = await openBrowser();
    await vi.waitFor(() => expect(a.isLive() && b.isLive()).toBe(true));
    a.transport.send({ type: "subscribe_tags", tagIds: ["CBC-GT-101.POWER"] });
    await vi.waitFor(() => expect(a.values("CBC-GT-101.POWER").length).toBeGreaterThan(0));
    expect(b.values("CBC-GT-101.POWER")).toHaveLength(0);
  });

  it("shares one plant: a change of speed in one browser reaches the other", async () => {
    const a = await openBrowser();
    const b = await openBrowser("executive");
    await vi.waitFor(() => expect(a.isLive() && b.isLive()).toBe(true));
    await a.transport.control({ type: "set_speed", speed: 600 });
    await vi.waitFor(() => expect(b.statuses.at(-1)?.speed).toBe(600));
  });

  it("reconnects after the connection drops, and asks for its tags again", async () => {
    const a = await openBrowser();
    a.transport.send({ type: "subscribe_tags", tagIds: ["CBC-GT-101.EXH_TEMP"] }); // before it's even open
    await vi.waitFor(() => expect(a.values("CBC-GT-101.EXH_TEMP").length).toBeGreaterThan(0));
    a.transport.setDisconnected(true);
    expect(a.isLive()).toBe(false);
    a.heard.length = 0;
    a.transport.setDisconnected(false);
    await vi.waitFor(() => expect(a.values("CBC-GT-101.EXH_TEMP").length).toBeGreaterThan(0));
  });

  it("answers a message that isn't a live message with an error, and stays open", async () => {
    const who = await signIn(base, "executive");
    const socket = who.openSocket(`${base.replace("http", "ws")}/api/live`);
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

  it("closes the live connection of someone not signed in, and of someone who signs out", async () => {
    const stranger = new NodeWebSocket(`${base.replace("http", "ws")}/api/live`);
    const code = await new Promise<number>((resolve) => stranger.on("close", (c) => resolve(c)));
    expect(code).toBe(LIVE_CLOSE_SIGNED_OUT);

    const a = await openBrowser();
    await vi.waitFor(() => expect(a.isLive()).toBe(true));
    await createSessionClient({ baseUrl: base, fetch: a.who.fetch }).signOut();
    await vi.waitFor(() => expect(a.isSignedOut()).toBe(true));
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

describe("keeping what people do across a restart (ADR-0015)", () => {
  const folder = mkdtempSync(join(tmpdir(), "pdm-db-"));
  const file = join(folder, "pdm.sqlite");
  /** Real time stands still in this test, so "the same moment" is easy to compare. */
  const realNow = () => START;
  afterAll(() => rmSync(folder, { recursive: true, force: true }));

  /** Start the server on the database file, as main.ts does. */
  const start = async () => {
    const db = openDatabase(file);
    const opened = openPlant(db, { seed: 42, realNow });
    const server = buildServer({ backend: opened.backend, db });
    const base = await server.listen({ port: 0, host: "127.0.0.1" });
    const stop = async () => {
      await server.close();
      db.close();
    };
    return { ...opened, base, stop, db };
  };

  it("brings back every change, the audit log and the sessions, and applies each migration once", async () => {
    const first = await start();
    expect(first.replayed).toBe(0);
    const operator = await signIn(first.base, "control_room_operator");
    const planner = await signIn(first.base, "maintenance_planner");
    const admin = await signIn(first.base, "system_admin");
    const as = (who: { fetch: typeof fetch }, base: string) =>
      createApiClient(new HttpTransport({ baseUrl: base, live: false, fetch: who.fetch }));

    const alarm = (await as(operator, first.base).request("alarms.list", { states: ["active_unacked"], limit: 1 })).items[0]!;
    await as(operator, first.base).request("alarms.acknowledge", { alarmIds: [alarm.id] });
    const wo = await as(planner, first.base).request("workOrders.create", {
      title: "Replace the seal",
      description: "",
      assetId: alarm.assetId,
      type: "corrective",
      priority: "urgent",
      assigneeId: null,
      dueAt: null,
      source: { kind: "manual", refId: null },
      evidence: null,
    });
    await as(admin, first.base).request("admin.setLimits", { tagId: "CBC-GT-101.EXH_TEMP", limits: { highAlert: 600, highAlarm: 615 } });
    await new HttpTransport({ baseUrl: first.base, live: false, fetch: planner.fetch }).control({ type: "set_speed", speed: 600 });
    const before = {
      audit: await as(admin, first.base).request("admin.audit", { limit: 50 }),
      wo: await as(planner, first.base).request("workOrders.get", { workOrderId: wo.id }),
      alarms: await as(admin, first.base).request("alarms.list", { limit: 200, sort: "newest" }),
    };
    expect(before.audit.items.map((e) => e.action)).toEqual(["admin.setLimits", "workOrders.create", "alarms.acknowledge"]);
    // The session token itself is never stored, only its fingerprint.
    const tokens = first.db.prepare("SELECT token_hash FROM sessions").all() as { token_hash: string }[];
    expect(tokens.some((t) => planner.cookie.includes(t.token_hash))).toBe(false);
    await first.stop();

    // Stop, start again on the same file.
    const second = await start();
    expect(second.replayed).toBe(4);
    try {
      // Still signed in: the same cookie works after the restart.
      expect(await createSessionClient({ baseUrl: second.base, fetch: planner.fetch }).current()).toEqual(planner.person);
      expect(await as(admin, second.base).request("admin.audit", { limit: 50 })).toEqual(before.audit);
      expect(await as(planner, second.base).request("workOrders.get", { workOrderId: wo.id })).toEqual(before.wo);
      expect(await as(admin, second.base).request("alarms.list", { limit: 200, sort: "newest" })).toEqual(before.alarms);
      expect(second.backend.status().speed).toBe(600);
      const tag = await as(admin, second.base).request("data.tags", { search: "CBC-GT-101.EXH_TEMP", limit: 1 });
      expect(tag.items[0]!.limits).toMatchObject({ highAlert: 600, highAlarm: 615 });
      // Each migration ran once, on the first start.
      expect(second.db.prepare("SELECT count(*) AS n FROM schema_migrations").get()).toEqual({ n: migrationFiles().length });
    } finally {
      await second.stop();
    }
  });

  it("keeps the plant the database was made with, whatever SEED says", () => {
    const db = openDatabase(file);
    const opened = openPlant(db, { seed: 7, realNow });
    expect(opened.keptSeed).toBe(42);
    db.close();
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

describe("running it properly (ADR-0017)", () => {
  it("puts the security headers, Content Security Policy included, on every answer", async () => {
    const server = buildServer({ backend: makeBackend() });
    for (const url of ["/api/health", "/api/assets", "/api/nowhere"]) {
      const response = await server.inject({ method: "GET", url });
      for (const [name, value] of Object.entries(SECURITY_HEADERS))
        expect(response.headers[name.toLowerCase()], `${url} ${name}`).toBe(value);
    }
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self'");
    expect(CONTENT_SECURITY_POLICY).not.toContain("unsafe");
    await server.close();
  });

  it("says whether it can reach its database", async () => {
    const server = buildServer({ backend: makeBackend() });
    expect((await server.inject({ method: "GET", url: "/api/health" })).json()).toMatchObject({ ok: true, database: "ok" });
    await server.close();
  });

  it("limits sign-in attempts from one address, then lets it try again after a while", async () => {
    let now = 0;
    const server = buildServer({ backend: makeBackend(), signInLimiter: new AttemptLimiter(3, 60_000, () => now) });
    const attempt = () => server.inject({ method: "POST", url: "/api/session", payload: { userId: "NOBODY" } });
    for (let i = 0; i < 3; i++) expect((await attempt()).statusCode).toBe(404); // counted, even though they fail
    const refused = await attempt();
    expect(refused.statusCode).toBe(429);
    expect(refused.json()).toMatchObject({ code: "rate_limited" });
    expect(Number(refused.headers["retry-after"])).toBeGreaterThan(0);
    now += 60_000;
    expect((await attempt()).statusCode).toBe(404);
    await server.close();
  });

  it("serves the built app: its files cached for a year, its pages always fresh, the API untouched", async () => {
    const dist = mkdtempSync(join(tmpdir(), "pdm-dist-"));
    mkdirSync(join(dist, "assets"));
    writeFileSync(join(dist, "index.html"), "<!doctype html><title>PdM</title>");
    writeFileSync(join(dist, "assets", "index-abc123.js"), "console.log(1)");
    const server = buildServer({ backend: makeBackend(), webDist: dist });
    try {
      const page = await server.inject({ method: "GET", url: "/assets/CBC-GT-101/vibration" });
      expect(page.statusCode).toBe(200);
      expect(page.headers["content-type"]).toMatch(/text\/html/);
      expect(page.headers["cache-control"]).toBe("no-cache");
      const script = await server.inject({ method: "GET", url: "/assets/index-abc123.js" });
      expect(script.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
      const api = await server.inject({ method: "GET", url: "/api/nowhere" });
      expect(api.statusCode).toBe(404);
      expect(api.json()).toMatchObject({ code: "not_found" });
    } finally {
      await server.close();
      rmSync(dist, { recursive: true, force: true });
    }
  });

  it("checks its settings at start-up and says which one is wrong", () => {
    expect(() => loadConfig({ PORT: "eighty" })).toThrow(/PORT/);
    expect(() => loadConfig({ LOG_LEVEL: "loud" })).toThrow(/LOG_LEVEL/);
    expect(() => loadConfig({ WEB_DIST: join(tmpdir(), "no-such-build") })).toThrow(/WEB_DIST/);
    expect(loadConfig({})).toMatchObject({ port: 4000, host: "127.0.0.1", seed: 20261010, logLevel: "info", cookieSecure: false });
    expect(loadConfig({ COOKIE_SECURE: "true", PORT: "8080" })).toMatchObject({ port: 8080, cookieSecure: true });
  });
});
