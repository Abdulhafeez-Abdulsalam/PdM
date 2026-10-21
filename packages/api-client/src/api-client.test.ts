/**
 * Runs the real mock backend in-process behind a fake Worker, so the client, transport,
 * contract checks and live subscriptions are tested end to end without a browser.
 */
import type { FromWorker, ToWorker } from "@pdm/contracts";
import { createMockBackend } from "@pdm/mock-data";
import { describe, expect, it } from "vitest";
import { createApiClient } from "./client";
import { LiveClient } from "./live";
import { ApiRequestError } from "./transport";
import { WorkerTransport, type WorkerLike } from "./worker-transport";

function setup() {
  let real = 0;
  const backend = createMockBackend({ seed: 42, startTime: Date.UTC(2026, 9, 10, 8), realNow: () => real });
  let listener: ((e: MessageEvent<FromWorker>) => void) | null = null;
  const emit = (data: FromWorker) => listener?.({ data } as MessageEvent<FromWorker>);
  const live = backend.connect((message) => emit({ kind: "live", message }));
  const sent: ToWorker[] = [];

  const fakeWorker: WorkerLike = {
    addEventListener: (_type, l) => (listener = l),
    terminate: () => {},
    postMessage(msg) {
      sent.push(msg);
      queueMicrotask(() => {
        try {
          if (msg.kind === "request") emit({ kind: "response", id: msg.id, ok: true, data: backend.request(msg.name, msg.input as never) });
          else if (msg.kind === "control") emit({ kind: "response", id: msg.id, ok: true, data: backend.control(msg.control) });
          else live.handle(msg.message);
        } catch (e) {
          if (msg.kind !== "live") emit({ kind: "response", id: msg.id, ok: false, error: { code: "not_found", message: String(e) } });
        }
      });
    },
  };

  const transport = new WorkerTransport(fakeWorker);
  const tick = () => {
    real += 1000;
    backend.tick();
  };
  return { api: createApiClient(transport), liveClient: new LiveClient(transport), transport, sent, tick };
}

describe("api client over the worker transport", () => {
  it("returns typed, contract-checked data", async () => {
    const { api } = setup();
    const risks = await api.request("risks.top", { limit: 3 });
    expect(risks.items).toHaveLength(3);
    expect(risks.items[0]?.rank).toBe(1);
  });

  it("turns backend errors into ApiRequestError", async () => {
    const { api } = setup();
    await expect(api.request("assets.get", { assetId: "NOPE" })).rejects.toBeInstanceOf(ApiRequestError);
  });

  it("reference-counts tag subscriptions", async () => {
    const { liveClient, sent, tick } = setup();
    const stopA = liveClient.subscribeTags(["CBC-GT-101.POWER"]);
    const stopB = liveClient.subscribeTags(["CBC-GT-101.POWER"]);
    const subscribes = () => sent.filter((m) => m.kind === "live" && m.message.type === "subscribe_tags").length;
    expect(subscribes()).toBe(1); // second widget reuses the first subscription

    await Promise.resolve();
    tick();
    expect(liveClient.getValue("CBC-GT-101.POWER")?.value).toBeGreaterThan(0);

    stopA();
    expect(sent.some((m) => m.kind === "live" && m.message.type === "unsubscribe_tags")).toBe(false);
    stopB();
    expect(sent.some((m) => m.kind === "live" && m.message.type === "unsubscribe_tags")).toBe(true);
  });

  it("fails fast while disconnected, sends nothing, and recovers when the connection returns", async () => {
    const { api, transport, sent } = setup();
    const states: string[] = [];
    transport.onConnection((s) => states.push(s));

    const inFlight = api.request("risks.top", { limit: 3 });
    transport.setDisconnected(true);
    await expect(inFlight).rejects.toMatchObject({ code: "unavailable" });

    const before = sent.length;
    await expect(api.request("risks.top", { limit: 3 })).rejects.toMatchObject({ code: "unavailable" });
    expect(sent.length).toBe(before);

    transport.setDisconnected(false);
    expect((await api.request("risks.top", { limit: 3 })).items).toHaveLength(3);
    expect(states).toEqual(["connecting", "offline", "connecting"]);
  });
});
