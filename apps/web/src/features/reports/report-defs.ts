/**
 * Reports (Phase 4, chunk 6). A report is a title and a list of sections; each section is a
 * printable block built from data the app already serves. The library's reports are ready-made
 * lists, and the builder lets anyone pick their own (the choice lives in the URL, so a custom
 * report can be bookmarked or sent as a link).
 */

export const SECTIONS = ["kpis", "risks", "reliability", "pm", "alarms", "inventory", "hse", "esg", "financials"] as const;
export type SectionId = (typeof SECTIONS)[number];

export const REPORTS = {
  "weekly-reliability": ["kpis", "risks", "reliability", "pm", "alarms"],
  "monthly-esg": ["esg", "hse"],
  "monthly-financials": ["financials", "pm", "inventory"],
  "management-summary": ["kpis", "risks", "financials", "esg", "hse"],
} as const satisfies Record<string, readonly SectionId[]>;
export type ReportId = keyof typeof REPORTS;

export function isReportId(id: string): id is ReportId {
  return Object.hasOwn(REPORTS, id);
}

/** "kpis,risks" from the builder's URL → known sections in the standard order, no repeats. */
export function parseSections(value: unknown): SectionId[] {
  const wanted = new Set(typeof value === "string" ? value.split(",") : []);
  return SECTIONS.filter((s) => wanted.has(s));
}
