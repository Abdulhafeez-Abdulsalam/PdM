/**
 * Acceptance criterion F, automated: every screen, as the role that uses it, checked by
 * axe-core (the standard accessibility rules engine, WCAG 2.1 A and AA).
 *
 * jsdom has no layout or paint, so colour contrast can't be measured here. That's covered
 * by packages/ui/src/tokens.test.ts (every colour pair) and the Playwright checks in a real
 * browser (e2e/a11y.spec.ts, all three themes).
 */
import type { RoleId } from "@pdm/contracts";
import { createMockBackend } from "@pdm/mock-data";
import { screen } from "@testing-library/react";
import axe from "axe-core";
import { beforeEach, describe, expect, it } from "vitest";
import { usePreferences } from "../shared/preferences";
import { useToasts } from "../shared/toast";
import { TEST_SEED, TEST_START, renderApp } from "./render-app";

beforeEach(() => {
  useToasts.setState({ toasts: [] });
  sessionStorage.clear();
});

const probe = createMockBackend({ seed: TEST_SEED, startTime: TEST_START, realNow: () => TEST_START, role: "field_technician" });
const me = probe.request("me.get", {});
const prediction = probe.request("predictions.list", { limit: 1 }).items[0]!;
const workOrder = probe.request("workOrders.list", { status: ["in_progress"], limit: 1 }).items[0]!;
const myJob = probe.request("workOrders.list", { assigneeId: me.id, status: ["in_progress"], limit: 1 }).items[0]!;
const ASSET = "CBC-GT-101";

const SCREENS: [string, RoleId][] = [
  ["/command-center", "plant_manager"],
  ["/assets", "reliability_engineer"],
  ["/assets/compare?class=pump&measure=anomaly", "reliability_engineer"],
  [`/assets/${ASSET}`, "reliability_engineer"],
  [`/assets/${ASSET}/telemetry`, "reliability_engineer"],
  [`/assets/${ASSET}/health`, "reliability_engineer"],
  [`/assets/${ASSET}/performance`, "reliability_engineer"],
  ["/assets/ANP-TX-104/performance", "reliability_engineer"],
  [`/assets/${ASSET}/alarms`, "reliability_engineer"],
  [`/assets/${ASSET}/maintenance`, "reliability_engineer"],
  [`/assets/${ASSET}/documents`, "reliability_engineer"],
  [`/assets/${ASSET}/related`, "reliability_engineer"],
  [`/assets/${ASSET}/comments`, "reliability_engineer"],
  [`/command-center?prediction=${prediction.id}`, "reliability_engineer"],
  ["/operations/power", "plant_manager"],
  ["/operations/power?site=ANP", "plant_manager"],
  ["/operations/solar", "plant_manager"],
  ["/operations/oil-gas", "plant_manager"],
  ["/operations/oil-gas?part=midstream", "plant_manager"],
  ["/operations/oil-gas?part=downstream", "plant_manager"],
  ["/assets/PBU-WH-103/performance", "reliability_engineer"],
  ["/assets/PBU-ESP-107/performance", "reliability_engineer"],
  ["/assets/GCM-PL-142/performance", "reliability_engineer"],
  ["/assets/RKR-HX-118/performance", "reliability_engineer"],
  ["/assets/PCS-INV-117/performance", "reliability_engineer"],
  ["/assets/PCS-STR-150/performance", "reliability_engineer"],
  ["/assets/PCS-BESS-102/performance", "reliability_engineer"],
  ["/alarms", "control_room_operator"],
  ["/alarms?view=timeline", "control_room_operator"],
  ["/alarms/analytics", "control_room_operator"],
  ["/predictive", "reliability_engineer"],
  ["/predictive/anomalies", "condition_analyst"],
  [`/predictive/${prediction.id}`, "reliability_engineer"],
  ["/maintenance", "maintenance_planner"],
  ["/maintenance?view=list", "maintenance_planner"],
  ["/maintenance?view=calendar", "maintenance_planner"],
  ["/maintenance/schedule?span=2weeks", "maintenance_planner"],
  [`/maintenance/${workOrder.id}`, "maintenance_planner"],
  ["/field", "field_technician"],
  [`/field/tasks/${myJob.id}`, "field_technician"],
  ["/reliability", "reliability_engineer"],
  ["/reliability?years=5&class=pump", "reliability_engineer"],
  [`/assets/${ASSET}/failures`, "reliability_engineer"],
  ["/twin", "control_room_operator"], // a "coming in a later chunk" page
];

/** Wait until loading placeholders are gone, or have stopped changing (live values that never arrive in tests). */
async function settle() {
  // hidden: true, because an open dialog (like the prediction panel) correctly hides the page behind it.
  await screen.findByRole("heading", { level: 1, hidden: true });
  let last = -1;
  for (let i = 0, still = 0; i < 40 && still < 3; i++) {
    const now = document.querySelectorAll(".animate-pulse").length;
    if (now === 0) return;
    still = now === last ? still + 1 : 0;
    last = now;
    await new Promise((r) => setTimeout(r, 150));
  }
}

async function problems(): Promise<string[]> {
  const results = await axe.run(document.body, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    rules: { "color-contrast": { enabled: false } }, // needs a real browser; see the file comment
  });
  return results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

describe("accessibility (axe, WCAG 2.1 AA)", () => {
  it("the check itself works: it catches a button with no name", async () => {
    document.body.innerHTML = '<main><h1>Test</h1><button type="button"><svg aria-hidden="true"></svg></button></main>';
    expect((await problems()).join()).toMatch(/button-name/);
    document.body.innerHTML = "";
  });

  // axe walks every element; on big pages (the Kanban board has hundreds of cards) that takes
  // a while in jsdom, more so on a busy machine. Slow is fine here, so allow a minute.
  it.each(SCREENS)(
    "%s as %s",
    async (url, role) => {
      usePreferences.setState({ role, theme: "light", units: "si" });
      renderApp(url);
      await settle();
      expect(await problems()).toEqual([]);
    },
    60_000,
  );
});
