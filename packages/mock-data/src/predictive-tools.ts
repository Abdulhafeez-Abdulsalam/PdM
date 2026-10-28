/**
 * Predictive tools (Phase 4, chunk 9): the model registry and threshold rules.
 *
 * Models: one per class of equipment. Version 2.4.1 is in production (the version every
 * prediction has carried so far); some classes have a 2.5.0 candidate whose backtest is
 * sometimes better, sometimes worse, so approving needs judgement. Live results come from
 * technicians' verdicts on finished predictive work. Approving changes the version new
 * predictions carry (backend.snapshot stamps it).
 *
 * Rules: tested on the last 24 h of readings, every 5 minutes, through the same tagValue the
 * charts use. A missing reading breaks a spell; each spell beyond the threshold for at least
 * the rule's duration is one hit.
 */
import {
  RULE_STEP_MINUTES,
  RULE_TEST_HOURS,
  type AssetClass,
  type CreateRuleRequest,
  type ModelEntry,
  type ModelVersion,
  type Rule,
  type RuleCondition,
  type RuleHit,
  type RuleSignal,
  type RuleTestResult,
  type RulesOverview,
} from "@pdm/contracts";
import { TAG_TEMPLATES } from "./catalog/tag-templates";
import { DAY, HOUR, iso } from "./clock";
import { ApiFailure } from "./errors";
import { hashNoise, hashString } from "./random";
import { tagValue, type ChaosWindows } from "./signals";
import type { Snapshot } from "./snapshot";
import type { WorkOrderStore } from "./work-orders";
import type { World } from "./world";

const r2 = (v: number) => Math.round(v * 100) / 100;
const clamp01 = (v: number) => Math.min(0.99, Math.max(0.3, v));

interface ModelRecord {
  id: string;
  assetClass: AssetClass;
  versions: ModelVersion[];
}

export class ModelRegistry {
  private readonly models: ModelRecord[] = [];

  constructor(private readonly world: World) {
    const classes = [...new Set([...world.assets.values()].map((a) => a.data.assetClass))].sort();
    const engineer = world.usersWithRole("reliability_engineer")[0]?.id ?? null;
    const at = (days: number) => iso(world.createdAt - days * DAY);
    for (const assetClass of classes) {
      const h = hashString(`model:${world.seed}:${assetClass}`);
      const n = (i: number) => hashNoise(h, i);
      const prod = { precision: r2(0.7 + 0.18 * n(2)), recall: r2(0.6 + 0.25 * n(3)), leadDays: Math.round(8 + 30 * n(4)) };
      const versions: ModelVersion[] = [];
      if (n(1) < 0.45) {
        // A candidate: retrained on more data. Not always better: that's why a person decides.
        versions.push({
          version: "2.5.0",
          status: "candidate",
          trainedAt: at(6),
          approvedAt: null,
          approvedBy: null,
          backtest: {
            precision: r2(clamp01(prod.precision + (n(5) - 0.4) * 0.14)),
            recall: r2(clamp01(prod.recall + (n(6) - 0.35) * 0.12)),
            leadDays: Math.max(3, Math.round(prod.leadDays + (n(7) - 0.4) * 10)),
          },
        });
      }
      versions.push(
        { version: "2.4.1", status: "production", trainedAt: at(120), approvedAt: at(110), approvedBy: engineer, backtest: prod },
        {
          version: "2.3.0",
          status: "retired",
          trainedAt: at(300),
          approvedAt: at(290),
          approvedBy: engineer,
          backtest: { precision: r2(prod.precision - 0.05), recall: r2(prod.recall - 0.06), leadDays: Math.max(3, prod.leadDays - 4) },
        },
      );
      this.models.push({ id: `${assetClass}-health`, assetClass, versions });
    }
  }

  /** The version in production for a model (what a new prediction carries). */
  productionVersion(modelId: string): string | null {
    return this.models.find((m) => m.id === modelId)?.versions.find((v) => v.status === "production")?.version ?? null;
  }

  list(ctx: { workOrders: WorkOrderStore; snapshot: Snapshot; now: number }): ModelEntry[] {
    return this.models.map((m) => this.entry(m, ctx));
  }

  approve(modelId: string, version: string, by: string, now: number, ctx: { workOrders: WorkOrderStore; snapshot: Snapshot }): ModelEntry {
    const { model, candidate } = this.candidate(modelId, version);
    for (const v of model.versions) if (v.status === "production") v.status = "retired";
    candidate.status = "production";
    candidate.approvedAt = iso(now);
    candidate.approvedBy = by;
    return this.entry(model, { ...ctx, now });
  }

  reject(modelId: string, version: string, now: number, ctx: { workOrders: WorkOrderStore; snapshot: Snapshot }): ModelEntry {
    const { model, candidate } = this.candidate(modelId, version);
    candidate.status = "retired";
    return this.entry(model, { ...ctx, now });
  }

  private candidate(modelId: string, version: string) {
    const model = this.models.find((m) => m.id === modelId);
    if (!model) throw new ApiFailure("not_found", `Model ${modelId} not found`);
    const candidate = model.versions.find((v) => v.version === version);
    if (!candidate) throw new ApiFailure("not_found", `Model ${modelId} has no version ${version}`);
    if (candidate.status !== "candidate") throw new ApiFailure("conflict", `${modelId} ${version} is ${candidate.status}, not a candidate`);
    return { model, candidate };
  }

  private entry(m: ModelRecord, ctx: { workOrders: WorkOrderStore; snapshot: Snapshot; now: number }): ModelEntry {
    const classOf = (assetId: string) => this.world.assets.get(assetId)?.data.assetClass;
    const from = ctx.now - 365 * DAY;
    let confirmed = 0;
    let falseAlarms = 0;
    let somethingElse = 0;
    const count = (verdict: string | null | undefined) => {
      if (verdict === "true_positive") confirmed++;
      else if (verdict === "false_positive") falseAlarms++;
      else if (verdict === "found_something_else") somethingElse++;
    };
    // Verdicts at close-out of predictive work, then feedback given straight on a prediction.
    for (const wo of ctx.workOrders.all()) {
      if (wo.type !== "predictive" || !wo.closeOut || classOf(wo.assetId) !== m.assetClass) continue;
      const t = Date.parse(wo.closeOut.completedAt);
      if (t >= from && t <= ctx.now) count(wo.closeOut.predictionVerdict);
    }
    for (const p of ctx.snapshot.predictions) if (p.modelId === m.id && p.feedback && !p.workOrderId) count(p.feedback);
    const judged = confirmed + falseAlarms;
    return {
      id: m.id,
      assetClass: m.assetClass,
      assets: [...this.world.assets.values()].filter((a) => a.data.assetClass === m.assetClass).length,
      versions: m.versions.map((v) => ({ ...v, backtest: { ...v.backtest } })),
      openPredictions: ctx.snapshot.predictions.filter((p) => p.modelId === m.id && p.status !== "closed" && p.status !== "dismissed")
        .length,
      live: { confirmed, falseAlarms, somethingElse, precision: judged ? Math.round((1000 * confirmed) / judged) / 1000 : null },
    };
  }
}

interface RuleCtx {
  world: World;
  chaos: ChaosWindows;
  now: number;
}

const STEP = RULE_STEP_MINUTES * 60_000;

export class RuleStore {
  private readonly rules: Rule[] = [];
  private readonly tests = new Map<string, RuleTestResult>();
  private nextRule = 1;

  constructor(world: World) {
    // Two rules a reliability engineer might have set up already: vibration on pumps and compressors.
    const engineer = world.usersWithRole("reliability_engineer")[0]?.id ?? "U-001";
    for (const [assetClass, priority] of [
      ["pump", "p2"],
      ["compressor", "p3"],
    ] as const) {
      const template = TAG_TEMPLATES[assetClass].find((t) => t.quantity === "vibration_velocity" && t.bad === "high");
      if (!template) continue;
      this.rules.push({
        id: `RULE-${String(this.nextRule++).padStart(3, "0")}`,
        name: `${template.description} high on ${assetClass}s`,
        assetClass,
        signal: template.name,
        comparator: "above",
        threshold: Math.round(template.base * 1.6 * 10) / 10,
        durationMinutes: 10,
        priority,
        enabled: true,
        createdBy: engineer,
        createdAt: iso(world.createdAt - 40 * DAY),
      });
    }
  }

  overview(ctx: RuleCtx): RulesOverview {
    const classes = new Set([...ctx.world.assets.values()].map((a) => a.data.assetClass));
    const toSignal = (assetClass: AssetClass) =>
      TAG_TEMPLATES[assetClass].map((t) => ({
        assetClass,
        signal: t.name,
        description: t.description,
        quantity: t.quantity,
        typical: t.base,
      }));
    const signals: RuleSignal[] = [...classes].sort().flatMap(toSignal);
    return {
      rules: this.rules.map((r) => {
        const test = this.test(r, ctx);
        return { ...r, hits: test.hits, assetsHit: test.assetsHit };
      }),
      signals,
    };
  }

  /** How often this condition would have fired on the last 24 hours of readings. */
  test(cond: RuleCondition, ctx: RuleCtx): RuleTestResult {
    const template = TAG_TEMPLATES[cond.assetClass].find((t) => t.name === cond.signal);
    if (!template) throw new ApiFailure("bad_request", `${cond.assetClass} has no signal ${cond.signal}`);
    const to = Math.floor(ctx.now / STEP) * STEP;
    const from = to - RULE_TEST_HOURS * HOUR;
    const key = `${ctx.world.seed}|${cond.assetClass}|${cond.signal}|${cond.comparator}|${cond.threshold}|${cond.durationMinutes}|${to}|${ctx.chaos.version}`;
    const cached = this.tests.get(key);
    if (cached) return cached;

    const need = cond.durationMinutes / RULE_STEP_MINUTES;
    const beyond = (v: number) => (cond.comparator === "above" ? v > cond.threshold : v < cond.threshold);
    const hits: RuleHit[] = [];
    let assetsChecked = 0;
    const assetsHit = new Set<string>();
    for (const asset of ctx.world.assets.values()) {
      if (asset.data.assetClass !== cond.assetClass) continue;
      const tag = asset.tags.find((t) => t.template.name === cond.signal);
      if (!tag) continue;
      assetsChecked++;
      let start = -1;
      let run = 0;
      let peak = 0;
      const close = (end: number) => {
        if (run >= need) {
          hits.push({ assetId: asset.data.id, tagId: tag.tag.id, from: iso(start), to: iso(end), peak: Number(peak.toPrecision(6)) });
          assetsHit.add(asset.data.id);
        }
        run = 0;
      };
      for (let t = from; t <= to; t += STEP) {
        const reading = tagValue(ctx.world, ctx.chaos, tag, t);
        if (reading && beyond(reading.value)) {
          if (run === 0) {
            start = t;
            peak = reading.value;
          }
          run++;
          peak = cond.comparator === "above" ? Math.max(peak, reading.value) : Math.min(peak, reading.value);
        } else if (run > 0) close(t - STEP);
      }
      if (run > 0) close(to);
    }
    const length = (h: RuleHit) => Date.parse(h.to) - Date.parse(h.from);
    const result: RuleTestResult = {
      from: iso(from),
      to: iso(to),
      assetsChecked,
      hits: hits.length,
      assetsHit: assetsHit.size,
      examples: [...hits].sort((a, b) => length(b) - length(a) || a.assetId.localeCompare(b.assetId)).slice(0, 20),
    };
    if (this.tests.size > 200) this.tests.clear();
    this.tests.set(key, result);
    return result;
  }

  create(request: CreateRuleRequest, by: string, ctx: RuleCtx): Rule {
    this.test(request, ctx); // refuses a signal the class doesn't have
    const rule: Rule = {
      ...request,
      id: `RULE-${String(this.nextRule++).padStart(3, "0")}`,
      enabled: true,
      createdBy: by,
      createdAt: iso(ctx.now),
    };
    this.rules.push(rule);
    return rule;
  }

  setEnabled(ruleId: string, enabled: boolean): Rule {
    const rule = this.rules.find((r) => r.id === ruleId);
    if (!rule) throw new ApiFailure("not_found", `Rule ${ruleId} not found`);
    rule.enabled = enabled;
    return rule;
  }
}
