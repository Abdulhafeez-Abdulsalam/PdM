/** Shown if a whole page crashes (widgets have their own, smaller fallbacks). Offers a way out. */
import { Button, EmptyState } from "@pdm/ui";
import { type ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

export function ErrorPage({ error, reset }: ErrorComponentProps) {
  const { t } = useTranslation();
  return (
    <div className="p-6">
      <EmptyState icon={<TriangleAlert className="size-8" />} title={t("errorPage.title")}>
        <p>{t("errorPage.body")}</p>
        <p className="mt-2 font-mono text-xs">{error instanceof Error ? error.message : String(error)}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button onClick={reset}>{t("errorPage.retry")}</Button>
          <Button variant="ghost" onClick={() => window.location.assign("/")}>
            {t("errorPage.home")}
          </Button>
        </div>
      </EmptyState>
    </div>
  );
}
