/**
 * The fake backend. Answers every endpoint in @pdm/contracts, streams live messages, and
 * exposes the demo controls (speed, chaos, storyline, role).
 *
 * It has no idea it is running in a Web Worker — worker.ts adapts it. That keeps it
 * testable in plain Node.
 */
import {
  ENTERPRISE_SCOPE,
  endpoints,
  pickIntervalSeconds,
  type ClientMessage,
  type EndpointDef,
  type EndpointInput,
  type EndpointName,
  type EndpointOutput,
  type Endpoints,
  type Prediction,
  type PredictionSort,
  type RiskItem,
  type RoleId,
  type ServerMessage,
  type SimulationControl,
  type SimulationStatus,
  type SimSpeed,
  type TimelineEvent,
  type User,
} from "@pdm/contracts";
import { z } from "zod";
import { AlarmEngine } from "./alarms";
import { DETECTION_PROGRESS, rawProgress } from "./faults";
import { CommentStore, documentsFor, relatedFor } from "./asset-info";
import { fleetCompare } from "./comparison";
import { assetPerformance, powerOperations, turbineTrend } from "./operations";
import { oilGasOperations } from "./oil-gas";
import { allFailures, assetFailures, reliabilitySummary } from "./reliability";
import { RcaStore, fmea } from "./rca";
import { riskMatrix, weibullAnalysis } from "./weibull";
import { solarOperations } from "./solar";
import { vibration } from "./vibration";
import { twinArea } from "./twin";
import { ANOMALY_THRESHOLD, anomalyHistory, anomalySummary } from "./anomaly";
import { scriptedBriefing } from "./briefing";
import { STORYLINE_ASSET_ID } from "./catalog/sites";
import { SimClock, iso } from "./clock";
import { ApiFailure } from "./errors";
import { listEvents } from "./events";
import { feedbackSummary } from "./feedback";
import { computeKpis } from "./kpis";
import { LiveHub } from "./live";
import type { AssetRecord } from "./model";
import { ChaosWindows, tagHistory, tagValue } from "./signals";
import { buildSnapshot, emptyCounts, toAsset, type PredictionOverlay, type Snapshot } from "./snapshot";
import { Storyline } from "./storyline";
import { WorkOrderStore } from "./work-orders";
import { buildWorld, type World } from "./world";

export interface MockBackendOptions {
  /** Same seed → same world. Default 20261010. */
  seed?: number;
  /** Simulated start time (ms). Default: the real current time. */
  startTime?: number;
  /** Real-time source. Tests pass a fake to move time forward instantly. */
  realNow?: () => number;
  /** Check every response against the contract. Default true (cheap, catches bugs early). */
  validateOutput?: boolean;
  role?: RoleId;
}

type Handlers = { [N in EndpointName]: (input: z.output<Endpoints[N]["input"]>) => EndpointOutput<N> };

export class MockBackend {
  readonly world: World;
  readonly clock: SimClock;
  readonly chaos = new ChaosWindows();
  readonly alarms: AlarmEngine;
  readonly workOrders: WorkOrderStore;
  readonly storyline: Storyline;
  readonly comments: CommentStore;
  readonly rcas: RcaStore;
  private readonly overlays = new Map<string, PredictionOverlay>();
  private readonly log: TimelineEvent[] = [];
  private readonly hubs = new Set<LiveHub>();
  private readonly validateOutput: boolean;
  private role: RoleId;
  private cached: Snapshot | null = null;
  private logNumber = 1;

  constructor(options: MockBackendOptions = {}) {
    const realNow = options.realNow ?? (() => Date.now());
    const start = options.startTime ?? realNow();
    this.clock = new SimClock(realNow, start);
    this.world = buildWorld(options.seed ?? 20261010, start);
    this.workOrders = new WorkOrderStore(this.world, start, this.overlays);
    this.alarms = new AlarmEngine(this.world, this.chaos, start, (alarm, title, t) =>
      this.addLog({ kind: "operator_action", t: iso(t), assetId: alarm.assetId, title, detail: null, severity: null, refId: alarm.id }),
    );
    this.storyline = new Storyline(this.world, this.workOrders, this.overlays, (e) => this.addLog({ ...e, assetId: STORYLINE_ASSET_ID }));
    // A short discussion on assets with a well-developed fault (only those: the comments talk
    // about readings creeping up, which would be odd on a healthy asset).
    const discussed = this.world.faults.filter((f) => rawProgress(f, start) >= DETECTION_PROGRESS).map((f) => f.asset.data.id);
    this.comments = new CommentStore(this.world, start, [...new Set(discussed)].slice(0, 12));
    this.rcas = new RcaStore(
      this.world,
      this.workOrders,
      () => allFailures(this.world, this.workOrders),
      () => this.snapshot().predictions,
    );
    this.validateOutput = options.validateOutput ?? true;
    this.role = options.role ?? "executive";
  }

  private addLog(event: Omit<TimelineEvent, "id">): void {
    this.log.push({ ...event, id: `ev-log-${this.logNumber++}` });
  }

  now(): number {
    return this.clock.now();
  }

  /** Derived state for the current simulated second (cached). */
  snapshot(): Snapshot {
    const now = this.now();
    if (!this.cached || Math.floor(this.cached.t / 1000) !== Math.floor(now / 1000)) {
      this.cached = buildSnapshot(this.world, now, this.overlays);
    }
    return this.cached;
  }

  private invalidate(): void {
    this.cached = null;
  }

  // ─── Requests ──────────────────────────────────────────────────────────────

  /**
   * Answer one API request. Input is checked against the contract first (bad input → bad_request),
   * and in development the output is checked too, so a bug in the mock can't leak bad data into the UI.
   */
  request<N extends EndpointName>(name: N, input: EndpointInput<N>): EndpointOutput<N> {
    const def: EndpointDef | undefined = endpoints[name];
    if (!def) throw new ApiFailure("not_found", `Unknown endpoint ${String(name)}`);
    const parsed = def.input.safeParse(input ?? {});
    if (!parsed.success) throw new ApiFailure("bad_request", "Invalid request", z.treeifyError(parsed.error));

    const handler = this.handlers[name] as (input: unknown) => EndpointOutput<N>;
    const output = handler(parsed.data);
    if (this.validateOutput) {
      const check = def.output.safeParse(output);
      if (!check.success) throw new ApiFailure("internal", `Mock produced invalid ${String(name)} response`, z.treeifyError(check.error));
    }
    return output;
  }

  private me(): User {
    const user = this.world.usersWithRole(this.role)[0];
    if (!user) throw new ApiFailure("internal", `No user with role ${this.role}`);
    return user;
  }

  private prediction(id: string): Prediction {
    const prediction = this.snapshot().predictionById.get(id);
    if (!prediction) throw new ApiFailure("not_found", `Prediction ${id} not found`);
    return prediction;
  }

  private asset(id: string): AssetRecord {
    const asset = this.world.assets.get(id);
    if (!asset) throw new ApiFailure("not_found", `Asset ${id} not found`);
    return asset;
  }

  private scope(scopeId: string | undefined): AssetRecord[] {
    const id = scopeId ?? ENTERPRISE_SCOPE;
    if (!this.world.nodes.has(id)) throw new ApiFailure("not_found", `Hierarchy node ${id} not found`);
    return this.world.scopeAssets(id);
  }

  private inScope(scopeId: string | undefined): (assetId: string) => boolean {
    if (!scopeId) return () => true;
    this.scope(scopeId);
    return (assetId) => this.world.assets.get(assetId)?.scopeIds.has(scopeId) ?? false;
  }

  private node(id: string) {
    const record = this.world.nodes.get(id);
    if (!record) throw new ApiFailure("not_found", `Hierarchy node ${id} not found`);
    const snap = this.snapshot();
    return { ...record.node, health: snap.nodeHealth.get(id) ?? "healthy", healthCounts: snap.nodeCounts.get(id) ?? emptyCounts() };
  }

  private readonly handlers: Handlers = {
    "me.get": () => this.me(),

    "users.list": ({ role, search, offset, limit }) => {
      const q = search?.toLowerCase();
      const items = this.world.users.filter((u) => (!role || u.role === role) && (!q || u.name.toLowerCase().includes(q)));
      return paginate(items, offset, limit);
    },

    "hierarchy.node": ({ nodeId }) => this.node(nodeId),
    "hierarchy.children": ({ nodeId }) => {
      const record = this.world.nodes.get(nodeId);
      if (!record) throw new ApiFailure("not_found", `Hierarchy node ${nodeId} not found`);
      return { items: record.childIds.map((id) => this.node(id)) };
    },
    "hierarchy.path": ({ nodeId }) => {
      const path = [];
      let current: string | null = nodeId;
      while (current) {
        const n = this.node(current);
        path.unshift(n);
        current = n.parentId;
      }
      return { items: path };
    },

    "sites.list": () => ({
      items: [...this.world.sites.values()].map((s) => ({
        ...s.site,
        health: this.snapshot().nodeHealth.get(s.site.id) ?? "healthy",
        healthCounts: this.snapshot().nodeCounts.get(s.site.id) ?? emptyCounts(),
      })),
    }),

    "assets.list": (p) => {
      const snap = this.snapshot();
      const q = p.search?.toLowerCase();
      const items = this.scope(p.scopeId)
        .filter((a) => !p.businessLine || a.data.businessLine === p.businessLine)
        .filter((a) => !p.assetClass || p.assetClass.includes(a.data.assetClass))
        .filter((a) => !p.healthState || p.healthState.includes(snap.conditions.get(a.data.id)?.health.state ?? "healthy"))
        .filter((a) => !q || [a.data.id, a.data.name, a.data.manufacturer, a.data.model].some((f) => f.toLowerCase().includes(q)))
        .map((a) => toAsset(a, condition(snap, a)));
      const sorters = {
        risk_desc: (x: (typeof items)[number], y: (typeof items)[number]) =>
          (snap.conditions.get(y.id)?.riskScore ?? 0) - (snap.conditions.get(x.id)?.riskScore ?? 0),
        health_asc: (x: (typeof items)[number], y: (typeof items)[number]) => x.health.score - y.health.score,
        criticality_desc: (x: (typeof items)[number], y: (typeof items)[number]) => y.criticality - x.criticality,
        name_asc: (x: (typeof items)[number], y: (typeof items)[number]) => x.id.localeCompare(y.id),
      };
      items.sort(sorters[p.sort]);
      return paginate(items, p.offset, p.limit);
    },
    "assets.get": ({ assetId }) => {
      const asset = this.asset(assetId);
      return toAsset(asset, condition(this.snapshot(), asset));
    },
    "assets.compare": ({ assetClass, scopeId, measure }) => {
      if (scopeId) this.scope(scopeId);
      return fleetCompare({
        world: this.world,
        chaos: this.chaos,
        snapshot: this.snapshot(),
        now: this.now(),
        assetClass,
        measure,
        inScope: this.inScope(scopeId),
      });
    },
    "assets.performance": ({ assetId }) =>
      assetPerformance({ world: this.world, chaos: this.chaos, now: this.now() }, this.snapshot(), this.asset(assetId)),
    "assets.vibration": ({ assetId, point }) =>
      vibration({ world: this.world, chaos: this.chaos, now: this.now() }, this.asset(assetId), point),
    "twin.area": ({ areaId, hoursAgo }) => twinArea({ world: this.world, chaos: this.chaos, now: this.now() }, areaId, hoursAgo),
    "operations.power": ({ scopeId, siteId }) =>
      powerOperations({
        world: this.world,
        chaos: this.chaos,
        snapshot: this.snapshot(),
        now: this.now(),
        siteId,
        inScope: this.inScope(scopeId),
      }),
    "operations.solar": ({ scopeId, siteId }) =>
      solarOperations({
        world: this.world,
        chaos: this.chaos,
        snapshot: this.snapshot(),
        now: this.now(),
        siteId,
        inScope: this.inScope(scopeId),
      }),
    "operations.oilGas": ({ scopeId, segment }) =>
      oilGasOperations({
        world: this.world,
        chaos: this.chaos,
        snapshot: this.snapshot(),
        now: this.now(),
        segment,
        inScope: this.inScope(scopeId),
      }),
    "reliability.summary": (request) => {
      if (request.scopeId) this.scope(request.scopeId);
      return reliabilitySummary({
        world: this.world,
        workOrders: this.workOrders,
        now: this.now(),
        request,
        inScope: this.inScope(request.scopeId),
      });
    },
    "reliability.weibull": (request) =>
      weibullAnalysis({
        world: this.world,
        failures: allFailures(this.world, this.workOrders),
        now: this.now(),
        request,
        inScope: this.inScope(request.scopeId),
      }),
    "reliability.risk": (request) =>
      riskMatrix({
        world: this.world,
        failures: allFailures(this.world, this.workOrders),
        predictions: this.snapshot().predictions,
        now: this.now(),
        request,
        inScope: this.inScope(request.scopeId),
      }),
    "reliability.fmea": ({ assetClass }) =>
      fmea({
        world: this.world,
        failures: allFailures(this.world, this.workOrders),
        workOrders: this.workOrders,
        now: this.now(),
        assetClass,
      }),
    "rca.list": ({ assetId }) => ({ items: this.rcas.list(assetId) }),
    "rca.get": ({ rcaId }) => this.rcas.get(rcaId),
    "rca.create": (request) => {
      this.asset(request.assetId);
      return this.rcas.create(request, this.now());
    },
    "rca.update": (request) => this.rcas.update(request, this.now()),
    "rca.addAction": (request) => this.rcas.addAction(request, this.me().id, this.now()),
    "assets.failures": ({ assetId }) => assetFailures(this.world, this.workOrders, this.asset(assetId), this.now()),
    "operations.turbineTrend": ({ assetId, days }) =>
      turbineTrend({ world: this.world, chaos: this.chaos, now: this.now() }, this.asset(assetId), days),
    "assets.documents": ({ assetId }) => ({ items: documentsFor(this.asset(assetId), this.now()) }),
    "assets.related": ({ assetId }) => relatedFor(this.world, this.snapshot(), this.asset(assetId)),
    "assets.comments": ({ assetId }) => {
      this.asset(assetId);
      return { items: this.comments.list(assetId) };
    },
    "assets.addComment": (request) => this.comments.add(request, this.me().id, this.now()),
    "assets.tags": ({ assetId }) => ({ items: this.asset(assetId).tags.map((t) => t.tag) }),

    "timeseries.history": ({ tagIds, from, to, maxPoints }) => {
      const fromMs = Date.parse(from);
      const toMs = Date.parse(to);
      const intervalSeconds = pickIntervalSeconds((toMs - fromMs) / 1000, maxPoints);
      const now = this.now();
      return {
        from,
        to,
        intervalSeconds,
        series: tagIds.map((id) => {
          const tag = this.world.tags.get(id);
          if (!tag) throw new ApiFailure("not_found", `Tag ${id} not found`);
          return { tagId: id, points: tagHistory(this.world, this.chaos, tag, fromMs, toMs, intervalSeconds, now) };
        }),
      };
    },
    "timeseries.latest": ({ tagIds }) => {
      const now = this.now();
      const values = [];
      for (const id of tagIds) {
        const tag = this.world.tags.get(id);
        if (!tag) throw new ApiFailure("not_found", `Tag ${id} not found`);
        const reading = tagValue(this.world, this.chaos, tag, now);
        if (reading) values.push({ tagId: id, t: iso(now), ...reading });
      }
      return { values };
    },

    "risks.top": ({ scopeId, limit }) => {
      const snap = this.snapshot();
      const ranked = this.scope(scopeId)
        .map((a) => ({ a, c: condition(snap, a) }))
        .filter(({ c }) => c.health.state !== "offline" && c.health.state !== "maintenance")
        .sort((x, y) => y.c.riskScore - x.c.riskScore)
        .slice(0, limit);
      return {
        items: ranked.map(({ a, c }, i): RiskItem => ({
          rank: i + 1,
          assetId: a.data.id,
          assetName: a.data.name,
          assetClass: a.data.assetClass,
          siteId: a.data.siteId,
          health: c.health,
          probability: c.probability,
          consequence: a.data.criticality,
          riskScore: c.riskScore,
          predictionId: c.topPrediction?.id ?? null,
          failureModeLabel: c.topPrediction?.failureMode.label ?? null,
          horizonDays: c.topPrediction?.horizonDays ?? null,
        })),
      };
    },
    "predictions.list": (p) => {
      const inScope = this.inScope(p.scopeId);
      const items = this.snapshot()
        .predictions.filter(
          (x) => inScope(x.assetId) && (!p.assetId || x.assetId === p.assetId) && (!p.status || p.status.includes(x.status)),
        )
        .filter((x) => !p.assetClass || p.assetClass.includes(this.asset(x.assetId).data.assetClass))
        .filter((x) => p.minProbability === undefined || x.probability >= p.minProbability)
        .filter((x) => p.maxRulDays === undefined || (x.rul?.p50Days ?? Infinity) <= p.maxRulDays);
      const exposure = (x: Prediction) => x.probability * x.recommendedAction.failureCost.amount;
      const sorters: Record<PredictionSort, (a: Prediction, b: Prediction) => number> = {
        exposure: (a, b) => exposure(b) - exposure(a),
        probability: (a, b) => b.probability - a.probability,
        soonest: (a, b) => (a.rul?.p50Days ?? Infinity) - (b.rul?.p50Days ?? Infinity),
        newest: (a, b) => b.detectedAt.localeCompare(a.detectedAt),
      };
      return paginate([...items].sort(sorters[p.sort]), p.offset, p.limit);
    },
    "predictions.get": ({ predictionId }) => this.prediction(predictionId),
    "predictions.feedback": ({ predictionId, feedback, comment }) => {
      const before = this.prediction(predictionId);
      this.overlays.set(predictionId, { ...this.overlays.get(predictionId), feedback });
      this.addLog({
        kind: "operator_action",
        t: iso(this.now()),
        assetId: before.assetId,
        title: `Prediction feedback: ${feedback.replace(/_/g, " ")}`,
        detail: comment ?? null,
        severity: null,
        refId: predictionId,
      });
      this.invalidate();
      return this.prediction(predictionId);
    },
    "predictions.triage": ({ predictionId, action, reason }) => {
      const before = this.prediction(predictionId);
      if (before.status === "closed") throw new ApiFailure("conflict", "A closed prediction can't be changed");
      const status =
        action === "acknowledge" ? "acknowledged" : action === "dismiss" ? "dismissed" : before.workOrderId ? "actioned" : "open";
      if (action === "acknowledge" && before.status !== "open")
        throw new ApiFailure("conflict", `Can't acknowledge a prediction that is ${before.status}`);
      if (action === "reopen" && before.status !== "dismissed" && before.status !== "acknowledged") {
        throw new ApiFailure("conflict", `Can't reopen a prediction that is ${before.status}`);
      }
      this.overlays.set(predictionId, { ...this.overlays.get(predictionId), status });
      this.addLog({
        kind: "operator_action",
        t: iso(this.now()),
        assetId: before.assetId,
        title: `Prediction ${action === "dismiss" ? "dismissed" : action === "acknowledge" ? "acknowledged" : "reopened"}: ${before.failureMode.label}`,
        detail: reason ?? null,
        severity: null,
        refId: predictionId,
      });
      this.invalidate();
      return this.prediction(predictionId);
    },
    "predictions.feedbackSummary": ({ scopeId }) => feedbackSummary(scopeId ?? ENTERPRISE_SCOPE, this.scope(scopeId), this.snapshot()),
    "anomalies.fleet": ({ scopeId, state, search, sort, offset, limit }) => {
      const now = this.now();
      const inScope = this.inScope(scopeId);
      const predictions = this.snapshot().predictions;
      const all = [...this.world.assets.values()]
        .filter((a) => inScope(a.data.id))
        .map((a) => anomalySummary(this.world, a, now, predictions));
      const counts = { anomalous: 0, rising: 0, normal: 0, no_data: 0 };
      for (const row of all) counts[row.state]++;
      const needle = search?.toLowerCase();
      const rise = (r: (typeof all)[number]) => (r.score ?? 0) - (r.scoreDayAgo ?? r.score ?? 0);
      const rows = all
        .filter((r) => !state || state.includes(r.state))
        .filter((r) => !needle || r.assetId.toLowerCase().includes(needle) || r.assetName.toLowerCase().includes(needle))
        .sort((a, b) => (sort === "rise" ? rise(b) - rise(a) : (b.score ?? -1) - (a.score ?? -1)) || a.assetId.localeCompare(b.assetId));
      return { ...paginate(rows, offset, limit), counts };
    },
    "anomalies.history": ({ assetId, from, to, maxPoints }) => {
      const asset = this.asset(assetId);
      const fromMs = Date.parse(from);
      const intervalSeconds = pickIntervalSeconds((Date.parse(to) - fromMs) / 1000, maxPoints);
      return {
        assetId,
        threshold: ANOMALY_THRESHOLD,
        intervalSeconds,
        points: anomalyHistory(this.world, asset, fromMs, Date.parse(to), intervalSeconds, this.now()),
      };
    },

    "alarms.list": (p) => {
      if (p.scopeId) this.scope(p.scopeId); // 404 for an unknown scope
      return paginate(this.alarms.query(p), p.offset, p.limit);
    },
    "alarms.analytics": ({ scopeId, window }) => {
      if (scopeId) this.scope(scopeId);
      const inScope = this.inScope(scopeId);
      // Each site has its own control room, so rates are judged per site.
      const siteIds = new Set([...this.world.assets.values()].filter((a) => inScope(a.data.id)).map((a) => a.data.siteId));
      const sites = [...this.world.sites.values()].filter((s) => siteIds.has(s.site.id)).map((s) => ({ id: s.site.id, name: s.site.name }));
      return this.alarms.analytics({ window, scopeId, sites, now: this.now() });
    },
    "alarms.summary": ({ scopeId }) => {
      this.scope(scopeId);
      return this.alarms.summary(scopeId ?? ENTERPRISE_SCOPE, this.now());
    },
    "alarms.acknowledge": ({ alarmIds }) => {
      const items = this.alarms.acknowledge(alarmIds, this.me().id, this.now());
      this.flushLive();
      return { items };
    },
    "alarms.shelve": ({ alarmId, reason, until }) => {
      const alarm = this.alarms.shelve(alarmId, reason, Date.parse(until), this.me().id, this.now());
      this.flushLive();
      return alarm;
    },
    "alarms.unshelve": ({ alarmId }) => {
      const alarm = this.alarms.unshelve(alarmId, this.me().id, this.now());
      this.flushLive();
      return alarm;
    },
    "events.list": (p) => ({
      items: listEvents(p, {
        alarms: this.alarms,
        workOrders: this.workOrders,
        snapshot: this.snapshot(),
        log: this.log,
        inScope: this.inScope(p.scopeId),
      }),
    }),

    "kpis.get": ({ scopeId, keys }) =>
      computeKpis(
        {
          scopeId: scopeId ?? ENTERPRISE_SCOPE,
          assets: this.scope(scopeId),
          snapshot: this.snapshot(),
          alarms: this.alarms,
          workOrders: this.workOrders,
          failures: allFailures(this.world, this.workOrders),
          now: this.now(),
        },
        keys,
      ),
    "briefing.daily": ({ scopeId }) =>
      scriptedBriefing({
        world: this.world,
        scopeId: scopeId ?? ENTERPRISE_SCOPE,
        assets: this.scope(scopeId),
        snapshot: this.snapshot(),
        overlays: this.overlays,
        alarms: this.alarms,
        now: this.now(),
      }),

    "workOrders.list": ({ offset, limit, scopeId, ...filters }) =>
      paginate(this.workOrders.query(filters, this.inScope(scopeId)), offset, limit),
    "workOrders.get": ({ workOrderId }) => this.workOrders.get(workOrderId),
    "workOrders.transition": (request) => {
      const now = this.now();
      const wo = this.workOrders.transition(request, this.me().id, now);
      this.addLog({
        kind: "maintenance",
        t: iso(now),
        assetId: wo.assetId,
        title: `${wo.number} → ${request.to.replace("_", " ")}`,
        detail: request.note ?? null,
        severity: null,
        refId: wo.id,
      });
      return wo;
    },
    "workOrders.closeOut": (request) => {
      const now = this.now();
      const wo = this.workOrders.closeOut(request, this.me().id, now);
      // Closing the feedback loop from the field: the technician's verdict becomes the prediction's feedback.
      if (wo.source.kind === "prediction" && wo.source.refId && request.predictionVerdict) {
        this.overlays.set(wo.source.refId, { ...this.overlays.get(wo.source.refId), feedback: request.predictionVerdict });
        this.invalidate();
      }
      this.addLog({
        kind: "maintenance",
        t: iso(now),
        assetId: wo.assetId,
        title: `${wo.number} completed: ${request.findings.slice(0, 80)}`,
        detail: `${request.failureMode} / ${request.cause} / ${request.remedy} · ${request.laborHours} h`,
        severity: null,
        refId: wo.id,
      });
      return wo;
    },
    "workOrders.reschedule": (request) => {
      const now = this.now();
      const wo = this.workOrders.reschedule(request, this.me().id, now);
      this.addLog({
        kind: "maintenance",
        t: iso(now),
        assetId: wo.assetId,
        title: `${wo.number} rescheduled`,
        detail: wo.history.at(-1)?.note ?? null,
        severity: null,
        refId: wo.id,
      });
      return wo;
    },
    "workOrders.create": (request) => {
      const now = this.now();
      const wo = this.workOrders.create(request, this.me().id, now);
      if (request.source.kind === "alarm" && request.source.refId) this.alarms.linkWorkOrder(request.source.refId, wo.id);
      if (request.source.kind === "prediction" && request.source.refId) {
        const previous = this.overlays.get(request.source.refId);
        this.overlays.set(request.source.refId, { ...previous, status: "actioned", workOrderId: wo.id });
      }
      this.addLog({
        kind: "maintenance",
        t: iso(now),
        assetId: wo.assetId,
        title: `${wo.number} raised: ${wo.title}`,
        detail: null,
        severity: null,
        refId: wo.id,
      });
      this.invalidate();
      this.flushLive();
      return wo;
    },
  };

  // ─── Time & live data ──────────────────────────────────────────────────────

  /** Advance the simulation to "now" and push live updates. Called once per second by the worker. */
  tick(): void {
    const now = this.now();
    this.storyline.tick(now);
    this.alarms.tick(now);
    this.invalidate();
    for (const hub of this.hubs) hub.tick(now);
  }

  /** Push alarm changes straight away (after an operator action) instead of waiting for the next tick. */
  private flushLive(): void {
    const now = this.now();
    for (const hub of this.hubs) hub.flushAlarms(now);
  }

  /** Open a live connection. `send` receives every server message. */
  connect(send: (message: ServerMessage) => void): { handle: (message: ClientMessage) => void; close: () => void } {
    const hub = new LiveHub(this.world, this.chaos, this.alarms, send);
    this.hubs.add(hub);
    return {
      handle: (message) => hub.handle(message, this.now()),
      close: () => this.hubs.delete(hub),
    };
  }

  // ─── Demo controls ─────────────────────────────────────────────────────────

  control(control: SimulationControl): SimulationStatus {
    switch (control.type) {
      case "set_speed":
        this.clock.setSpeed(control.speed);
        break;
      case "set_chaos":
        this.chaos.set(control.enabled, this.now());
        break;
      case "set_role":
        this.role = control.role;
        break;
      case "start_storyline":
        this.storyline.start(this.now());
        this.invalidate();
        break;
      case "get_status":
        break;
    }
    return this.status();
  }

  status(): SimulationStatus {
    const now = this.now();
    return {
      simTime: iso(now),
      speed: this.clock.speed as SimSpeed,
      chaos: this.chaos.enabled,
      role: this.role,
      storyline: this.storyline.status(now),
    };
  }
}

function condition(snap: Snapshot, asset: AssetRecord) {
  const c = snap.conditions.get(asset.data.id);
  if (!c) throw new ApiFailure("internal", `No condition for ${asset.data.id}`);
  return c;
}

function paginate<T>(items: readonly T[], offset: number, limit: number) {
  return { items: items.slice(offset, offset + limit), total: items.length, offset, limit };
}

export function createMockBackend(options?: MockBackendOptions): MockBackend {
  return new MockBackend(options);
}
