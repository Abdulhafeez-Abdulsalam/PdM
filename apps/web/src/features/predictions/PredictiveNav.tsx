/** The Predictive module's two pages: predictions (what will fail) and anomalies (what looks unusual). */
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
      ]}
    />
  );
}
