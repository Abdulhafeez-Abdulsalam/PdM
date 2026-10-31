/**
 * Envelope used when the backend runs in a Web Worker (demo mode, ADR-0004).
 * A real backend doesn't use this: it speaks HTTP + WebSocket with the same payloads.
 */
import { z } from "zod";
import type { ApiError } from "./common";
import type { EndpointName } from "./endpoints";
import type { ClientMessage, ServerMessage } from "./realtime";
import { RoleId } from "./users";

/** How fast simulated time runs. 3600 = one simulated hour per real second. */
export const SIM_SPEEDS = [1, 60, 600, 3600] as const;
export type SimSpeed = (typeof SIM_SPEEDS)[number];

/** The scripted demo storyline: gas turbine compressor fouling, from first anomaly to verified repair. */
export const STORYLINE_PHASES = [
  "started",
  "anomaly_detected",
  "prediction_raised",
  "alarm_raised",
  "work_order_created",
  "repaired",
  "verified",
] as const;
export type StorylinePhase = (typeof STORYLINE_PHASES)[number];

export interface StorylineStatus {
  assetId: string;
  phase: StorylinePhase;
  startedAt: string;
  /** 0–1 through the simulated week. */
  progress: number;
}

export interface SimulationStatus {
  simTime: string;
  speed: SimSpeed;
  chaos: boolean;
  role: RoleId;
  storyline: StorylineStatus | null;
}

/**
 * Demo-only controls (the "simulation panel"). A schema, not just a type, because the server
 * receives them over the network (POST /api/simulation/control) and must check them.
 */
export const SimulationControl = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set_speed"), speed: z.union(SIM_SPEEDS.map((s) => z.literal(s))) }),
  z.object({ type: z.literal("set_chaos"), enabled: z.boolean() }),
  z.object({ type: z.literal("set_role"), role: RoleId }),
  z.object({ type: z.literal("start_storyline") }),
  z.object({ type: z.literal("get_status") }),
]);
export type SimulationControl = z.infer<typeof SimulationControl>;

/** Messages the app sends to the worker. */
export type ToWorker =
  | { kind: "request"; id: number; name: EndpointName; input: unknown }
  | { kind: "control"; id: number; control: SimulationControl }
  | { kind: "live"; message: ClientMessage };

/** Messages the worker sends to the app. Responses carry the `id` of the request they answer. */
export type FromWorker =
  | { kind: "response"; id: number; ok: true; data: unknown }
  | { kind: "response"; id: number; ok: false; error: ApiError }
  | { kind: "live"; message: ServerMessage }
  | { kind: "status"; status: SimulationStatus };
