/**
 * The one switch point (architecture §1): the API client talks to a Transport and never
 * knows whether it's the mock worker or a real server.
 */
import type { ApiError, ClientMessage, EndpointName, ServerMessage, SimulationControl, SimulationStatus } from "@pdm/contracts";

export type ConnectionState = "connecting" | "live" | "offline";

export interface Transport {
  request(name: EndpointName, input: unknown): Promise<unknown>;
  /** Demo controls. A real-backend transport rejects these. */
  control(control: SimulationControl): Promise<SimulationStatus>;
  send(message: ClientMessage): void;
  onMessage(handler: (message: ServerMessage) => void): () => void;
  /** Simulation status (demo only; a real transport never calls this). */
  onStatus(handler: (status: SimulationStatus) => void): () => void;
  onConnection(handler: (state: ConnectionState) => void): () => void;
  /**
   * Treat the network as down (true) or back (false). Fed by the browser's offline/online
   * events, and by the demo's "Drop the connection" switch so the safety net can be tried.
   */
  setDisconnected(disconnected: boolean): void;
  close(): void;
}

/** A failed request, carrying the contract's ApiError fields. */
export class ApiRequestError extends Error {
  readonly code: ApiError["code"];
  readonly details: unknown;

  constructor(error: ApiError) {
    super(error.message);
    this.name = "ApiRequestError";
    this.code = error.code;
    this.details = error.details;
  }
}
