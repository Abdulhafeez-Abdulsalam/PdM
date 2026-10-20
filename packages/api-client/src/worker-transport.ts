/**
 * Transport for demo mode: talks to the mock backend running in a Web Worker
 * using the ToWorker / FromWorker messages from @pdm/contracts.
 */
import type { ClientMessage, EndpointName, FromWorker, ServerMessage, SimulationControl, SimulationStatus, ToWorker } from "@pdm/contracts";
import { ApiRequestError, type ConnectionState, type Transport } from "./transport";

const REQUEST_TIMEOUT_MS = 15_000;

/** The parts of a Worker we use — lets tests pass a fake. */
export interface WorkerLike {
  postMessage(message: ToWorker): void;
  addEventListener(type: "message", listener: (event: MessageEvent<FromWorker>) => void): void;
  terminate(): void;
}

interface Pending {
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class WorkerTransport implements Transport {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly messageHandlers = new Set<(m: ServerMessage) => void>();
  private readonly statusHandlers = new Set<(s: SimulationStatus) => void>();
  private readonly connectionHandlers = new Set<(s: ConnectionState) => void>();
  private connection: ConnectionState = "connecting";
  /** Remembered so late subscribers get the current simulation status immediately. */
  private lastStatus: SimulationStatus | null = null;

  constructor(private readonly worker: WorkerLike) {
    worker.addEventListener("message", (event) => this.receive(event.data));
  }

  private receive(msg: FromWorker): void {
    switch (msg.kind) {
      case "response": {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.ok) p.resolve(msg.data);
        else p.reject(new ApiRequestError(msg.error));
        break;
      }
      case "live":
        for (const h of this.messageHandlers) h(msg.message);
        break;
      case "status":
        this.publishStatus(msg.status);
        break;
    }
  }

  private setConnection(state: ConnectionState): void {
    if (state === this.connection) return;
    this.connection = state;
    for (const h of this.connectionHandlers) h(state);
  }

  private call(
    message: Omit<Extract<ToWorker, { kind: "request" }>, "id"> | Omit<Extract<ToWorker, { kind: "control" }>, "id">,
  ): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new ApiRequestError({ code: "unavailable", message: "The data service did not respond in time" }));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ ...message, id } as ToWorker);
    });
  }

  request(name: EndpointName, input: unknown): Promise<unknown> {
    return this.call({ kind: "request", name, input });
  }

  control(control: SimulationControl): Promise<SimulationStatus> {
    return (this.call({ kind: "control", control }) as Promise<SimulationStatus>).then((status) => {
      // Every control reply carries the latest status — share it, so the app knows the
      // simulated time straight away instead of waiting for the next once-a-second update.
      this.publishStatus(status);
      return status;
    });
  }

  private publishStatus(status: SimulationStatus): void {
    this.lastStatus = status;
    this.setConnection("live");
    for (const h of this.statusHandlers) h(status);
  }

  send(message: ClientMessage): void {
    this.worker.postMessage({ kind: "live", message });
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

  close(): void {
    this.worker.terminate();
    for (const p of this.pending.values()) clearTimeout(p.timer);
    this.pending.clear();
  }
}
