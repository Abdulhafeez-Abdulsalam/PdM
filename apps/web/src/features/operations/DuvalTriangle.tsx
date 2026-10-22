/**
 * Duval triangle 1: where a transformer's gas mix sits tells what kind of fault is making the
 * gas. Each corner is 100% of one gas (methane at the top, ethylene bottom right, acetylene
 * bottom left), counting only those three. Hot spots push the point right (more ethylene as
 * they get hotter); electrical discharges pull it left (acetylene).
 *
 * Points are dots in the first series colour; those worth a look are larger and labelled.
 * One transformer's samples can be joined as a path to show where it's heading. Arrow keys
 * move a tooltip from point to point; the table next to it holds every number.
 */
import { DUVAL_ZONE_SHAPES, DuvalZone } from "@pdm/contracts";
import { useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

export interface DuvalMark {
  id: string;
  label: string;
  ch4Pct: number;
  c2h4Pct: number;
  c2h2Pct: number;
  zone: DuvalZone;
  /** Larger and labelled. */
  emphasis?: boolean;
}

const W = 400;
const H = 360;
const SIDE = 300;
const LEFT = { x: 50, y: 320 }; // 100% C2H2
const RIGHT = { x: LEFT.x + SIDE, y: LEFT.y }; // 100% C2H4
const TOP = { x: LEFT.x + SIDE / 2, y: LEFT.y - (SIDE * Math.sqrt(3)) / 2 }; // 100% CH4

/** Screen position of a gas mix. */
function at(c2h4: number, c2h2: number): { x: number; y: number } {
  const ch4 = 100 - c2h4 - c2h2;
  return {
    x: (c2h2 * LEFT.x + c2h4 * RIGHT.x + ch4 * TOP.x) / 100,
    y: (c2h2 * LEFT.y + c2h4 * RIGHT.y + ch4 * TOP.y) / 100,
  };
}

/** Where each zone's name goes (PD is too small to hold its name, so it sits beside it). */
const ZONE_LABEL: Record<DuvalZone, readonly [number, number]> = {
  PD: [-6, 3],
  T1: [10, 2],
  T2: [35, 2],
  T3: [72, 6],
  D1: [10, 45],
  D2: [36, 40],
  DT: [52, 21],
};

export function DuvalTriangle({
  marks,
  path,
  label,
  summary,
}: {
  marks: readonly DuvalMark[];
  path?: boolean;
  label: string;
  summary: string;
}) {
  const { t } = useTranslation();
  const [active, setActive] = useState<number | null>(null);

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const n = marks.length;
    setActive((a) => Math.min(n - 1, Math.max(0, (a ?? (e.key === "ArrowLeft" ? n : -1)) + (e.key === "ArrowLeft" ? -1 : 1))));
  };
  const current = active === null ? null : marks[active];
  const pos = (m: DuvalMark) => at(m.c2h4Pct, m.c2h2Pct);

  return (
    <div className="relative mx-auto w-full max-w-[420px]">
      <svg
        role="img"
        aria-label={`${label}. ${summary}`}
        tabIndex={0}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pdm-focus-ring)]"
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
      >
        {DuvalZone.options.map((z) => (
          <polygon
            key={z}
            points={DUVAL_ZONE_SHAPES[z]
              .map(([c2h4, c2h2]) => {
                const p = at(c2h4, c2h2);
                return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
              })
              .join(" ")}
            fill="none"
            stroke="var(--pdm-text-secondary)"
            strokeOpacity={0.6}
            strokeWidth={1}
          />
        ))}
        {DuvalZone.options.map((z) => {
          const [c2h4, c2h2] = ZONE_LABEL[z];
          const p = z === "PD" ? { x: TOP.x - 14, y: TOP.y + 4 } : at(c2h4, c2h2);
          return (
            <text
              key={`l${z}`}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={11}
              fill="var(--pdm-text-secondary)"
            >
              {z}
            </text>
          );
        })}
        <text x={TOP.x} y={TOP.y - 10} textAnchor="middle" fontSize={11} fill="var(--pdm-text-secondary)">
          {t("dga.axisCh4")}
        </text>
        <text x={RIGHT.x} y={RIGHT.y + 18} textAnchor="end" fontSize={11} fill="var(--pdm-text-secondary)">
          {t("dga.axisC2h4")}
        </text>
        <text x={LEFT.x} y={LEFT.y + 18} textAnchor="start" fontSize={11} fill="var(--pdm-text-secondary)">
          {t("dga.axisC2h2")}
        </text>
        {path && marks.length > 1 && (
          <polyline
            points={marks.map((m) => `${pos(m).x.toFixed(1)},${pos(m).y.toFixed(1)}`).join(" ")}
            fill="none"
            stroke="var(--pdm-series-1)"
            strokeWidth={1.5}
          />
        )}
        {marks.map((m, i) => {
          const p = pos(m);
          return (
            <circle
              key={m.id}
              cx={p.x}
              cy={p.y}
              r={m.emphasis ? 6 : 4}
              fill="var(--pdm-series-1)"
              stroke={active === i ? "var(--pdm-text-primary)" : "var(--pdm-bg-surface)"}
              strokeWidth={2}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
            />
          );
        })}
        {marks
          .filter((m) => m.emphasis)
          .map((m) => {
            const p = pos(m);
            const right = p.x < TOP.x + 40;
            return (
              <text
                key={`t${m.id}`}
                x={p.x + (right ? 9 : -9)}
                y={p.y - 8}
                textAnchor={right ? "start" : "end"}
                fontSize={11}
                fill="var(--pdm-text-primary)"
              >
                {m.label}
              </text>
            );
          })}
      </svg>
      {current && (
        <div
          role="status"
          className="pointer-events-none absolute top-0 left-0 rounded-md border border-line bg-raised px-2 py-1 text-xs shadow-2"
        >
          <span className="block font-semibold">{current.label}</span>
          <span className="block">{t("dga.tooltipMix", { ch4: current.ch4Pct, c2h4: current.c2h4Pct, c2h2: current.c2h2Pct })}</span>
          <span className="block">{t(`dga.zone.${current.zone}`)}</span>
        </div>
      )}
    </div>
  );
}
