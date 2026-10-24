/** The Reliability module's pages: KPIs, Weibull analysis, the risk matrix, FMEA and root-cause analysis. */
import { useTranslation } from "react-i18next";
import { SubNav } from "../../shared/widgets/SubNav";

export function ReliabilityNav() {
  const { t } = useTranslation();
  return (
    <SubNav
      label={t("reliabilityNav.label")}
      pages={[
        { to: "/reliability", label: t("reliabilityNav.kpis") },
        { to: "/reliability/weibull", label: t("reliabilityNav.weibull") },
        { to: "/reliability/risk", label: t("reliabilityNav.risk") },
        { to: "/reliability/fmea", label: t("reliabilityNav.fmea") },
        { to: "/reliability/rca", label: t("reliabilityNav.rca") },
      ]}
    />
  );
}
