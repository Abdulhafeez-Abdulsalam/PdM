/**
 * Transport for server mode (ADR-0004, Phase 5): talks to the PdM server over HTTP, building
 * each request with the shared toHttpRequest so the browser and the server agree on the format.
 * The rest of the app can't tell it from the WorkerTransport.
 *
 * Live tag values, alarm changes and the simulation status arrive over one WebSocket (ADR-0013),
 * as the same "live" and "status" messages the worker posts. If the connection drops, it is
 * opened again (waiting a little longer each time), and the new connection is told again which
 * tags and alarms this browser is watching.
 *
 * Who is asking travels in the session cookie (ADR-0014), which the browser attaches by itself.
 * When the server says nobody is signed in (a 401, or the live connection closed with
 * LIVE_CLOSE_SIGNED_OUT), the transport stops reconnecting and tells onSignedOut listeners, so the
 * app can show the sign-in page; after signing in, resume() starts again.
 */
import {
  API_PREFIX,
  ApiError,
  LIVE_CLOSE_SIGNED_OUT,
  LIVE_PATH,
  toHttpRequest,
  type ClientMessage,
  type EndpointName,
  type LiveFrame,
  type ServerMessage,
  type SimulationControl,
  type SimulationStatus,
} from "@pdm/contracts";
import { ApiRequestError, type ConnectionState, type Transport } from "./transport";

const REQUEST_TIMEOUT_MS = 15_000;
const NO_CONNECTION = { code: "unavailable", message: "No connection" } as const;
/** Wait before reconnecting: 1 s, then 2, 4, 8, and at most 10 s, so a stopped server isn't hammered. */
const RETRY_FIRST_MS = 1000;
const RETRY_MAX_MS = 10_000;

export interface HttpTransportOptions {
  /** Where the server is: "" (same site, the default) or e.g. "http://127.0.0.1:4000". */
  baseUrl?: string;
  /** Tests pass a fake; the default is the browser's (or Node's) fetch. */
  fetch?: typeof fetch;
  /** Open the live connection. Off in tests that only make requests. */
  live?: boolean;
  /** Tests open the WebSocket themselves (to send a cookie, which a browser does by itself). */
  openSocket?: (url: string) => WebSocket;
}

export class HttpTransport implements Transport {
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;
  private readonly live: boolean;
  private readonly inFlight = new Set<AbortController>();
  private readonly messageHandlers = new Set<(m: ServerMessage) => void>();
  private readonly statusHandlers = new Set<(s: SimulationStatus) => void>();
  private readonly connectionHandlers = new Set<(s: ConnectionState) => void>();
  private readonly signedOutHandlers = new Set<() => void>();
  private readonly openSocket: (url: string) => WebSocket;
  private connection: ConnectionState = "connecting";
  private lastStatus: SimulationStatus | null = null;
  private disconnected = false;
  private closed = false;
  /** The server said nobody is signed in: stop reconnecting until resume(). */
  private signedOut = false;
  private socket: WebSocket | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = RETRY_FIRST_MS;
  /** What this browser is watching, so a new connection can be told again. */
  private readonly watchedTags = new Set<string>();
  private watchedAlarms: string | null = null;

  constructor({
    baseUrl = "",
    fetch: fetchImpl = globalThis.fetch.bind(globalThis),
    live = true,
    openSocket = (url) => new WebSocket(url),
  }: HttpTransportOptions = {}) {
    this.baseUrl = baseUrl;
    this.fetch = fetchImpl;
    this.live = live;
    this.openSocket = openSocket;
    this.openLive();
  }

  private setConnection(state: ConnectionState): void {
    if (state === this.connection) return;
    this.connection = state;
    for (const h of this.connectionHandlers) h(state);
  }

  // ─── Requests (HTTP) ───────────────────────────────────────────────────────

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
    // With a live connection, that connection says whether we're live; without one, an answer does.
    if (!this.live || this.socket?.readyState === WebSocket.OPEN) this.setConnection("live");
    if (response.status === 401) this.reportSignedOut();
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
    const status = (await this.call("POST", `${API_PREFIX}/simulation/control`, control)) as SimulationStatus;
    this.publishStatus(status);
    return status;
  }

  private publishStatus(status: SimulationStatus): void {
    this.lastStatus = status;
    for (const h of this.statusHandlers) h(status);
  }

  // ─── Live (WebSocket) ──────────────────────────────────────────────────────

  private liveUrl(): string {
    const url = new URL(`${this.baseUrl}${API_PREFIX}${LIVE_PATH}`, globalThis.location?.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.href;
  }

  private openLive(): void {
    if (!this.live || this.closed || this.disconnected || this.signedOut || this.socket) return;
    const socket = this.openSocket(this.liveUrl());
    this.socket = socket;
    socket.onopen = () => {
      this.retryDelay = RETRY_FIRST_MS;
      this.setConnection("live");
      // A new connection knows nothing about this browser: say again what it's watching.
      if (this.watchedTags.size > 0) this.sendNow({ type: "subscribe_tags", tagIds: [...this.watchedTags] });
      if (this.watchedAlarms) this.sendNow({ type: "subscribe_alarms", scopeId: this.watchedAlarms });
    };
    socket.onmessage = (event: MessageEvent) => this.receive(event.data);
    socket.onclose = (event: CloseEvent) => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (event.code === LIVE_CLOSE_SIGNED_OUT) this.reportSignedOut();
      if (this.closed || this.disconnected || this.signedOut) return;
      this.setConnection("offline");
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.openLive();
      }, this.retryDelay);
      this.retryDelay = Math.min(this.retryDelay * 2, RETRY_MAX_MS);
    };
  }

  /** Nobody is signed in (any more): stop reconnecting and say so, once. */
  private reportSignedOut(): void {
    if (this.signedOut) return;
    this.signedOut = true;
    this.closeLive();
    for (const h of this.signedOutHandlers) h();
  }

  /** Someone has signed in: open the live connection again. */
  resume(): void {
    this.signedOut = false;
    this.retryDelay = RETRY_FIRST_MS;
    this.openLive();
  }

  onSignedOut(handler: () => void): () => void {
    this.signedOutHandlers.add(handler);
    return () => this.signedOutHandlers.delete(handler);
  }

  private closeLive(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  private receive(data: unknown): void {
    let frame: LiveFrame;
    try {
      frame = JSON.parse(String(data)) as LiveFrame;
    } catch {
      return;
    }
    if (frame.kind === "status") this.publishStatus(frame.status);
    else if (frame.kind === "live") for (const h of this.messageHandlers) h(frame.message);
  }

  private sendNow(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  send(message: ClientMessage): void {
    switch (message.type) {
      case "subscribe_tags":
        for (const id of message.tagIds) this.watchedTags.add(id);
        break;
      case "unsubscribe_tags":
        for (const id of message.tagIds) this.watchedTags.delete(id);
        break;
      case "subscribe_alarms":
        this.watchedAlarms = message.scopeId;
        break;
      case "unsubscribe_alarms":
        this.watchedAlarms = null;
        break;
      case "ping":
        break;
    }
    // Not connected yet? Nothing lost: the connection sends what's watched when it opens.
    this.sendNow(message);
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
      this.closeLive();
      this.setConnection("offline");
    } else {
      this.setConnection(this.live ? "connecting" : this.lastStatus ? "live" : "connecting");
      this.retryDelay = RETRY_FIRST_MS;
      this.openLive();
    }
  }

  close(): void {
    this.closed = true;
    this.closeLive();
    for (const abort of this.inFlight) abort.abort();
  }
}
