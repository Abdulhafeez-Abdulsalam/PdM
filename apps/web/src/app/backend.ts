/**
 * Chooses where data comes from (ADR-0004). By default, demo mode: the mock backend in a Web
 * Worker. In Vite's "server" mode (`npm run dev:connected` runs `vite --mode server`), the PdM
 * server instead, over HTTP on the same address (Vite forwards /api to it). Nothing else changes.
 */
import {
  HttpTransport,
  LiveClient,
  WorkerTransport,
  createApiClient,
  createSessionClient,
  type ApiContextValue,
  type SessionClient,
  type Transport,
} from "@pdm/api-client";
// Vite's "?worker" import bundles the file as a separate Web Worker script.
import MockBackendWorker from "@pdm/mock-data/worker?worker";

/** Server mode: a real server, so people sign in (ADR-0014). Demo mode has a role picker instead. */
export const SERVER_MODE = import.meta.env.MODE === "server";

export function createBackend(): ApiContextValue {
  const transport: Transport = SERVER_MODE ? new HttpTransport() : new WorkerTransport(new MockBackendWorker());
  // The browser knows when the network goes away (Wi-Fi off, out of coverage); pass that on.
  if (!navigator.onLine) transport.setDisconnected(true);
  window.addEventListener("offline", () => transport.setDisconnected(true));
  window.addEventListener("online", () => transport.setDisconnected(false));
  return { transport, api: createApiClient(transport), live: new LiveClient(transport) };
}

/** Signing in and out (server mode only). */
export function createSession(): SessionClient {
  return createSessionClient();
}
