/**
 * The Predictive module's pages: predictions (what will fail), anomalies (what looks unusual),
 * and the tools behind them: models, rules and the what-if simulator.
 */
import { useTranslation } from "react-i18next";
import { SubNav } from "../../shared/widgets/SubNav";

export function PredictiveNav() {
  const { t } = useTranslation();
  return (
    <SubNav
      label={t("predictiveNav.label")}
      pages={[
        { to: "/predictive", label: t("predictiveNav.predictions") },
        { to: "/predictive/anomalies", label: t("predictiveNav.anomalies") },
        { to: "/predictive/models", label: t("predictiveNav.models") },
        { to: "/predictive/rules", label: t("predictiveNav.rules") },
        { to: "/predictive/what-if", label: t("predictiveNav.whatIf") },
      ]}
    />
  );
}
