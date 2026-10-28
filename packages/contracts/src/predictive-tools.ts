/**
 * Predictive tools (spec §6.4, Phase 4 chunk 9): "which models do we trust, what rules fire?"
 *
 *  - Model registry: one health model per class of equipment. Each version has its backtest
 *    (how it scored on past failures before release); the production version also has live
 *    results from technicians' verdicts at close-out. A newer candidate waits for a person with
 *    `model.approve` to promote it (the old one is retired) or reject it.
 *  - Rules: simple threshold rules, "this signal above X for Y minutes on this class → P2".
 *    Before saving, a rule is tested on the last RULE_TEST_HOURS of real readings, to see how
 *    often it would have fired: the way a team tunes a rule before it floods the control room.
 */
import { z } from "zod";
import { AlarmPriority } from "./alarms";
import { AssetClass } from "./assets";
import { Id, Probability, Timestamp } from "./common";
import { Quantity } from "./quantities";

export const ModelStatus = z.enum(["production", "candidate", "retired"]);
export type ModelStatus = z.infer<typeof ModelStatus>;

export const ModelVersion = z.object({
  version: z.string(),
  status: ModelStatus,
  trainedAt: Timestamp,
  approvedAt: Timestamp.nullable(),
  approvedBy: Id.nullable(),
  /** Scored on past failures before release. */
  backtest: z.object({
    /** Of the failures it predicted, the share that really happened. */
    precision: Probability,
    /** Of the failures that happened, the share it predicted in time. */
    recall: Probability,
    /** Median warning before failure, days. */
    leadDays: z.number(),
  }),
});
export type ModelVersion = z.infer<typeof ModelVersion>;

export const ModelEntry = z.object({
  id: Id,
  assetClass: AssetClass,
  assets: z.number().int(),
  /** Newest first. */
  versions: z.array(ModelVersion),
  openPredictions: z.number().int(),
  /** Technicians' verdicts on this model's predictions, last 12 months. */
  live: z.object({
    confirmed: z.number().int(),
    falseAlarms: z.number().int(),
    somethingElse: z.number().int(),
    /** confirmed ÷ (confirmed + false alarms); null when nothing has been judged. */
    precision: Probability.nullable(),
  }),
});
export type ModelEntry = z.infer<typeof ModelEntry>;

export const ModelDecisionRequest = z.object({ modelId: Id, version: z.string() });
export type ModelDecisionRequest = z.infer<typeof ModelDecisionRequest>;

export const RULE_TEST_HOURS = 24;
/** Readings are checked every this many minutes; a rule's duration is a multiple of it. */
export const RULE_STEP_MINUTES = 5;

export const RuleCondition = z.object({
  assetClass: AssetClass,
  /** The signal's name on that class, e.g. "BRG1_VIB". */
  signal: z.string().min(1),
  comparator: z.enum(["above", "below"]),
  /** In the signal's SI unit. */
  threshold: z.number(),
  durationMinutes: z
    .number()
    .int()
    .min(RULE_STEP_MINUTES)
    .max(24 * 60)
    .multipleOf(RULE_STEP_MINUTES),
});
export type RuleCondition = z.infer<typeof RuleCondition>;

export const CreateRuleRequest = RuleCondition.extend({
  name: z.string().trim().min(3).max(80),
  priority: AlarmPriority,
});
export type CreateRuleRequest = z.infer<typeof CreateRuleRequest>;

export const Rule = CreateRuleRequest.extend({
  id: Id,
  enabled: z.boolean(),
  createdBy: Id,
  createdAt: Timestamp,
});
export type Rule = z.infer<typeof Rule>;

export const RuleHit = z.object({
  assetId: Id,
  tagId: Id,
  from: Timestamp,
  to: Timestamp,
  /** The most extreme reading in the episode, SI. */
  peak: z.number(),
});
export type RuleHit = z.infer<typeof RuleHit>;

export const RuleTestResult = z.object({
  from: Timestamp,
  to: Timestamp,
  assetsChecked: z.number().int(),
  /** Times it would have fired (one per unbroken spell beyond the threshold). */
  hits: z.number().int(),
  /** Assets it would have fired on. */
  assetsHit: z.number().int(),
  /** The longest spells first (at most 20). */
  examples: z.array(RuleHit),
});
export type RuleTestResult = z.infer<typeof RuleTestResult>;

/** A signal a rule can watch, from the equipment catalogue. */
export const RuleSignal = z.object({
  assetClass: AssetClass,
  signal: z.string(),
  description: z.string(),
  quantity: Quantity,
  /** Typical healthy value at full load, SI: a starting point for a threshold. */
  typical: z.number(),
});
export type RuleSignal = z.infer<typeof RuleSignal>;

export const RulesOverview = z.object({
  rules: z.array(Rule.extend({ hits: z.number().int(), assetsHit: z.number().int() })),
  signals: z.array(RuleSignal),
});
export type RulesOverview = z.infer<typeof RulesOverview>;

export const SetRuleEnabledRequest = z.object({ ruleId: Id, enabled: z.boolean() });
export type SetRuleEnabledRequest = z.infer<typeof SetRuleEnabledRequest>;
