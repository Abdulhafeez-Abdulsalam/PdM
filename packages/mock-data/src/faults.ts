/**
 * Fault maths. A fault's progress p runs from 0 (just started) to 1 (failed).
 * Sensors move by `atFailure × p²` — slow at first, then accelerating, like the classic
 * P–F curve: by the time a problem is obvious, failure is close.
 */
import type { FaultEffect } from "./catalog/fault-types";
import type { TagTemplate } from "./catalog/tag-templates";
import type { Fault, TagRecord } from "./model";

/** A model notices the fault once progress reaches this. Early enough to beat the first alarm. */
export const DETECTION_PROGRESS = 0.3;
const DEFAULT_LIMITS = [0.08, 0.15, 0.25] as const;

/** Progress ignoring repairs: how far the degradation had got by time t. */
export function rawProgress(fault: Fault, t: number): number {
  if (t <= fault.start) return 0;
  return Math.min((t - fault.start) / (fault.failAt - fault.start), 1);
}

/** Progress as it affects the asset: 0 again after a repair. */
export function progress(fault: Fault, t: number): number {
  if (fault.resolvedAt !== null && t >= fault.resolvedAt) return 0;
  return rawProgress(fault, t);
}

export function isActive(fault: Fault, t: number): boolean {
  return t >= fault.start && (fault.resolvedAt === null || t < fault.resolvedAt);
}

/** When progress reaches `p` (inverse of rawProgress). */
export function timeAtProgress(fault: Fault, p: number): number {
  return fault.start + p * (fault.failAt - fault.start);
}

function limitFractions(template: TagTemplate): readonly [number, number, number] {
  return template.limits ?? DEFAULT_LIMITS;
}

/** Whether this effect moves the tag in its "bad" direction (so it can cross limits). */
export function pushesTowardLimit(effect: FaultEffect, template: TagTemplate): boolean {
  return (template.bad === "high" && effect.direction === 1) || (template.bad === "low" && effect.direction === -1);
}

/** How far (fraction of base) the tag has moved at the moment of failure. */
export function atFailure(effect: FaultEffect, template: TagTemplate): number {
  if (effect.atFailure !== undefined) return effect.atFailure;
  return pushesTowardLimit(effect, template) ? limitFractions(template)[2] * 1.05 : 0.1;
}

/** Sum of all fault effects on a tag at time t, in the tag's units. */
export function faultOffset(tag: TagRecord, faults: readonly Fault[], t: number): number {
  let offset = 0;
  for (const fault of faults) {
    const p = progress(fault, t);
    if (p === 0) continue;
    for (const effect of fault.type.effects) {
      if (effect.tag !== tag.template.name) continue;
      offset += effect.direction * Math.abs(tag.base) * atFailure(effect, tag.template) * p * p;
    }
  }
  return offset;
}

/**
 * When a fault pushes a tag across each of its alert / alarm / trip limits.
 * Returns one entry per limit actually reached before failure. Uses the tag's current limits,
 * so an edited limit (admin.setLimits) moves the alarm: higher means later, or not at all.
 */
export function limitCrossings(fault: Fault, tag: TagRecord): { level: 0 | 1 | 2; t: number; limit: number }[] {
  const effect = fault.type.effects.find((e) => e.tag === tag.template.name);
  if (!effect || !pushesTowardLimit(effect, tag.template) || tag.base === 0) return [];
  const moveAtFailure = atFailure(effect, tag.template);
  const high = tag.template.bad === "high";
  const { limits } = tag.tag;
  const levels = high ? [limits.highAlert, limits.highAlarm, limits.highTrip] : [limits.lowAlert, limits.lowAlarm, limits.lowTrip];
  const crossings: { level: 0 | 1 | 2; t: number; limit: number }[] = [];
  levels.forEach((limit, level) => {
    if (limit === undefined) return;
    const fraction = high ? limit / tag.base - 1 : 1 - limit / tag.base;
    if (fraction <= 0 || moveAtFailure < fraction) return;
    const p = Math.sqrt(fraction / moveAtFailure);
    crossings.push({ level: level as 0 | 1 | 2, t: timeAtProgress(fault, p), limit });
  });
  return crossings;
}
