/**
 * Model-quality signal from people's feedback. The simulation has no years of history, so
 * a plausible trailing-12-month baseline is seeded per scope; feedback given in the demo is
 * added on top, so you can watch precision move.
 */
import type { PredictionFeedbackSummary } from "@pdm/contracts";
import type { AssetRecord } from "./model";
import { hashNoise, hashString } from "./random";
import type { Snapshot } from "./snapshot";

export function feedbackSummary(scopeId: string, assets: readonly AssetRecord[], snapshot: Snapshot): PredictionFeedbackSummary {
  const seed = hashString(`feedback:${scopeId}`);
  const baseTp = Math.round((assets.length / 20) * (0.8 + 0.4 * hashNoise(seed, 1)));
  let truePositive = baseTp;
  let falsePositive = Math.round(baseTp * (0.15 + 0.15 * hashNoise(seed, 2)));
  let foundSomethingElse = Math.round(baseTp * (0.05 + 0.07 * hashNoise(seed, 3)));

  const ids = new Set(assets.map((a) => a.data.id));
  for (const p of snapshot.predictions) {
    if (!ids.has(p.assetId)) continue;
    if (p.feedback === "true_positive") truePositive++;
    else if (p.feedback === "false_positive") falsePositive++;
    else if (p.feedback === "found_something_else") foundSomethingElse++;
  }

  const judged = truePositive + falsePositive;
  return {
    scopeId,
    truePositive,
    falsePositive,
    foundSomethingElse,
    precision: judged === 0 ? null : Math.round((truePositive / judged) * 1000) / 1000,
  };
}
