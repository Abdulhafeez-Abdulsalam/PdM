/**
 * Chooses where data comes from (ADR-0004). By default, demo mode: the mock backend in a Web
 * Worker. In Vite's "server" mode (`npm run dev:connected` runs `vite --mode server`), the PdM
 * server instead, over HTTP on the same address (Vite forwards /api to it). Nothing else changes.
 */
import { HttpTransport, LiveClient, WorkerTransport, createApiClient, type ApiContextValue, type Transport } from "@pdm/api-client";
// Vite's "?worker" import bundles the file as a separate Web Worker script.
import MockBackendWorker from "@pdm/mock-data/worker?worker";

export function createBackend(): ApiContextValue {
  const transport: Transport = import.meta.env.MODE === "server" ? new HttpTransport() : new WorkerTransport(new MockBackendWorker());
  // The browser knows when the network goes away (Wi-Fi off, out of coverage); pass that on.
  if (!navigator.onLine) transport.setDisconnected(true);
  window.addEventListener("offline", () => transport.setDisconnected(true));
  window.addEventListener("online", () => transport.setDisconnected(false));
  return { transport, api: createApiClient(transport), live: new LiveClient(transport) };
}
