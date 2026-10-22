/** A plant's batteries: charge, health, and how far apart their cells have drifted. */
import type { BessRow } from "@pdm/contracts";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { usePreferences } from "../../shared/preferences";
import { formatIn } from "./power-format";

export function BessTable({ bess }: { bess: readonly BessRow[] }) {
  const { t } = useTranslation();
  const units = usePreferences((p) => p.units);
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{t("solar.bessTitle")}</caption>
      <thead>
        <tr className="border-b border-line text-left text-xs text-fg-muted">
          <th scope="col" className="py-1 font-medium">
            {t("solar.col.battery")}
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            {t("solar.col.soc")}
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            {t("solar.col.soh")}
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            {t("solar.col.cellSpread")}
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            {t("solar.col.cellTemp")}
          </th>
        </tr>
      </thead>
      <tbody>
        {bess.map((b) => (
          <tr key={b.assetId} className="border-b border-line last:border-0">
            <td className="py-1">
              <Link
                to="/assets/$assetId/$tab"
                params={{ assetId: b.assetId, tab: "performance" }}
                className="font-mono whitespace-nowrap hover:underline"
              >
                {b.assetId}
              </Link>
              <span className="block text-xs text-fg-muted">{t(`solar.bessState.${b.state}`)}</span>
            </td>
            <td className="py-1 text-right tabular-nums">{b.socPct === null ? "—" : `${b.socPct.toFixed(0)} %`}</td>
            <td className="py-1 text-right tabular-nums">{b.sohPct === null ? "—" : `${b.sohPct.toFixed(1)} %`}</td>
            <td className="py-1 text-right tabular-nums">{b.cellSpreadMv === null ? "—" : `${b.cellSpreadMv} mV`}</td>
            <td className="py-1 text-right tabular-nums">
              {b.cellTempMaxC === null ? "—" : formatIn(b.cellTempMaxC, "temperature", units, t, 1)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
