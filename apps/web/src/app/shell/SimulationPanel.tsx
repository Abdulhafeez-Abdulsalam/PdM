/** Demo controls for the mock backend: simulated clock, speed, chaos mode, storyline. */
import { useSimulationControl, useSimulationStatus } from "@pdm/api-client";
import { SIM_SPEEDS, type SimSpeed } from "@pdm/contracts";
import { Button, Select } from "@pdm/ui";
import { Play } from "lucide-react";
import { useTranslation } from "react-i18next";

const clockFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
});

export function SimulationPanel() {
  const { t } = useTranslation();
  const status = useSimulationStatus();
  const control = useSimulationControl();

  return (
    <section aria-labelledby="sim-title" className="m-2 rounded-lg border border-dashed border-line p-3 text-xs">
      <h2 id="sim-title" className="mb-2 flex items-center justify-between font-semibold tracking-wide text-fg-muted uppercase">
        {t("simulation.title")}
        <span className="rounded bg-sunken px-1.5 py-0.5 font-normal normal-case">{t("simulation.demoMode")}</span>
      </h2>
      {!status ? (
        <p className="text-fg-muted">…</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p>
            <span className="text-fg-muted">{t("simulation.simTime")}: </span>
            <time dateTime={status.simTime} className="font-mono">
              {clockFormat.format(new Date(status.simTime))}
            </time>
          </p>
          <Select
            label={t("simulation.speed")}
            value={String(status.speed)}
            options={SIM_SPEEDS.map((s) => ({ value: String(s), label: t("simulation.speedValue", { speed: s }) }))}
            onChange={(v) => void control({ type: "set_speed", speed: Number(v) as SimSpeed })}
          />
          <label className="flex items-start gap-2" title={t("simulation.chaosHint")}>
            <input
              type="checkbox"
              className="mt-0.5"
              checked={status.chaos}
              onChange={(e) => void control({ type: "set_chaos", enabled: e.target.checked })}
            />
            <span>
              {t("simulation.chaos")}
              <span className="block text-fg-muted">{t("simulation.chaosHint")}</span>
            </span>
          </label>
          {status.storyline ? (
            <div>
              <p className="mb-1">{t("simulation.storyline", { asset: status.storyline.assetId })}</p>
              <p className="font-semibold">{t(`simulation.phases.${status.storyline.phase}`)}</p>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(status.storyline.progress * 100)}
                className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken"
              >
                <div className="h-full bg-accent" style={{ width: `${status.storyline.progress * 100}%` }} />
              </div>
            </div>
          ) : (
            <Button size="sm" onClick={() => void control({ type: "start_storyline" })}>
              <Play aria-hidden className="size-3.5" />
              {t("simulation.startStoryline")}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
