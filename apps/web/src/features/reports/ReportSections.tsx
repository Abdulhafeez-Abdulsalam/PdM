/**
 * The building blocks of every report. Each section asks the server for data the app already
 * serves and shows it as a table of figures (measure · value · how it was worked out) plus,
 * where useful, a short detail table. Tables print well and keep each number's working on the
 * page, where a hover tooltip would be lost on paper.
 */
import { useApiQuery } from "@pdm/api-client";
import { ENTERPRISE_SCOPE, LABOUR_RATE, type EsgIntensity, type KpiKey } from "@pdm/contracts";
import { Skeleton } from "@pdm/ui";
import { useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { TableExportButton } from "../../shared/export/ExportButton";
import { formatCurrency, formatNumber, formatProbability } from "../../shared/format";
import { formatKpiValue } from "../command-center/KpiStrip";
import type { SectionId } from "./report-defs";

interface Figure {
  label: string;
  value: string;
  how?: string;
}

const KPI_KEYS: readonly KpiKey[] = [
  "enterprise_health",
  "availability",
  "mtbf",
  "mttr",
  "open_critical_alarms",
  "maintenance_backlog",
  "pm_compliance",
  "planned_maintenance_ratio",
  "avoided_downtime_cost",
];

const hours = (v: number | null) => (v === null ? "—" : `${formatNumber(v, v < 100 ? 1 : 0)} h`);
const pct = (v: number | null) => (v === null ? "—" : `${formatNumber(v, 1)} %`);
const money = (v: number) => formatCurrency(v, "USD");

/** One section of a printed report. */
function Section({
  id,
  intro,
  figures,
  children,
  loading,
}: {
  id: SectionId;
  intro?: string;
  figures?: Figure[];
  children?: ReactNode;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const title = t(`reports.section.${id}.title`);
  return (
    <section
      aria-labelledby={`report-${id}`}
      className="break-inside-avoid-page rounded-lg border border-line bg-surface p-4 print:rounded-none print:border-0 print:border-t print:px-0"
    >
      <h3 id={`report-${id}`} className="font-semibold">
        {title}
      </h3>
      {intro && <p className="mb-2 text-sm text-fg-muted">{intro}</p>}
      {loading ? (
        <Skeleton className="h-32" />
      ) : (
        <div className="flex flex-col gap-3">
          {figures && (
            <Table
              caption={t("reports.figuresCaption", { title })}
              columns={[t("reports.col.measure"), t("reports.col.value"), t("reports.col.how")]}
              numeric={[false, true, false]}
              rows={figures.map((f) => [f.label, f.value, f.how ?? ""])}
            />
          )}
          {children}
        </div>
      )}
    </section>
  );
}

/** A plain table; the first column labels each row. */
function Table({ caption, columns, rows, numeric = [] }: { caption: string; columns: string[]; rows: ReactNode[][]; numeric?: boolean[] }) {
  const align = (i: number) => (numeric[i] ? "text-right tabular-nums" : "text-left");
  const table = useRef<HTMLTableElement>(null);
  return (
    <div className="relative -mx-4 overflow-x-auto print:mx-0 print:overflow-visible">
      <div className="flex justify-end px-4 pb-1 print:hidden">
        <TableExportButton what={caption} table={table} />
      </div>
      <table ref={table} className="w-full min-w-[560px] text-sm print:min-w-0">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-xs text-fg-muted">
            {columns.map((c, i) => (
              <th key={c} scope="col" className={`py-1 font-medium ${i === 0 ? "px-4 print:pl-0" : "pr-3"} ${align(i)}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-b border-line align-top last:border-0">
              {row.map((cell, i) =>
                i === 0 ? (
                  <th key={i} scope="row" className="px-4 py-1.5 text-left font-normal print:pl-0">
                    {cell}
                  </th>
                ) : (
                  <td key={i} className={`py-1.5 pr-3 ${align(i)} ${i === row.length - 1 && !numeric[i] ? "text-fg-muted" : ""}`}>
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KpisSection({ scopeId }: { scopeId: string }) {
  const { t } = useTranslation();
  const q = useApiQuery("kpis.get", { scopeId, keys: [...KPI_KEYS] });
  return (
    <Section
      id="kpis"
      loading={q.isPending}
      figures={q.data?.kpis.map((k) => {
        const { value, unit } = formatKpiValue(k);
        return { label: t(`kpi.${k.key}`), value: unit ? `${value} ${unit}` : value, how: k.lineage };
      })}
    />
  );
}

function RisksSection({ scopeId }: { scopeId: string }) {
  const { t } = useTranslation();
  const q = useApiQuery("risks.top", { scopeId, limit: 10 });
  return (
    <Section id="risks" intro={t("reports.section.risks.intro")} loading={q.isPending}>
      {q.data && (
        <Table
          caption={t("reports.section.risks.title")}
          columns={[
            t("reports.col.asset"),
            t("reports.col.failureMode"),
            t("reports.col.probability"),
            t("reports.col.within"),
            t("reports.col.risk"),
          ]}
          numeric={[false, false, true, true, true]}
          rows={q.data.items.map((r) => [
            <>
              <span className="font-mono">{r.assetId}</span> <span className="text-fg-muted">{r.assetName}</span>
            </>,
            r.failureModeLabel ?? "—",
            formatProbability(r.probability),
            r.horizonDays === null ? "—" : t("reports.days", { count: r.horizonDays }),
            formatNumber(r.riskScore, 1),
          ])}
        />
      )}
    </Section>
  );
}

function ReliabilitySection({ scopeId }: { scopeId: string }) {
  const { t } = useTranslation();
  const q = useApiQuery("reliability.summary", { scopeId, years: 1 });
  const k = q.data?.kpis;
  return (
    <Section
      id="reliability"
      loading={q.isPending}
      figures={
        k && [
          {
            label: t("reports.rel.failures"),
            value: formatNumber(k.failures),
            how: t("reports.rel.failuresHow", { assets: formatNumber(k.assets) }),
          },
          { label: t("kpi.mtbf"), value: hours(k.mtbfHours), how: t("reports.rel.mtbfHow") },
          { label: t("kpi.mttr"), value: hours(k.mttrHours), how: t("reports.rel.mttrHow") },
          { label: t("kpi.availability"), value: pct(k.availabilityPct), how: t("reports.rel.availabilityHow") },
          { label: t("reports.rel.downtime"), value: hours(k.downtimeHours) },
          { label: t("reports.rel.repeats"), value: formatNumber(k.repeatFailures), how: t("reports.rel.repeatsHow") },
        ]
      }
    >
      {q.data && q.data.badActors.length > 0 && (
        <Table
          caption={t("reports.rel.badActors")}
          columns={[t("reports.rel.badActors"), t("reports.rel.failures"), t("reports.rel.downtime"), t("reports.rel.ratio")]}
          numeric={[false, true, true, true]}
          rows={q.data.badActors.slice(0, 5).map((b) => [
            <>
              <span className="font-mono">{b.assetId}</span> <span className="text-fg-muted">{b.assetName}</span>
            </>,
            formatNumber(b.failures),
            hours(b.downtimeHours),
            `× ${formatNumber(b.ratioToClass, 1)}`,
          ])}
        />
      )}
    </Section>
  );
}

function PmSection({ scopeId }: { scopeId: string }) {
  const { t } = useTranslation();
  const q = useApiQuery("pm.overview", { scopeId });
  const c = q.data?.counts;
  return (
    <Section
      id="pm"
      loading={q.isPending}
      figures={
        c && [
          { label: t("kpi.pm_compliance"), value: pct(c.compliancePct), how: t("reports.pm.complianceHow") },
          {
            label: t("reports.pm.decided"),
            value: formatNumber(c.decided),
            how: t("reports.pm.decidedHow", { onTime: formatNumber(c.onTime), late: formatNumber(c.late), missed: formatNumber(c.missed) }),
          },
          { label: t("reports.pm.overdue"), value: formatNumber(c.overdue), how: t("reports.pm.overdueHow") },
          { label: t("reports.pm.dueSoon"), value: formatNumber(c.dueSoon) },
        ]
      }
    />
  );
}

function AlarmsSection({ scopeId }: { scopeId: string }) {
  const { t } = useTranslation();
  const q = useApiQuery("alarms.analytics", { scopeId, window: "7d" });
  return (
    <Section
      id="alarms"
      intro={t("reports.alarms.intro")}
      loading={q.isPending}
      figures={q.data && [{ label: t("reports.alarms.total"), value: formatNumber(q.data.total), how: t("reports.alarms.totalHow") }]}
    >
      {q.data && (
        <Table
          caption={t("reports.alarms.bySite")}
          columns={[
            t("reports.col.site"),
            t("reports.alarms.total"),
            t("reports.alarms.average"),
            t("reports.alarms.peak"),
            t("reports.alarms.flood"),
          ]}
          numeric={[false, true, true, true, true]}
          rows={q.data.sites.map((s) => [
            s.siteName,
            formatNumber(s.total),
            formatNumber(s.averagePer10Min, 1),
            formatNumber(s.peakPer10Min),
            pct(s.floodPercent),
          ])}
        />
      )}
    </Section>
  );
}

function InventorySection({ scopeId }: { scopeId: string }) {
  const { t } = useTranslation();
  const q = useApiQuery("inventory.overview", { scopeId });
  const c = q.data?.counts;
  const needing = q.data?.lines.filter((l) => l.status === "short" || l.status === "reorder").slice(0, 10) ?? [];
  return (
    <Section
      id="inventory"
      loading={q.isPending}
      figures={
        c && [
          { label: t("reports.inv.lines"), value: formatNumber(c.lines) },
          { label: t("reports.inv.short"), value: formatNumber(c.short), how: t("reports.inv.shortHow") },
          { label: t("reports.inv.reorder"), value: formatNumber(c.reorder), how: t("reports.inv.reorderHow") },
          { label: t("reports.inv.excess"), value: formatNumber(c.excess) },
          { label: t("reports.inv.openOrders"), value: formatNumber(c.openOrders) },
        ]
      }
    >
      {needing.length > 0 && (
        <Table
          caption={t("reports.inv.toOrder")}
          columns={[
            t("reports.inv.toOrder"),
            t("reports.col.site"),
            t("reports.inv.onHand"),
            t("reports.inv.reorderPoint"),
            t("reports.inv.suggested"),
          ]}
          numeric={[false, false, true, true, true]}
          rows={needing.map((l) => [
            <>
              <span className="font-mono">{l.partNumber}</span> <span className="text-fg-muted">{l.description}</span>
            </>,
            l.siteId,
            formatNumber(l.onHand),
            formatNumber(l.reorderPoint),
            formatNumber(l.suggestedQty),
          ])}
        />
      )}
    </Section>
  );
}

function HseSection({ scopeId }: { scopeId: string }) {
  const { t } = useTranslation();
  const q = useApiQuery("hse.overview", { scopeId });
  const c = q.data?.counts;
  return (
    <Section
      id="hse"
      loading={q.isPending}
      figures={
        c && [
          {
            label: t("reports.hse.impaired"),
            value: t("reports.hse.ofSces", { impaired: formatNumber(c.impaired), total: formatNumber(c.sces) }),
            how: t("reports.hse.impairedHow"),
          },
          {
            label: t("reports.hse.permits"),
            value: t("reports.hse.permitsValue", { waiting: formatNumber(c.permitsWaiting), issued: formatNumber(c.permitsIssued) }),
          },
          {
            label: t("reports.hse.tier"),
            value: t("reports.hse.tierValue", { tier1: formatNumber(c.tier1), tier2: formatNumber(c.tier2) }),
            how: t("reports.hse.tierHow"),
          },
          { label: t("reports.hse.nearMisses"), value: formatNumber(c.nearMisses) },
          { label: t("reports.hse.moc"), value: formatNumber(c.openMoc) },
        ]
      }
    />
  );
}

function EsgSection({ scopeId }: { scopeId: string }) {
  const { t } = useTranslation();
  const q = useApiQuery("esg.overview", { scopeId });
  const o = q.data;
  const tonnes = (v: number) => t("esg.tonnes", { value: formatNumber(Math.round(v)) });
  const intensity = (i: EsgIntensity | null) =>
    i === null ? "—" : t(`esg.intensity.${i.unit}`, { value: i.unit === "t_per_mwh" ? i.value.toFixed(3) : formatNumber(i.value, 1) });
  return (
    <Section
      id="esg"
      loading={q.isPending}
      figures={
        o && [
          { label: t("reports.esg.emitted"), value: tonnes(o.totals.co2e), how: t("esg.kpi.co2eHow") },
          {
            label: t("esg.kpi.projected"),
            value: tonnes(o.totals.projectedAnnual),
            how: t("esg.kpi.target", { target: formatNumber(Math.round(o.totals.annualTarget)) }),
          },
          { label: t("esg.kpi.methane"), value: tonnes(o.totals.methane) },
          { label: t("reports.esg.flaring"), value: tonnes(o.totals.flaring) },
          { label: t("esg.kpi.avoided"), value: tonnes(o.totals.avoided), how: t("esg.kpi.avoidedHow") },
          { label: t("esg.kpi.avoidable"), value: tonnes(o.totals.avoidable), how: t("esg.kpi.avoidableHow") },
        ]
      }
    >
      {o && (
        <Table
          caption={t("esg.sitesCaption")}
          columns={[t("reports.col.site"), t("reports.esg.emitted"), t("esg.col.intensity"), t("esg.col.target")]}
          numeric={[false, true, true, false]}
          rows={o.sites
            .filter((s) => s.co2e > 0)
            .map((s) => [
              s.siteName,
              tonnes(s.co2e),
              intensity(s.intensity),
              t(s.projectedAnnual <= s.annualTarget ? "esg.onTrack" : "esg.offTrack", {
                projected: formatNumber(Math.round(s.projectedAnnual)),
                target: formatNumber(Math.round(s.annualTarget)),
              }),
            ])}
        />
      )}
    </Section>
  );
}

function FinancialsSection({ scopeId }: { scopeId: string }) {
  const { t } = useTranslation();
  const q = useApiQuery("financials.overview", { scopeId });
  const o = q.data;
  return (
    <Section
      id="financials"
      loading={q.isPending}
      figures={
        o && [
          {
            label: t("financials.kpi.value"),
            value: money(o.value.net),
            how: t("financials.kpi.valueHow", { avoided: money(o.value.avoided), cost: money(o.value.cost) }),
          },
          { label: t("financials.kpi.atRisk"), value: money(o.atRisk.amount), how: t("financials.kpi.atRiskHow") },
          { label: t("financials.kpi.downtime"), value: money(o.downtime.cost), how: t("financials.kpi.downtimeHow") },
          {
            label: t("financials.kpi.spend"),
            value: money(o.spend.total),
            how: `${t("financials.kpi.budget", { budget: money(o.spend.budget) })}. ${t("financials.kpi.spendHow", { rate: formatCurrency(LABOUR_RATE, "USD", false) })}`,
          },
          { label: t("financials.kpi.planned"), value: pct(o.spend.plannedPct), how: t("financials.kpi.plannedHow") },
        ]
      }
    >
      {o && (
        <Table
          caption={t("financials.kindsCaption")}
          columns={[t("financials.col.kind"), t("financials.col.jobs"), t("financials.col.average"), t("financials.col.total")]}
          numeric={[false, true, true, true]}
          rows={o.spend.byCategory.map((c) => [
            t(`financials.kind.${c.category}`),
            formatNumber(c.jobs),
            formatCurrency(c.average, "USD", false),
            money(c.total),
          ])}
        />
      )}
    </Section>
  );
}

const COMPONENTS: Record<SectionId, (p: { scopeId: string }) => ReactNode> = {
  kpis: KpisSection,
  risks: RisksSection,
  reliability: ReliabilitySection,
  pm: PmSection,
  alarms: AlarmsSection,
  inventory: InventorySection,
  hse: HseSection,
  esg: EsgSection,
  financials: FinancialsSection,
};

/** A whole report: a heading saying what it covers and when it was made, then its sections. */
export function ReportDocument({
  title,
  sections,
  scopeId,
  generatedAt,
}: {
  title: string;
  sections: readonly SectionId[];
  scopeId: string;
  generatedAt: number;
}) {
  const { t } = useTranslation();
  const node = useApiQuery("hierarchy.node", { nodeId: scopeId });
  const scopeName = scopeId === ENTERPRISE_SCOPE ? t("reports.wholeEnterprise") : (node.data?.name ?? scopeId);
  return (
    <article aria-labelledby="report-title" className="flex flex-col gap-4">
      <header className="border-b border-line pb-2">
        <h2 id="report-title" className="text-xl font-semibold">
          {title}
        </h2>
        <p className="text-sm text-fg-muted">
          {t("reports.coverage", {
            scope: scopeName,
            at: new Date(generatedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }),
          })}
        </p>
      </header>
      {sections.length === 0 ? (
        <p className="text-fg-muted">{t("reports.noSections")}</p>
      ) : (
        sections.map((s) => {
          const Component = COMPONENTS[s];
          return <Component key={s} scopeId={scopeId} />;
        })
      )}
    </article>
  );
}
