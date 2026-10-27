/**
 * Shown in place of any page whose module this role can't use (information architecture §4).
 * The menu already hides those modules; this covers a typed or shared address. Real protection
 * belongs on the server, which must refuse the data too: this is the screen's half.
 */
import { EmptyState } from "@pdm/ui";
import { Lock } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { ModuleId } from "./modules";
import { usePreferences } from "./preferences";

export function NoAccess({ moduleId }: { moduleId: ModuleId }) {
  const { t } = useTranslation();
  const role = usePreferences((p) => p.role);
  const name = t(`modules.${moduleId}.name`);
  useEffect(() => {
    document.title = `${name} · ${t("app.name")}`;
  }, [name, t]);
  // A heading like every other page, so screen-reader users land on the page's name.
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">{name}</h1>
      <EmptyState icon={<Lock className="size-8" />} title={t("placeholder.noAccessTitle")}>
        {t("placeholder.noAccess", { role: t(`roles.${role}`), module: name })}
      </EmptyState>
    </div>
  );
}
