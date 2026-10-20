/**
 * AI daily briefing (spec §6.1): what changed, what needs attention, what to do —
 * every sentence with citations back to the data (ADR-0010).
 */
import { useApiQuery } from "@pdm/api-client";
import type { Citation } from "@pdm/contracts";
import { HealthBadge, Skeleton } from "@pdm/ui";
import { keepPreviousData } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DashboardWidget } from "../../shared/widgets/DashboardWidget";

export function DailyBriefing({ scopeId, className }: { scopeId: string; className?: string }) {
  const { t } = useTranslation();
  const briefing = useApiQuery("briefing.daily", { scopeId }, { refetchInterval: 5 * 60_000, placeholderData: keepPreviousData });

  return (
    <DashboardWidget
      title={t("commandCenter.briefing")}
      lineage={t("commandCenter.briefingLineage")}
      query={briefing}
      staleAfterMs={15 * 60_000}
      className={className}
      skeleton={
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {briefing.data?.sections.map((section) => (
          <section key={section.key}>
            <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-fg-muted uppercase">{t(`briefing.${section.key}`)}</h3>
            <ul className="flex flex-col gap-2">
              {section.items.map((item, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  {item.severity ? (
                    <HealthBadge compact state={item.severity} label={t(`health.${item.severity}`)} className="mt-0.5" />
                  ) : (
                    <span className="size-4 shrink-0" />
                  )}
                  <span className="min-w-0">
                    {item.text}
                    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
                      {item.citations.map((c) => (
                        <CitationChip key={`${c.kind}-${c.id}`} citation={c} />
                      ))}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {briefing.data && (
          <p className="flex items-center gap-1 text-xs text-fg-muted">
            <Sparkles aria-hidden className="size-3" />
            {t("briefing.generatedBy", { provider: briefing.data.generatedBy, hours: briefing.data.periodHours })}
          </p>
        )}
      </div>
    </DashboardWidget>
  );
}

/** A small tag pointing at the evidence. Assets link to their page; other kinds get links in later phases. */
function CitationChip({ citation }: { citation: Citation }) {
  const { t } = useTranslation();
  const className = "rounded border border-line px-1 font-mono text-[10px] leading-4 text-fg-muted";
  const label = t("briefing.citation", { kind: t(`briefing.kinds.${citation.kind}`), label: citation.label });
  if (citation.kind === "asset") {
    return (
      <Link
        to="/assets/$assetId"
        params={{ assetId: citation.id }}
        search={(prev) => prev}
        aria-label={label}
        className={`${className} hover:text-fg hover:underline`}
      >
        {citation.label}
      </Link>
    );
  }
  return (
    <span title={label} className={className}>
      {citation.label}
    </span>
  );
}
