/**
 * ISO 14224 failure coding (spec §6.6 close-out): a standard vocabulary for what failed,
 * why, and what was done, so failures can be compared across sites and fed back into
 * reliability analysis. A practical subset of the standard's tables; the names shown to
 * people live in the UI text catalog, keyed by these codes.
 */
import { z } from "zod";

/** Failure mode — what was observed (ISO 14224 Table B.6, common rotating/static codes). */
export const FailureModeCode = z.enum([
  "BRD", // breakdown
  "ELP", // external leakage — process medium
  "ELU", // external leakage — utility medium
  "ERO", // erratic output
  "FTS", // fail to start on demand
  "INL", // internal leakage
  "LOO", // low output
  "NOI", // noise
  "OHE", // overheating
  "PDE", // parameter deviation
  "PLU", // plugged / choked
  "STD", // structural deficiency
  "UST", // spurious stop
  "VIB", // vibration
  "AIR", // abnormal instrument reading
  "OTH", // other
]);
export type FailureModeCode = z.infer<typeof FailureModeCode>;

/** Failure mechanism — the physical cause (ISO 14224 Table B.2). */
export const FailureCauseCode = z.enum([
  "1.1", // leakage
  "1.2", // vibration
  "1.3", // clearance / alignment failure
  "1.5", // looseness
  "1.6", // sticking
  "2.1", // cavitation
  "2.2", // corrosion
  "2.3", // erosion
  "2.4", // wear
  "2.5", // breakage
  "2.6", // fatigue
  "2.7", // overheating
  "3.1", // control failure
  "3.3", // faulty signal / indication
  "3.4", // out of adjustment
  "4.1", // short circuiting
  "4.5", // earth / isolation fault
  "5.1", // blockage / plugged
  "5.2", // contamination
  "6.0", // misc. — unknown
]);
export type FailureCauseCode = z.infer<typeof FailureCauseCode>;

/** Maintenance activity — what was done (ISO 14224 Table B.5). */
export const RemedyCode = z.enum([
  "replace",
  "repair",
  "modify",
  "adjust",
  "refit",
  "check",
  "service",
  "test",
  "inspection",
  "overhaul",
  "combination",
  "other",
]);
export type RemedyCode = z.infer<typeof RemedyCode>;
