/**
 * Who is on call right now, site by site (spec §6.5). An urgent alarm nobody answers moves along
 * this chain by itself. Folded away by default: it matters when you need it, not all the time.
 */
import { useApiQuery } from "@pdm/api-client";
import { ESCALATION_CHAIN } from "@pdm/contracts";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { makeTimeFormatter } from "../../shared/format";
import { usePreferences } from "../../shared/preferences";

export function OnCallPanel({ scopeId }: { scopeId: string }) {
  const { t } = useTranslation();
  const tz = usePreferences((p) => p.timeZone);
  const format = useMemo(() => makeTimeFormatter(tz === "site" ? "utc" : tz), [tz]);
  const onCall = useApiQuery("alarms.onCall", { scopeId }, { refetchInterval: 60_000 });
  if (!onCall.data) return null;

  return (
    <details className="rounded-lg border border-line bg-surface">
      <summary className="cursor-pointer px-4 py-2 text-sm font-semibold">
        {t("onCall.title")}
        <span className="ml-2 font-normal text-fg-muted">{t("onCall.until", { time: format(Date.parse(onCall.data.shiftEndsAt)) })}</span>
      </summary>
      <p className="px-4 text-sm text-fg-muted">{t("onCall.intro")}</p>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a named, focusable scroll region is the recommended pattern here */}
      <div tabIndex={0} role="region" aria-label={t("onCall.title")} className="overflow-x-auto p-4 pt-2">
        <table className="w-full text-sm">
          <caption className="sr-only">{t("onCall.title")}</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-fg-muted">
              <th scope="col" className="py-1 pr-4 font-medium">
                {t("onCall.site")}
              </th>
              {ESCALATION_CHAIN.map((role) => (
                <th key={role} scope="col" className="py-1 pr-4 font-medium">
                  {t(`roles.${role}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {onCall.data.sites.map((site) => (
              <tr key={site.siteId} className="border-b border-line last:border-0">
                <th scope="row" className="py-1 pr-4 text-left font-normal">
                  {site.siteName}
                </th>
                {site.chain.map((person, i) => (
                  <td key={i} className="py-1 pr-4 whitespace-nowrap">
                    {person.name}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
