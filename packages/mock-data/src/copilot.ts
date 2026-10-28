/**
 * The scripted copilot (ADR-0010, Phase 4 chunk 10). It reads a question for:
 *   - an asset id ("CBC-GT-101"), a kind of equipment ("pumps"), a place (any hierarchy name,
 *     longest match wins) and a time span ("30 days", "a week"; 30 days if none);
 * picks one of the questions it anticipated by keywords, and answers by calling the same read
 * endpoints the screens use, so it can never see more than a screen can. Every paragraph cites
 * where its numbers came from; actions that change something are suggestions to confirm.
 */
import {
  ENTERPRISE_SCOPE,
  type AssetClass,
  type AskRequest,
  type Citation,
  type CopilotAction,
  type CopilotAnswer,
  type CopilotIntent,
  type EndpointInput,
  type EndpointName,
  type EndpointOutput,
} from "@pdm/contracts";
import { ASSET_CLASSES } from "./catalog/asset-catalog";
import { iso } from "./clock";
import type { World } from "./world";

interface Ctx {
  world: World;
  now: number;
  /** The backend's own request function: the copilot only reads, through the API. */
  request: <N extends EndpointName>(name: N, input: EndpointInput<N>) => EndpointOutput<N>;
}

/** Everyday words for kinds of equipment, besides each class's catalogue label. */
const SYNONYMS: readonly (readonly [string, AssetClass])[] = [
  ["pump", "pump"],
  ["rod pump", "rod_pump"],
  ["submersible", "esp"],
  ["esp", "esp"],
  ["turbine", "gas_turbine"],
  ["gas turbine", "gas_turbine"],
  ["steam turbine", "steam_turbine"],
  ["compressor", "compressor"],
  ["engine", "recip_engine"],
  ["string", "pv_string"],
  ["valve", "control_valve"],
  ["relief valve", "psv"],
  ["safety valve", "psv"],
  ["well", "wellhead"],
  ["pipeline", "pipeline_segment"],
  ["battery", "bess"],
  ["batteries", "bess"],
  ["heater", "fired_heater"],
  ["tank", "storage_tank"],
  ["vessel", "pressure_vessel"],
  ["tracker", "tracker"],
  ["hrsg", "hrsg"],
];

const WORDS: readonly (readonly [string, AssetClass])[] = [
  ...(Object.entries(ASSET_CLASSES) as [AssetClass, { label: string }][]).map(([c, info]) => [info.label.toLowerCase(), c] as const),
  ...SYNONYMS,
].sort((a, b) => b[0].length - a[0].length);

const EXAMPLES = [
  "Which pumps are likely to fail in the next 30 days?",
  "How is CBC-GT-101?",
  "Which alarms are urgent right now?",
  "How big is the maintenance backlog?",
  "How much have predictions saved this year?",
  "What are our emissions?",
  "Which spare parts are running short?",
];

const plural = (label: string) => {
  const l = label.toLowerCase();
  return l.endsWith("s") || l.endsWith("gear") ? l : l.endsWith("y") ? `${l.slice(0, -1)}ies` : `${l}s`;
};
const money = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `$${Math.round(a / 1e3)}K` : `$${Math.round(a)}`;
  return v < 0 ? `−${s}` : s;
};
const pct = (p: number) => `${Math.round(p * 100)} %`;
const page = (path: string, label: string): Citation => ({ kind: "page", id: path, label });

function classIn(q: string): AssetClass | null {
  for (const [word, cls] of WORDS) if (new RegExp(`\\b${word}(s|es)?\\b`).test(q)) return cls;
  return null;
}

function daysIn(q: string): number {
  const n = (m: RegExpExecArray, per: number) => Math.min(365, Math.max(1, Number(m[1]) * per));
  const days = /(\d+)\s*(day|d\b)/.exec(q);
  if (days) return n(days, 1);
  const weeks = /(\d+)\s*weeks?/.exec(q);
  if (weeks) return n(weeks, 7);
  const months = /(\d+)\s*months?/.exec(q);
  if (months) return n(months, 30);
  if (/\bweek/.test(q)) return 7;
  if (/\bmonth/.test(q)) return 30;
  if (/\bquarter/.test(q)) return 90;
  if (/\byear/.test(q)) return 365;
  return 30;
}

function intentOf(q: string, assetId: string | null): CopilotIntent {
  if (assetId) return "asset_status";
  if (/\b(fail|failure|failing|break|breakdown|likely|risk)/.test(q)) return "likely_failures";
  if (/\b(alarm|p1|p2|urgent)/.test(q)) return "urgent_alarms";
  if (/\b(backlog|overdue|work orders?|maintenance|pm\b|preventive)/.test(q)) return "maintenance_backlog";
  if (/\b(sav|value|money|worth|roi|financ)/.test(q)) return "value";
  if (/\b(emission|co2|carbon|methane|flar|ghg|esg)/.test(q)) return "emissions";
  if (/\b(part|spare|stock|inventory|shortage)/.test(q)) return "spare_parts";
  return "unknown";
}

export function askCopilot(req: AskRequest, ctx: Ctx): CopilotAnswer {
  const q = req.question.toLowerCase();
  const idMatch = /\b[a-z]{2,4}(?:-[a-z]{1,4})+-\d{2,3}\b/i.exec(req.question);
  const assetId = idMatch && ctx.world.assets.has(idMatch[0].toUpperCase()) ? idMatch[0].toUpperCase() : null;
  // A place named in the question wins over the page's scope; the longest name, so "Gulf Coast Midstream" beats "Gulf".
  const named = [...ctx.world.nodes.values()]
    .filter((n) => ["region", "business_unit", "site"].includes(n.node.level) && q.includes(n.node.name.toLowerCase()))
    .sort((a, b) => b.node.name.length - a.node.name.length)[0];
  const scopeId = named?.node.id ?? req.scopeId ?? ENTERPRISE_SCOPE;
  // "in the enterprise" reads better than "in Enterprise".
  const scopeName = scopeId === ENTERPRISE_SCOPE ? "the enterprise" : (ctx.world.nodes.get(scopeId)?.node.name ?? scopeId);
  const scope = scopeId === ENTERPRISE_SCOPE ? undefined : scopeId;
  const cls = classIn(q);
  const intent = intentOf(q, assetId);

  const base = { question: req.question, intent, generatedBy: "scripted", answeredAt: iso(ctx.now) };
  const answer = (
    understoodAs: string | null,
    paragraphs: CopilotAnswer["paragraphs"],
    actions: CopilotAction[],
    followUps: string[],
  ): CopilotAnswer => ({
    ...base,
    understoodAs,
    paragraphs,
    actions,
    followUps: followUps.filter((f) => f.toLowerCase() !== q).slice(0, intent === "unknown" ? followUps.length : 3),
  });

  switch (intent) {
    case "likely_failures": {
      const days = daysIn(q);
      const kind = cls ? plural(ASSET_CLASSES[cls].label) : "assets";
      const found = ctx.request("predictions.list", {
        scopeId: scope,
        status: ["open", "acknowledged", "actioned"],
        assetClass: cls ? [cls] : undefined,
        maxRulDays: days,
        sort: "probability",
        limit: 5,
      });
      const understood = `${cls ? ASSET_CLASSES[cls].label + "s" : "All equipment"} · ${scopeName} · next ${days} days`;
      if (found.total === 0)
        return answer(
          understood,
          [
            {
              text: `No ${kind} in ${scopeName} have a predicted failure within ${days} days.`,
              citations: [page("/predictive", "Predictions")],
            },
          ],
          [{ kind: "open", label: "Open predictions", path: "/predictive" }],
          [`Which alarms are urgent in ${scopeName}?`, "How big is the maintenance backlog?"],
        );
      const top = found.items[0]!;
      const paragraphs: CopilotAnswer["paragraphs"] = [
        {
          text: `${found.total} ${found.total === 1 ? kind.replace(/s$/, "") : kind} in ${scopeName} ${found.total === 1 ? "is" : "are"} predicted to fail within ${days} days (median remaining life). The most likely:`,
          citations: [page("/predictive", "Predictions")],
        },
        ...found.items.slice(0, 3).map((p) => ({
          text: `${p.assetId}: ${p.failureMode.label.toLowerCase()}, ${pct(p.probability)} likely within ${p.horizonDays} days${p.rul ? `, about ${Math.round(p.rul.p50Days)} days left` : ""}. A failure would cost about ${money(p.recommendedAction.failureCost.amount)}; acting now about ${money(p.recommendedAction.interventionCost.amount)}.`,
          citations: [
            { kind: "prediction" as const, id: p.id, label: p.id },
            { kind: "asset" as const, id: p.assetId, label: p.assetId },
          ],
        })),
      ];
      const actions: CopilotAction[] = [{ kind: "open", label: "Open predictions", path: "/predictive" }];
      if (!top.workOrderId)
        actions.unshift({
          kind: "create_work_order",
          label: `Raise a work order for ${top.assetId}`,
          assetId: top.assetId,
          predictionId: top.id,
          title: `${top.recommendedAction.summary} (${top.assetId})`,
        });
      return answer(understood, paragraphs, actions, [`How is ${top.assetId}?`, `Which alarms are urgent in ${scopeName}?`]);
    }

    case "asset_status": {
      const a = ctx.request("assets.get", { assetId: assetId! });
      const preds = ctx.request("predictions.list", { assetId: assetId!, status: ["open", "acknowledged", "actioned"], limit: 3 });
      const alarms = ctx.request("alarms.list", { assetId: assetId!, states: ["active_unacked", "active_acked"], limit: 3 });
      const work = ctx.request("workOrders.list", {
        assetId: assetId!,
        status: ["requested", "triaged", "planned", "scheduled", "approved", "in_progress"],
        limit: 3,
      });
      const assetCite: Citation = { kind: "asset", id: a.id, label: a.id };
      const paragraphs: CopilotAnswer["paragraphs"] = [
        {
          text: `${a.id} (${a.name}) is ${a.health.state}, health score ${Math.round(a.health.score)} of 100, and ${a.operatingStatus.replace(/_/g, " ")}.`,
          citations: [assetCite],
        },
        preds.total
          ? {
              text: `${preds.total} open prediction${preds.total === 1 ? "" : "s"}: ${preds.items.map((p) => `${p.failureMode.label.toLowerCase()} (${pct(p.probability)})`).join(", ")}.`,
              citations: preds.items.map((p) => ({ kind: "prediction" as const, id: p.id, label: p.id })),
            }
          : { text: "No open predictions.", citations: [assetCite] },
        alarms.total
          ? {
              text: `${alarms.total} active alarm${alarms.total === 1 ? "" : "s"}: ${alarms.items.map((x) => `${x.message} (${x.priority.toUpperCase()})`).join("; ")}.`,
              citations: alarms.items.map((x) => ({ kind: "alarm" as const, id: x.id, label: x.id })),
            }
          : { text: "No active alarms.", citations: [assetCite] },
        work.total
          ? {
              text: `${work.total} open work order${work.total === 1 ? "" : "s"}: ${work.items.map((w) => `${w.number} (${w.status.replace("_", " ")})`).join(", ")}.`,
              citations: work.items.map((w) => ({ kind: "work_order" as const, id: w.id, label: w.number })),
            }
          : { text: "No open work orders.", citations: [assetCite] },
      ];
      return answer(
        `${a.id} · ${a.name}`,
        paragraphs,
        [{ kind: "open", label: `Open ${a.id}`, path: `/assets/${a.id}/overview` }],
        [
          `Which ${plural(ASSET_CLASSES[a.assetClass].label)} are likely to fail in the next 30 days?`,
          "Which alarms are urgent right now?",
        ],
      );
    }

    case "urgent_alarms": {
      const open = ctx.request("alarms.list", {
        scopeId: scope,
        states: ["active_unacked", "active_acked"],
        priorities: ["p1", "p2"],
        sort: "priority",
        limit: 3,
      });
      const unacked = ctx.request("alarms.list", { scopeId: scope, states: ["active_unacked"], priorities: ["p1", "p2"], limit: 1 });
      const paragraphs: CopilotAnswer["paragraphs"] = [
        {
          text: open.total
            ? `${open.total} urgent alarm${open.total === 1 ? " is" : "s are"} active in ${scopeName} (P1 and P2); ${unacked.total} not yet acknowledged.`
            : `No urgent (P1 or P2) alarms are active in ${scopeName}.`,
          citations: [page("/alarms", "Alarms")],
        },
        ...open.items.map((x) => ({
          text: `${x.assetId}: ${x.message} (${x.priority.toUpperCase()}${x.state === "active_unacked" ? ", not acknowledged" : ""}).`,
          citations: [
            { kind: "alarm" as const, id: x.id, label: x.id },
            { kind: "asset" as const, id: x.assetId, label: x.assetId },
          ],
        })),
      ];
      return answer(
        `Urgent alarms · ${scopeName}`,
        paragraphs,
        [{ kind: "open", label: "Open alarms", path: "/alarms" }],
        [
          open.items[0] ? `How is ${open.items[0].assetId}?` : "How big is the maintenance backlog?",
          `Which pumps in ${scopeName} are likely to fail in the next 30 days?`,
        ],
      );
    }

    case "maintenance_backlog": {
      const open = ctx.request("workOrders.list", {
        scopeId: scope,
        status: ["requested", "triaged", "planned", "scheduled", "approved", "in_progress"],
        limit: 1,
      });
      const doing = ctx.request("workOrders.list", { scopeId: scope, status: ["in_progress"], limit: 1 });
      const pm = ctx.request("pm.overview", { scopeId: scope });
      return answer(
        `Maintenance backlog · ${scopeName}`,
        [
          {
            text: `${open.total} work orders are open in ${scopeName}, ${doing.total} of them in progress.`,
            citations: [page("/maintenance", "Maintenance")],
          },
          {
            text: `Preventive maintenance: ${pm.counts.compliancePct === null ? "no PM jobs were due" : `${pm.counts.compliancePct.toFixed(1)} % done on time over the last 90 days`}; ${pm.counts.overdue} overdue with no work order yet, ${pm.counts.dueSoon} due in the next 30 days.`,
            citations: [page("/maintenance/pm", "PM programs")],
          },
        ],
        [
          { kind: "open", label: "Open the work-order board", path: "/maintenance" },
          { kind: "open", label: "Open PM programs", path: "/maintenance/pm" },
        ],
        ["Which alarms are urgent right now?", "Which spare parts are running short?"],
      );
    }

    case "value": {
      const f = ctx.request("financials.overview", { scopeId: scope });
      return answer(
        `Value from predictions · ${scopeName} · last 12 months`,
        [
          {
            text: `Over the last 12 months, finished predictive jobs in ${scopeName} prevented failures worth ${money(f.value.avoided)} for ${money(f.value.cost)} of work: ${money(f.value.net)} net, from ${f.value.jobs} jobs (${f.value.falseAlarms} false alarms, counted as cost only).`,
            citations: [page("/financials", "Financials")],
          },
          {
            text: `Open predictions put ${money(f.atRisk.amount)} at risk (probability × failure cost), and downtime from failures cost ${money(f.downtime.cost)}.`,
            citations: [page("/financials", "Financials")],
          },
        ],
        [{ kind: "open", label: "Open Financials", path: "/financials" }],
        ["Which pumps are likely to fail in the next 30 days?", "What are our emissions?"],
      );
    }

    case "emissions": {
      const e = ctx.request("esg.overview", { scopeId: scope });
      const t = (v: number) => `${Math.round(v).toLocaleString("en-US")} t`;
      return answer(
        `Emissions · ${scopeName} · last 90 days`,
        [
          {
            text: `${scopeName.charAt(0).toUpperCase()}${scopeName.slice(1)} emitted ${t(e.totals.co2e)} CO₂e in the last 90 days: ${t(e.totals.combustion)} from burning fuel, ${t(e.totals.flaring)} from flaring and ${t(e.totals.methane)} from methane. On course for ${t(e.totals.projectedAnnual)} this year, against a target of ${t(e.totals.annualTarget)}.`,
            citations: [page("/esg", "Energy & ESG")],
          },
          {
            text: `${t(e.totals.avoidable)} of it was avoidable: added by poor equipment health (fouled turbines, leaks, flaring while compressors were down). Solar avoided ${t(e.totals.avoided)} on the grid.`,
            citations: [page("/esg", "Energy & ESG")],
          },
        ],
        [{ kind: "open", label: "Open Energy & ESG", path: "/esg" }],
        ["How much have predictions saved this year?", "Which alarms are urgent right now?"],
      );
    }

    case "spare_parts": {
      const inv = ctx.request("inventory.overview", { scopeId: scope, status: ["short", "reorder"] });
      return answer(
        `Spare parts · ${scopeName}`,
        [
          {
            text: `${inv.counts.short} stock lines in ${scopeName} are short of what the demand forecast needs, and ${inv.counts.reorder} are at or below their reorder point; ${inv.counts.openOrders} purchase orders are open.`,
            citations: [page("/inventory", "Inventory")],
          },
          ...inv.lines.slice(0, 3).map((l) => ({
            text: `${l.partNumber} (${l.description}) at ${l.siteId}: ${l.onHand} on hand, ${l.demand} needed soon; order ${l.suggestedQty}.`,
            citations: [page(`/inventory/parts/${l.partNumber}`, l.partNumber)],
          })),
        ],
        [{ kind: "open", label: "Open Inventory", path: "/inventory" }],
        ["How big is the maintenance backlog?", "Which pumps are likely to fail in the next 30 days?"],
      );
    }

    case "unknown":
      return answer(
        null,
        [
          {
            text: "I can only answer questions I was built for: likely failures, an asset's condition, urgent alarms, the maintenance backlog, value from predictions, emissions and spare parts. Try one of these:",
            citations: [],
          },
        ],
        [],
        EXAMPLES,
      );
  }
}

export { EXAMPLES as COPILOT_EXAMPLES };
