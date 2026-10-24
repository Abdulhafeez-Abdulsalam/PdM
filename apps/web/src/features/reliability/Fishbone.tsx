/**
 * A fishbone (Ishikawa) diagram: the problem at the head, six bones for the places causes
 * usually hide (people, machine, method, material, measurement, environment), each cause a
 * short line on its bone. Purely a picture of the lists the form edits; the form is what
 * screen readers and keyboards use, and the picture's label summarises it.
 */
import { FISHBONE_CATEGORIES, type Fishbone as FishboneData } from "@pdm/contracts";
import { useTranslation } from "react-i18next";

const W = 760;
const H = 300;
const SPINE_Y = H / 2;
const HEAD_X = W - 150;
const truncate = (s: string, n = 26) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function FishboneDiagram({ data, problem }: { data: FishboneData; problem: string }) {
  const { t } = useTranslation();
  const total = FISHBONE_CATEGORIES.reduce((s, c) => s + data[c].length, 0);
  const summary = t("rca.fishboneSummary", {
    total,
    list: FISHBONE_CATEGORIES.map((c) => `${t(`rca.category.${c}`)} ${data[c].length}`).join(", "),
  });
  // Three bones above the spine, three below, evenly spaced along it.
  const bones = FISHBONE_CATEGORIES.map((c, i) => {
    const above = i < 3;
    const x = 90 + (i % 3) * ((HEAD_X - 120) / 3) + 60;
    const tipY = above ? 30 : H - 30;
    return { c, above, baseX: x + 70, tipX: x, tipY };
  });
  return (
    <svg role="img" aria-label={`${t("rca.fishboneLabel")}. ${summary}`} viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
      <line x1={30} y1={SPINE_Y} x2={HEAD_X} y2={SPINE_Y} stroke="var(--pdm-text-secondary)" strokeWidth={2} />
      <rect x={HEAD_X} y={SPINE_Y - 30} width={140} height={60} rx={6} fill="var(--pdm-bg-sunken)" stroke="var(--pdm-text-secondary)" />
      <foreignObject x={HEAD_X + 6} y={SPINE_Y - 26} width={128} height={52}>
        <p className="m-0 line-clamp-3 text-[11px] leading-tight text-fg">{problem}</p>
      </foreignObject>
      {bones.map(({ c, above, baseX, tipX, tipY }) => (
        <g key={c}>
          <line x1={tipX} y1={tipY} x2={baseX} y2={SPINE_Y} stroke="var(--pdm-text-secondary)" strokeWidth={1.5} />
          <text x={tipX} y={above ? tipY - 8 : tipY + 16} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--pdm-text-primary)">
            {t(`rca.category.${c}`)}
          </text>
          {data[c].slice(0, 4).map((cause, j) => {
            const f = (j + 1) / 5;
            const x = tipX + (baseX - tipX) * f;
            const y = tipY + (SPINE_Y - tipY) * f;
            return (
              <g key={j}>
                <line x1={x} y1={y} x2={x - 18} y2={y} stroke="var(--pdm-grid)" strokeWidth={1} />
                <text x={x - 20} y={y} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--pdm-text-secondary)">
                  {truncate(cause)}
                </text>
              </g>
            );
          })}
        </g>
      ))}
    </svg>
  );
}
