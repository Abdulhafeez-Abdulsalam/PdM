/**
 * Renders the real app at a given URL, backed by the real mock backend running in-process
 * (no Web Worker needed in tests). Lets tests check whole user journeys.
 */
import { LiveClient, WorkerTransport, createApiClient, type WorkerLike } from "@pdm/api-client";
import type { FromWorker } from "@pdm/contracts";
import { ApiFailure, createMockBackend } from "@pdm/mock-data";
import { RouterProvider, createMemoryHistory } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { Providers } from "../app/providers";
import { createAppRouter } from "../app/router";

export const TEST_START = Date.UTC(2026, 9, 10, 8);
export const TEST_SEED = 42;

export function renderApp(url: string) {
  const backend = createMockBackend({ seed: TEST_SEED, startTime: TEST_START, realNow: () => TEST_START });
  let listener: ((e: MessageEvent<FromWorker>) => void) | null = null;
  const emit = (data: FromWorker) => listener?.({ data } as MessageEvent<FromWorker>);
  const live = backend.connect((message) => emit({ kind: "live", message }));

  const worker: WorkerLike = {
    addEventListener: (_type, l) => (listener = l),
    terminate: () => {},
    postMessage(msg) {
      queueMicrotask(() => {
        try {
          if (msg.kind === "request") emit({ kind: "response", id: msg.id, ok: true, data: backend.request(msg.name, msg.input as never) });
          else if (msg.kind === "control") emit({ kind: "response", id: msg.id, ok: true, data: backend.control(msg.control) });
          else live.handle(msg.message);
        } catch (e) {
          // Pass the real error code through, exactly as the worker does.
          const error = e instanceof ApiFailure ? e.toApiError() : { code: "internal" as const, message: String(e) };
          if (msg.kind !== "live") emit({ kind: "response", id: msg.id, ok: false, error });
        }
      });
    },
  };

  const transport = new WorkerTransport(worker);
  const router = createAppRouter(createMemoryHistory({ initialEntries: [url] }));
  const utils = render(
    <Providers backend={{ transport, api: createApiClient(transport), live: new LiveClient(transport) }}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...utils, backend, router, transport };
}
