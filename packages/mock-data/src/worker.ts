/**
 * Web Worker entry point. The app starts it with:
 *   new Worker(new URL("@pdm/mock-data/worker", import.meta.url), { type: "module" })
 * and then talks to it with the ToWorker / FromWorker messages from @pdm/contracts.
 */
import { LIVE_FLUSH_INTERVAL_MS, type ApiError, type FromWorker, type ToWorker } from "@pdm/contracts";
import { createMockBackend } from "./backend";
import { ApiFailure } from "./errors";

/** The bits of the worker's global scope we use (avoids needing the WebWorker type library). */
interface WorkerScope {
  postMessage(message: FromWorker): void;
  onmessage: ((event: MessageEvent<ToWorker>) => void) | null;
}

const scope = globalThis as unknown as WorkerScope;
const backend = createMockBackend();
const live = backend.connect((message) => scope.postMessage({ kind: "live", message }));

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiFailure) return error.toApiError();
  return { code: "internal", message: error instanceof Error ? error.message : String(error) };
}

scope.onmessage = (event) => {
  const msg = event.data;
  try {
    switch (msg.kind) {
      case "request":
        scope.postMessage({ kind: "response", id: msg.id, ok: true, data: backend.request(msg.name, msg.input as never) });
        break;
      case "control":
        scope.postMessage({ kind: "response", id: msg.id, ok: true, data: backend.control(msg.control) });
        break;
      case "live":
        live.handle(msg.message);
        break;
    }
  } catch (error) {
    if (msg.kind !== "live") scope.postMessage({ kind: "response", id: msg.id, ok: false, error: toApiError(error) });
  }
};

setInterval(() => {
  backend.tick();
  scope.postMessage({ kind: "status", status: backend.status() });
}, LIVE_FLUSH_INTERVAL_MS);
