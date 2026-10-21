/**
 * Work-order checklists (spec §6.14): safety checks before starting, steps while working,
 * and hand-held readings to enter. Built from the work-order type and the asset's tags.
 */
import { isChecklistItemDone, type ChecklistItem, type ChecklistResult, type Quantity, type WorkOrderType } from "@pdm/contracts";
import { ApiFailure } from "./errors";
import type { AssetRecord, TagRecord } from "./model";

const SAFETY = [
  "Permit to work issued and displayed at the job site",
  "Equipment isolated, locked and tagged out (LOTO); zero energy verified",
  "Gas test done; area safe to work",
] as const;

const STEPS: Record<WorkOrderType, readonly string[]> = {
  corrective: ["Confirm the reported fault", "Carry out the repair", "Test run; check for leaks and abnormal noise"],
  preventive: [
    "Inspect for leaks, corrosion and loose fixings",
    "Lubricate per the lubrication schedule",
    "Replace filters and consumables",
  ],
  predictive: [
    "Inspect the component named in the prediction",
    "Carry out the recommended action",
    "Test run; confirm readings are back to normal",
  ],
  condition_based: [
    "Inspect the component named in the alert",
    "Carry out the recommended action",
    "Test run; confirm readings are back to normal",
  ],
  inspection: ["Carry out the inspection per procedure", "Record any defects in the findings"],
  calibration: ["Check against the reference instrument", "Adjust and record as-left values"],
  shutdown: ["Complete the turnaround scope item", "Box up and leak test"],
  regulatory: ["Carry out the statutory inspection per procedure", "Record the results for the certificate"],
};

/** Work that takes the equipment apart needs isolation; looking at it doesn't. */
const NEEDS_ISOLATION: ReadonlySet<WorkOrderType> = new Set([
  "corrective",
  "preventive",
  "predictive",
  "condition_based",
  "shutdown",
  "calibration",
]);

/** Quantities a technician can measure with hand-held instruments, most useful first. */
const MEASURABLE: readonly Quantity[] = ["vibration_velocity", "temperature", "pressure", "current"];
const TAKES_READINGS: ReadonlySet<WorkOrderType> = new Set(["corrective", "preventive", "predictive", "condition_based", "inspection"]);

function readingTags(asset: AssetRecord): TagRecord[] {
  return MEASURABLE.flatMap((q) => asset.tags.filter((t) => t.tag.quantity === q && t.tag.limits.highAlert !== undefined)).slice(0, 2);
}

export function checklistFor(type: WorkOrderType, asset: AssetRecord): ChecklistItem[] {
  const item = (id: string, kind: ChecklistItem["kind"], label: string, tagId: string | null = null): ChecklistItem => ({
    id,
    kind,
    label,
    required: true,
    tagId,
    done: false,
    value: null,
  });
  const safety = NEEDS_ISOLATION.has(type) ? SAFETY : [SAFETY[0], SAFETY[2]];
  const readings = TAKES_READINGS.has(type) ? readingTags(asset) : [];
  return [
    ...safety.map((label, i) => item(`safety-${i + 1}`, "safety", label)),
    ...STEPS[type].map((label, i) => item(`step-${i + 1}`, "step", label)),
    ...readings.map((r, i) => item(`reading-${i + 1}`, "reading", r.tag.description, r.tag.id)),
    ...(NEEDS_ISOLATION.has(type) ? [item(`step-${STEPS[type].length + 1}`, "step", "Remove isolation and hand back to operations")] : []),
  ];
}

/** A believable in-range value for a reading, used when the simulation completes work itself. */
export function nominalValue(tag: TagRecord | undefined): number | null {
  if (!tag) return null;
  const { lowAlert, highAlert } = tag.tag.limits;
  if (highAlert === undefined) return lowAlert ?? null;
  return lowAlert === undefined ? Math.round(highAlert * 0.55 * 100) / 100 : Math.round(((lowAlert + highAlert) / 2) * 100) / 100;
}

/** Copies the technician's results onto the checklist. Unknown item ids are refused. */
export function applyResults(checklist: ChecklistItem[], results: readonly ChecklistResult[]): void {
  for (const r of results) {
    const item = checklist.find((i) => i.id === r.itemId);
    if (!item) throw new ApiFailure("bad_request", `Unknown checklist item ${r.itemId}`);
    item.done = r.done;
    if (item.kind === "reading") item.value = r.value;
  }
}

/** Throws if any required line of the given kinds is not finished. */
export function requireDone(checklist: readonly ChecklistItem[], kinds: readonly ChecklistItem["kind"][], message: string): void {
  const missing = checklist.filter((i) => kinds.includes(i.kind) && i.required && !isChecklistItemDone(i));
  if (missing.length > 0)
    throw new ApiFailure("bad_request", `${message}: ${missing.map((i) => i.label).join("; ")}`, { itemIds: missing.map((i) => i.id) });
}
