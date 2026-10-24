/** The HSE module's pages: overview, permits to work, incidents, management of change. */
import { useTranslation } from "react-i18next";
import { SubNav } from "../../shared/widgets/SubNav";

export function HseNav() {
  const { t } = useTranslation();
  return (
    <SubNav
      label={t("hse.nav.label")}
      pages={[
        { to: "/hse", label: t("hse.nav.overview") },
        { to: "/hse/permits", label: t("hse.nav.permits") },
        { to: "/hse/incidents", label: t("hse.nav.incidents") },
        { to: "/hse/moc", label: t("hse.nav.moc") },
      ]}
    />
  );
}

/** Page header shared by the HSE pages. */
export function HseHeader({ intro }: { intro: string }) {
  const { t } = useTranslation();
  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold">{t("modules.hse.name")}</h1>
        <p className="text-fg-muted">{intro}</p>
      </header>
      <HseNav />
    </>
  );
}
