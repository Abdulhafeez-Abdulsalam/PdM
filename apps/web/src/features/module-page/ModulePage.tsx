/**
 * Placeholder page for every module until its real screen is built. Already respects
 * role-based views: hidden modules explain themselves, view-only ones say so.
 */
import { EmptyState } from "@pdm/ui";
import { Lock } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { CURRENT_PHASE, moduleById, type ModuleId } from "../../shared/modules";
import { usePreferences } from "../../shared/preferences";
import { accessFor } from "../../shared/roles/roles";

export function ModulePage({ moduleId }: { moduleId: ModuleId }) {
  const { t } = useTranslation();
  const role = usePreferences((p) => p.role);
  const module = moduleById(moduleId);
  const access = accessFor(role, moduleId);
  const name = t(`modules.${moduleId}.name`);
  const Icon = module.icon;

  useEffect(() => {
    document.title = `${name} · ${t("app.name")}`;
  }, [name, t]);

  if (access === "none") {
    return (
      <EmptyState icon={<Lock className="size-8" />} title={t("placeholder.noAccessTitle")}>
        {t("placeholder.noAccess", { role: t(`roles.${role}`), module: name })}
      </EmptyState>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 flex items-center gap-3">
        <Icon aria-hidden className="size-7 text-accent" />
        <div>
          <h1 className="text-2xl font-semibold">{name}</h1>
          <p className="text-fg-muted">{t(`modules.${moduleId}.description`)}</p>
        </div>
      </header>
      <EmptyState title={module.phase > CURRENT_PHASE ? t("placeholder.plannedFor", { phase: module.phase }) : t("placeholder.comingInChunk")}>
        {access === "view" && <p>{t("placeholder.viewOnly")}</p>}
      </EmptyState>
    </div>
  );
}
