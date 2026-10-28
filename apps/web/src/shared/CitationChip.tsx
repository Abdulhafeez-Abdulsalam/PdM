/**
 * A small tag pointing at the evidence behind an AI sentence (ADR-0010): the daily briefing and
 * the copilot. Assets, predictions, work orders and pages link to what they cite; alarms, KPIs
 * and tags show their id.
 */
import type { Citation } from "@pdm/contracts";
import { cx } from "@pdm/ui";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

const chip = "rounded border border-line px-1 font-mono text-[10px] leading-4 text-fg-muted";
const linked = `${chip} hover:text-fg hover:underline`;

export function CitationChip({ citation }: { citation: Citation }) {
  const { t } = useTranslation();
  const label = t("briefing.citation", { kind: t(`briefing.kinds.${citation.kind}`), label: citation.label });
  switch (citation.kind) {
    case "asset":
      return (
        <Link to="/assets/$assetId" params={{ assetId: citation.id }} search={(prev) => prev} aria-label={label} className={linked}>
          {citation.label}
        </Link>
      );
    case "prediction":
      return (
        <Link to="/predictive/$predictionId" params={{ predictionId: citation.id }} aria-label={label} className={linked}>
          {citation.label}
        </Link>
      );
    case "work_order":
      return (
        <Link to="/maintenance/$workOrderId" params={{ workOrderId: citation.id }} aria-label={label} className={linked}>
          {citation.label}
        </Link>
      );
    case "page":
      return (
        // A page's id is its path, e.g. "/financials" (checked by the contract to start with "/").
        <Link to={citation.id as "/"} aria-label={label} className={cx(linked, "font-sans")}>
          {citation.label}
        </Link>
      );
    default:
      return (
        <span title={label} className={chip}>
          {citation.label}
        </span>
      );
  }
}
