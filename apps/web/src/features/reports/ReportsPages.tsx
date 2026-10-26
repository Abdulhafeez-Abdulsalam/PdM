/**
 * Reports (Phase 4, chunk 6): the library of ready-made reports, one report, and the builder.
 * Every report prints (or saves as PDF) through the browser: the app around it hides, and dark
 * themes switch to light for the printout (ThemeSync in providers.tsx).
 */
import { Button } from "@pdm/ui";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { FileText, Printer, SlidersHorizontal, Users } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSimNow } from "../../shared/sim-time";
import { globalSearchSchema, useGlobalSearch } from "../../shared/time-range";
import { SubNav } from "../../shared/widgets/SubNav";
import { REPORTS, SECTIONS, isReportId, parseSections, type ReportId, type SectionId } from "./report-defs";
import { ReportDocument } from "./ReportSections";

export function ReportsNav() {
  const { t } = useTranslation();
  return (
    <div className="print:hidden">
      <SubNav
        label={t("reports.nav.label")}
        pages={[
          { to: "/reports", label: t("reports.nav.library") },
          { to: "/reports/handover", label: t("reports.nav.handover") },
          { to: "/reports/build", label: t("reports.nav.build") },
        ]}
      />
    </div>
  );
}

/** Page header shared by the reports pages; hidden on paper (the report has its own title). */
export function ReportsHeader({ intro }: { intro: string }) {
  const { t } = useTranslation();
  useEffect(() => {
    document.title = `${t("modules.reports.name")} · ${t("app.name")}`;
  }, [t]);
  return (
    <>
      <header className="print:hidden">
        <h1 className="text-2xl font-semibold">{t("modules.reports.name")}</h1>
        <p className="text-fg-muted">{intro}</p>
      </header>
      <ReportsNav />
    </>
  );
}

export function PrintButton() {
  const { t } = useTranslation();
  return (
    <Button variant="primary" onClick={() => window.print()} className="print:hidden">
      <Printer aria-hidden className="size-4" />
      {t("reports.print")}
    </Button>
  );
}

export function ReportsPage() {
  const { t } = useTranslation();
  const { scope, range } = globalSearchSchema.parse(useSearch({ strict: false }));
  const card = "flex flex-col gap-2 rounded-lg border border-line bg-surface p-4";
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <ReportsHeader intro={t("reports.intro")} />
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(Object.keys(REPORTS) as ReportId[]).map((id) => (
          <li key={id} className={card}>
            <h2 className="flex items-center gap-2 font-semibold">
              <FileText aria-hidden className="size-4 text-fg-muted" />
              <Link to="/reports/$reportId" params={{ reportId: id }} search={{ scope, range }} className="text-accent underline">
                {t(`reports.report.${id}.title`)}
              </Link>
            </h2>
            <p className="text-sm text-fg-muted">{t(`reports.report.${id}.description`)}</p>
            <p className="text-xs text-fg-muted">
              {t("reports.contains", { sections: REPORTS[id].map((s) => t(`reports.section.${s}.title`)).join(" · ") })}
            </p>
          </li>
        ))}
        <li className={card}>
          <h2 className="flex items-center gap-2 font-semibold">
            <Users aria-hidden className="size-4 text-fg-muted" />
            <Link to="/reports/handover" search={{ scope, range }} className="text-accent underline">
              {t("reports.nav.handover")}
            </Link>
          </h2>
          <p className="text-sm text-fg-muted">{t("reports.handoverDescription")}</p>
        </li>
        <li className={card}>
          <h2 className="flex items-center gap-2 font-semibold">
            <SlidersHorizontal aria-hidden className="size-4 text-fg-muted" />
            <Link to="/reports/build" search={{ scope, range }} className="text-accent underline">
              {t("reports.nav.build")}
            </Link>
          </h2>
          <p className="text-sm text-fg-muted">{t("reports.buildDescription")}</p>
        </li>
      </ul>
    </div>
  );
}

export function ReportPage() {
  const { t } = useTranslation();
  const { reportId } = useParams({ strict: false }) as { reportId: string };
  const { scopeId } = useGlobalSearch();
  const { now } = useSimNow();
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4">
      <ReportsHeader intro={t("reports.reportIntro")} />
      {isReportId(reportId) ? (
        <>
          <div className="flex justify-end print:hidden">
            <PrintButton />
          </div>
          <ReportDocument title={t(`reports.report.${reportId}.title`)} sections={REPORTS[reportId]} scopeId={scopeId} generatedAt={now} />
        </>
      ) : (
        <p className="text-health-warning">{t("reports.unknown", { id: reportId })}</p>
      )}
    </div>
  );
}

export function ReportBuilderPage() {
  const { t } = useTranslation();
  const search = useSearch({ strict: false }) as { sections?: unknown };
  const navigate = useNavigate();
  const chosen = parseSections(search.sections);
  const { scopeId } = useGlobalSearch();
  const { now } = useSimNow();
  const toggle = (s: SectionId, on: boolean) => {
    const next = on ? [...chosen, s] : chosen.filter((c) => c !== s);
    void navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => ({ ...prev, sections: next.length ? parseSections(next.join(",")).join(",") : undefined }),
      replace: true,
    });
  };
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4">
      <ReportsHeader intro={t("reports.buildIntro")} />
      <fieldset className="rounded-lg border border-line bg-surface p-4 print:hidden">
        <legend className="px-1 font-semibold">{t("reports.chooseSections")}</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((s) => (
            <label key={s} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={chosen.includes(s)} onChange={(e) => toggle(s, e.target.checked)} className="size-4" />
              {t(`reports.section.${s}.title`)}
            </label>
          ))}
        </div>
        <p className="mt-3 text-sm text-fg-muted">{t("reports.buildLink")}</p>
      </fieldset>
      {chosen.length > 0 && (
        <div className="flex justify-end print:hidden">
          <PrintButton />
        </div>
      )}
      <ReportDocument title={t("reports.customTitle")} sections={chosen} scopeId={scopeId} generatedAt={now} />
    </div>
  );
}
