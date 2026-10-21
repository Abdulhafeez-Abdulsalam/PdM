/**
 * Chooses where data comes from (ADR-0004). Today: the mock backend in a Web Worker.
 * When a real backend exists, an HttpTransport is created here instead — nothing else changes.
 */
import { LiveClient, WorkerTransport, createApiClient, type ApiContextValue } from "@pdm/api-client";
// Vite's "?worker" import bundles the file as a separate Web Worker script.
import MockBackendWorker from "@pdm/mock-data/worker?worker";

export function createBackend(): ApiContextValue {
  const transport = new WorkerTransport(new MockBackendWorker());
  // The browser knows when the network goes away (Wi-Fi off, out of coverage); pass that on.
  if (!navigator.onLine) transport.setDisconnected(true);
  window.addEventListener("offline", () => transport.setDisconnected(true));
  window.addEventListener("online", () => transport.setDisconnected(false));
  return { transport, api: createApiClient(transport), live: new LiveClient(transport) };
}
