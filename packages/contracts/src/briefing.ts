import { z } from "zod";
import { HealthState, Id, ScopeId, Timestamp } from "./common";

/** Points from a sentence back to the data that supports it. Every AI claim must have at least one. */
export const Citation = z.object({
  kind: z.enum(["asset", "alarm", "prediction", "work_order", "kpi", "tag"]),
  id: Id,
  label: z.string(),
});
export type Citation = z.infer<typeof Citation>;

export const BriefingItem = z.object({
  text: z.string().min(1),
  severity: HealthState.nullable(),
  citations: z.array(Citation).min(1),
});
export type BriefingItem = z.infer<typeof BriefingItem>;

/** Section headings are keys; the UI text catalog supplies the words. */
export const BriefingSectionKey = z.enum(["what_changed", "needs_attention", "recommended_actions"]);

export const Briefing = z.object({
  scopeId: ScopeId,
  generatedAt: Timestamp,
  /** How far back "what changed" looks. */
  periodHours: z.number().int().positive(),
  /** Which AI provider wrote it: "scripted" today, a model name later (ADR-0010). */
  generatedBy: z.string(),
  sections: z.array(
    z.object({
      key: BriefingSectionKey,
      items: z.array(BriefingItem),
    }),
  ),
});
export type Briefing = z.infer<typeof Briefing>;
