/**
 * Acceptance criterion F in a real browser: every screen, in all three themes, checked by
 * axe-core including colour contrast (which the jsdom test in src/test/a11y.test.tsx can't do).
 *
 * One test per screen: each stays well within its time limit, and a failure names the screen.
 * (It used to be one test for everything, which ran past 10 minutes on a busy machine.)
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, open, test, type Role, type Theme } from "./helpers";

const THEMES: Theme[] = ["light", "dark", "control-room"];

/** Real ids from the running demo. They depend on the date, so they're looked up, not hard-coded. */
interface Ids {
  prediction: string;
  task: string;
  workOrder: string;
}

let ids: Ids;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage();
  await open(page, "/predictive", { role: "reliability_engineer" });
  const prediction = (await page.locator('main a[href^="/predictive/PRED-"]').first().getAttribute("href"))!;
  await open(page, "/field", { role: "field_technician" });
  const task = (await page
    .getByRole("region", { name: /^In progress/ })
    .getByRole("link")
    .first()
    .getAttribute("href"))!;
  ids = { prediction, task, workOrder: task.replace("/field/tasks/", "/maintenance/") };
  await page.close();
});

const SCREENS: [name: string, url: (ids: Ids) => string, role: Role][] = [
  ["Command Center", () => "/command-center", "plant_manager"],
  ["Asset registry", () => "/assets", "reliability_engineer"],
  ["Fleet comparison", () => "/assets/compare?class=pump&measure=anomaly", "reliability_engineer"],
  ["Asset 360: overview", () => "/assets/CBC-GT-101", "reliability_engineer"],
  ["Asset 360: telemetry", () => "/assets/CBC-GT-101/telemetry", "reliability_engineer"],
  ["Asset 360: health", () => "/assets/CBC-GT-101/health", "reliability_engineer"],
  ["Asset 360: gas turbine performance", () => "/assets/CBC-GT-101/performance", "reliability_engineer"],
  ["Asset 360: transformer performance", () => "/assets/ANP-TX-104/performance", "reliability_engineer"],
  ["Asset 360: alarms", () => "/assets/CBC-GT-101/alarms", "reliability_engineer"],
  ["Asset 360: maintenance", () => "/assets/CBC-GT-101/maintenance", "reliability_engineer"],
  ["Asset 360: documents", () => "/assets/CBC-GT-101/documents", "reliability_engineer"],
  ["Asset 360: related", () => "/assets/CBC-GT-101/related", "reliability_engineer"],
  ["Asset 360: comments", () => "/assets/CBC-GT-101/comments", "reliability_engineer"],
  ["Gas-to-power operations", () => "/operations/power?site=ANP", "plant_manager"],
  ["Solar operations", () => "/operations/solar", "plant_manager"],
  ["Oil & gas: upstream", () => "/operations/oil-gas", "plant_manager"],
  ["Oil & gas: midstream", () => "/operations/oil-gas?part=midstream", "plant_manager"],
  ["Oil & gas: downstream", () => "/operations/oil-gas?part=downstream", "plant_manager"],
  ["Asset 360: well performance", () => "/assets/PBU-WH-103/performance", "reliability_engineer"],
  ["Asset 360: ESP performance", () => "/assets/PBU-ESP-107/performance", "reliability_engineer"],
  ["Asset 360: pipeline integrity", () => "/assets/GCM-PL-142/performance", "reliability_engineer"],
  ["Asset 360: exchanger performance", () => "/assets/RKR-HX-118/performance", "reliability_engineer"],
  ["Asset 360: inverter performance", () => "/assets/PCS-INV-117/performance", "reliability_engineer"],
  ["Asset 360: string performance", () => "/assets/PCS-STR-150/performance", "reliability_engineer"],
  ["Asset 360: battery performance", () => "/assets/PCS-BESS-102/performance", "reliability_engineer"],
  ["Alarm list", () => "/alarms", "control_room_operator"],
  ["Event timeline", () => "/alarms?view=timeline", "control_room_operator"],
  ["Alarm performance", () => "/alarms/analytics", "control_room_operator"],
  ["Prediction console", () => "/predictive", "reliability_engineer"],
  ["Anomalies", () => "/predictive/anomalies", "condition_analyst"],
  ["Prediction page", (i) => i.prediction, "reliability_engineer"],
  ["Maintenance board", () => "/maintenance", "maintenance_planner"],
  ["Maintenance list", () => "/maintenance?view=list", "maintenance_planner"],
  ["Maintenance calendar", () => "/maintenance?view=calendar", "maintenance_planner"],
  ["Schedule board", () => "/maintenance/schedule", "maintenance_planner"],
  ["Work order page", (i) => i.workOrder, "maintenance_planner"],
  ["My jobs", () => "/field", "field_technician"],
  ["Field task", (i) => i.task, "field_technician"],
  ["Reliability", () => "/reliability?years=5", "reliability_engineer"],
  ["Weibull analysis", () => "/reliability/weibull?class=pump&mode=VIB", "reliability_engineer"],
  ["Risk matrix", () => "/reliability/risk?l=5&c=5", "reliability_engineer"],
  ["FMEA", () => "/reliability/fmea?class=gas_turbine", "reliability_engineer"],
  ["Root-cause analyses", () => "/reliability/rca", "reliability_engineer"],
  ["Root-cause analysis", () => "/reliability/rca/RCA-001", "reliability_engineer"],
  ["Asset 360: failures", () => "/assets/CBC-GT-101/failures", "reliability_engineer"],
  ["Asset 360: vibration (rolling bearings)", () => "/assets/PBU-PMP-106/vibration", "reliability_engineer"],
  ["Asset 360: vibration (orbit)", () => "/assets/GCM-CMP-105/vibration", "reliability_engineer"],
  ["Digital twin: process area", () => "/twin", "control_room_operator"],
  ["Digital twin: pipeline", () => "/twin?site=GCM&area=GCM-PLA&h=6", "control_room_operator"],
  ["Digital twin: solar block", () => "/twin?site=PCS&area=PCS-BLB", "control_room_operator"],
  ["Asset 360: twin", () => "/assets/CBC-GT-101/twin", "control_room_operator"],
  ["PM programs", () => "/maintenance/pm", "maintenance_planner"],
  ["PM plan", () => "/maintenance/pm/PM-PMP-VIB", "maintenance_planner"],
  ["Later-phase page", () => "/inventory", "maintenance_planner"],
];

for (const [name, url, role] of SCREENS) {
  test(`${name} passes axe in every theme`, async ({ page }) => {
    const failures: string[] = [];
    for (const theme of THEMES) {
      await open(page, url(ids), { role, theme });
      const check = () => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      let { violations } = await check();
      // A finding must still be there a second later: once, a check caught the page mid-way
      // through switching screens and reported something that wasn't there when looked at again.
      if (violations.length > 0) {
        await page.waitForTimeout(1000);
        ({ violations } = await check());
      }
      for (const v of violations) failures.push(`[${theme}] ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
    }
    expect(failures).toEqual([]);
  });
}
