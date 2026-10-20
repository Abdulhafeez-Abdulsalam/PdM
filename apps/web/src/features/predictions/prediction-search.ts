/** Prediction console filters, in the URL so a filtered view can be shared. */
import { PredictionSort, type PredictionStatus } from "@pdm/contracts";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";

export const PREDICTION_SHOW = ["active", "open", "dismissed", "closed", "all"] as const;
export const MIN_PROBABILITY = ["any", "0.5", "0.7", "0.9"] as const;
export const WITHIN_DAYS = ["any", "7", "30", "90"] as const;

const schema = z.object({
  show: z.enum(PREDICTION_SHOW).catch("active"),
  min: z.enum(MIN_PROBABILITY).catch("any"),
  within: z.enum(WITHIN_DAYS).catch("any"),
  sort: PredictionSort.catch("exposure"),
});
export type PredictionSearch = z.output<typeof schema>;

export function usePredictionSearch(): [PredictionSearch, (patch: Partial<PredictionSearch>) => void] {
  const search = schema.parse(useSearch({ strict: false }));
  const navigate = useNavigate();
  const set = (patch: Partial<PredictionSearch>) =>
    void navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }) });
  return [search, set];
}

/** "Active" = still needs attention or action. */
export const STATUSES_FOR: Record<(typeof PREDICTION_SHOW)[number], PredictionStatus[] | undefined> = {
  active: ["open", "acknowledged", "actioned"],
  open: ["open"],
  dismissed: ["dismissed"],
  closed: ["closed"],
  all: undefined,
};
