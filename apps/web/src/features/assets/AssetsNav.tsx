/** The Assets module's pages: the registry, and fleet comparison. */
import { useTranslation } from "react-i18next";
import { SubNav } from "../../shared/widgets/SubNav";

export function AssetsNav() {
  const { t } = useTranslation();
  return (
    <SubNav
      label={t("assetsNav.label")}
      pages={[
        { to: "/assets", label: t("assetsNav.registry") },
        { to: "/assets/compare", label: t("assetsNav.compare") },
      ]}
    />
  );
}
