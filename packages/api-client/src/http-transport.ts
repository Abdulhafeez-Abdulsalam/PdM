/**
 * Transport for server mode (ADR-0004, Phase 5): talks to the PdM server over HTTP, building
 * each request with the shared toHttpRequest so the browser and the server agree on the format.
 * The rest of the app can't tell it from the WorkerTransport.
 *
 * Still to come (chunk 2): live tag values over a WebSocket. Until then the simulation status
 * (the app's "now") is fetched once a second, the pace the worker sends it, and live
 * subscriptions are accepted but nothing arrives.
 */
import {
  API_PREFIX,
  ApiError,
  LIVE_FLUSH_INTERVAL_MS,
  toHttpRequest,
  type ClientMessage,
  type EndpointName,
  type RoleId,
  type ServerMessage,
  type SimulationControl,
  type SimulationStatus,
} from "@pdm/contracts";
import { ApiRequestError, type ConnectionState, type Transport } from "./transport";

const REQUEST_TIMEOUT_MS = 15_000;
const NO_CONNECTION = { code: "unavailable", message: "No connection" } as const;
/** Chunk 1 only: tells the server which demo role this browser is playing (sessions replace it in chunk 3). */
const DEMO_ROLE_HEADER = "X-Demo-Role";

export interface HttpTransportOptions {
  /** Where the server is: "" (same site, the default) or e.g. "http://127.0.0.1:4000". */
  baseUrl?: string;
  /** Tests pass a fake; the default is the browser's (or Node's) fetch. */
  fetch?: typeof fetch;
  /** Ask the server for the simulation status once a second. Off in tests. */
  pollStatus?: boolean;
}

export class HttpTransport implements Transport {
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;
  private readonly inFlight = new Set<AbortController>();
  private readonly messageHandlers = new Set<(m: ServerMessage) => void>();
  private readonly statusHandlers = new Set<(s: SimulationStatus) => void>();
  private readonly connectionHandlers = new Set<(s: ConnectionState) => void>();
  private connection: ConnectionState = "connecting";
  private lastStatus: SimulationStatus | null = null;
  private disconnected = false;
  private role: RoleId | null = null;
  private readonly poller: ReturnType<typeof setInterval> | null;

  constructor({ baseUrl = "", fetch: fetchImpl = globalThis.fetch.bind(globalThis), pollStatus = true }: HttpTransportOptions = {}) {
    this.baseUrl = baseUrl;
    this.fetch = fetchImpl;
    this.poller = pollStatus ? setInterval(() => void this.refreshStatus(), LIVE_FLUSH_INTERVAL_MS) : null;
  }

  private setConnection(state: ConnectionState): void {
    if (state === this.connection) return;
    this.connection = state;
    for (const h of this.connectionHandlers) h(state);
  }

  /** One HTTP call; any failure becomes an ApiRequestError, as the worker's would. */
  private async call(method: "GET" | "POST", url: string, body: unknown): Promise<unknown> {
    if (this.disconnected) throw new ApiRequestError(NO_CONNECTION);
    const abort = new AbortController();
    this.inFlight.add(abort);
    const timer = setTimeout(() => abort.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await this.fetch(`${this.baseUrl}${url}`, {
        method,
        signal: abort.signal,
        headers: {
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(this.role ? { [DEMO_ROLE_HEADER]: this.role } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      // The request never got an answer: no network, the server is down, or it took too long.
      if (!this.disconnected) this.setConnection("offline");
      throw new ApiRequestError(
        abort.signal.aborted && !this.disconnected
          ? { code: "unavailable", message: "The data service did not respond in time" }
          : NO_CONNECTION,
      );
    } finally {
      clearTimeout(timer);
      this.inFlight.delete(abort);
    }
    const data: unknown = await response.json().catch(() => null);
    this.setConnection("live");
    if (!response.ok) {
      const error = ApiError.safeParse(data);
      throw new ApiRequestError(error.success ? error.data : { code: "internal", message: `Server answered ${response.status}` });
    }
    return data;
  }

  request(name: EndpointName, input: unknown): Promise<unknown> {
    let req;
    try {
      req = toHttpRequest(name, input);
    } catch (error) {
      return Promise.reject(new ApiRequestError({ code: "bad_request", message: (error as Error).message }));
    }
    return this.call(req.method, req.url, req.body);
  }

  async control(control: SimulationControl): Promise<SimulationStatus> {
    if (control.type === "set_role") this.role = control.role;
    const status = (await this.call("POST", `${API_PREFIX}/simulation/control`, control)) as SimulationStatus;
    this.publishStatus(status);
    return status;
  }

  private async refreshStatus(): Promise<void> {
    if (this.disconnected) return;
    try {
      this.publishStatus((await this.call("GET", `${API_PREFIX}/simulation/status`, undefined)) as SimulationStatus);
    } catch {
      // Already reflected in the connection state; the next tick tries again.
    }
  }

  private publishStatus(status: SimulationStatus): void {
    this.lastStatus = status;
    for (const h of this.statusHandlers) h(status);
  }

  send(message: ClientMessage): void {
    // Live subscriptions travel over the WebSocket (chunk 2); until then they're dropped.
    void message;
  }

  onMessage(handler: (m: ServerMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onStatus(handler: (s: SimulationStatus) => void): () => void {
    this.statusHandlers.add(handler);
    if (this.lastStatus) handler(this.lastStatus);
    return () => this.statusHandlers.delete(handler);
  }

  onConnection(handler: (s: ConnectionState) => void): () => void {
    this.connectionHandlers.add(handler);
    handler(this.connection);
    return () => this.connectionHandlers.delete(handler);
  }

  setDisconnected(disconnected: boolean): void {
    if (disconnected === this.disconnected) return;
    this.disconnected = disconnected;
    if (disconnected) {
      // Requests in flight are lost with the connection: fail them now rather than after the timeout.
      for (const abort of this.inFlight) abort.abort();
      this.setConnection("offline");
    } else {
      this.setConnection(this.lastStatus ? "live" : "connecting");
      void this.refreshStatus();
    }
  }

  close(): void {
    if (this.poller) clearInterval(this.poller);
    for (const abort of this.inFlight) abort.abort();
  }
}
