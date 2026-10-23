/** The Reliability module's pages: the KPIs, Weibull analysis and the risk matrix. */
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
      ]}
    />
  );
}
