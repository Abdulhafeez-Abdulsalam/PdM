/**
 * Chooses where data comes from (ADR-0004). Today: the mock backend in a Web Worker.
 * When a real backend exists, an HttpTransport is created here instead — nothing else changes.
 */
import { LiveClient, WorkerTransport, createApiClient, type ApiContextValue } from "@pdm/api-client";
// Vite's "?worker" import bundles the file as a separate Web Worker script.
import MockBackendWorker from "@pdm/mock-data/worker?worker";

export function createBackend(): ApiContextValue {
  const transport = new WorkerTransport(new MockBackendWorker());
  return { transport, api: createApiClient(transport), live: new LiveClient(transport) };
}
