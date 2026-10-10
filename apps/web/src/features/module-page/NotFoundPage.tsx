import { EmptyState } from "@pdm/ui";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <EmptyState title={t("notFound.title")}>
      <p>{t("notFound.body")}</p>
      <Link to="/" className="mt-2 inline-block text-accent underline">
        {t("notFound.home")}
      </Link>
    </EmptyState>
  );
}
