/** The Alarms module's two pages: the live alarms, and how well the alarm system performs. */
import { useTranslation } from "react-i18next";
import { SubNav } from "../../shared/widgets/SubNav";

export function AlarmsNav() {
  const { t } = useTranslation();
  return (
    <SubNav
      label={t("alarmsNav.label")}
      pages={[
        { to: "/alarms", label: t("alarmsNav.alarms") },
        { to: "/alarms/analytics", label: t("alarmsNav.analytics") },
      ]}
    />
  );
}
