/** The Operations module's pages, one per industry (oil & gas joins in the next chunk). */
import { useTranslation } from "react-i18next";
import { SubNav } from "../../shared/widgets/SubNav";

export function OperationsNav() {
  const { t } = useTranslation();
  return (
    <SubNav
      label={t("operationsNav.label")}
      pages={[
        { to: "/operations/power", label: t("operationsNav.power") },
        { to: "/operations/solar", label: t("operationsNav.solar") },
      ]}
    />
  );
}
