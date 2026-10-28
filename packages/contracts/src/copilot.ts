/**
 * The AI copilot (spec §6.4, ADR-0010): "ask the data a question in plain words".
 *
 * Today a scripted provider matches the question to one it anticipated and answers from the
 * platform's own data. Every paragraph cites what it came from. Suggested actions are only
 * suggestions: opening a page is a link, and anything that changes something (raising a work
 * order) needs the person to confirm it. A question it can't match gets examples of what it can
 * answer. Later a real model can sit behind the same contract, with its key kept on a server.
 */
import { z } from "zod";
import { Citation } from "./briefing";
import { Id, ScopeId, Timestamp } from "./common";

export const CopilotIntent = z.enum([
  "likely_failures",
  "asset_status",
  "urgent_alarms",
  "maintenance_backlog",
  "value",
  "emissions",
  "spare_parts",
  "unknown",
]);
export type CopilotIntent = z.infer<typeof CopilotIntent>;

export const AskRequest = z.object({
  question: z.string().trim().min(1).max(300),
  /** The scope the person is looking at; a site named in the question wins. */
  scopeId: ScopeId.optional(),
});
export type AskRequest = z.infer<typeof AskRequest>;

export const CopilotAction = z.discriminatedUnion("kind", [
  /** Harmless: just a link. */
  z.object({ kind: z.literal("open"), label: z.string(), path: z.string().startsWith("/") }),
  /** Changes something: the person must confirm it first. */
  z.object({
    kind: z.literal("create_work_order"),
    label: z.string(),
    assetId: Id,
    predictionId: Id,
    title: z.string(),
  }),
]);
export type CopilotAction = z.infer<typeof CopilotAction>;

export const CopilotAnswer = z.object({
  question: z.string(),
  intent: CopilotIntent,
  /** "scripted" today; a model's name later (ADR-0010). */
  generatedBy: z.string(),
  answeredAt: Timestamp,
  /** How the question was read, e.g. "Pumps · Gulf Coast Midstream · next 30 days". */
  understoodAs: z.string().nullable(),
  /** Each with what it came from; an unknown question's examples cite nothing. */
  paragraphs: z.array(z.object({ text: z.string().min(1), citations: z.array(Citation) })),
  actions: z.array(CopilotAction),
  /** Questions worth asking next. */
  followUps: z.array(z.string()),
});
export type CopilotAnswer = z.infer<typeof CopilotAnswer>;
