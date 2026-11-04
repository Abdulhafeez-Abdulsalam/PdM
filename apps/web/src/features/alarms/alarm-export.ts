/** The columns of an alarm export. Values in the units the person has chosen. */
import type { Alarm } from "@pdm/contracts";
import type { TFunction } from "i18next";
import type { ExportColumn } from "../../shared/export/ExportButton";
import type { UnitSystem } from "../../shared/preferences";
import { conversionFor } from "../../shared/units";

export function alarmColumns(t: TFunction, units: UnitSystem): ExportColumn<Alarm>[] {
  const inUnits = (a: Alarm, v: number | null) =>
    v === null || !a.quantity ? v : Number(conversionFor(a.quantity, units).convert(v).toPrecision(6));
  return [
    { header: t("export.col.id"), value: (a) => a.id },
    { header: t("export.col.priority"), value: (a) => a.priority.toUpperCase() },
    { header: t("export.col.asset"), value: (a) => a.assetId },
    { header: t("export.col.alarm"), value: (a) => a.message },
    { header: t("export.col.state"), value: (a) => t(`alarmList.states.${a.state}`) },
    { header: t("export.col.value"), value: (a) => inUnits(a, a.value) },
    { header: t("export.col.limit"), value: (a) => inUnits(a, a.limit) },
    { header: t("export.col.unit"), value: (a) => (a.quantity ? t(`unitSymbol.${conversionFor(a.quantity, units).unit}`) : null) },
    { header: t("export.col.raised"), value: (a) => a.raisedAt },
    { header: t("export.col.acknowledged"), value: (a) => a.acknowledgedAt },
    { header: t("export.col.firstOut"), value: (a) => (a.firstOut ? t("export.yes") : null) },
    { header: t("export.col.followed"), value: (a) => a.followsAlarmId },
    { header: t("export.col.escalatedTo"), value: (a) => a.escalation?.toName ?? null },
  ];
}
