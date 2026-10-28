/**
 * Every screen fits a phone: at 375 px wide the page itself never scrolls sideways. Wide tables
 * may scroll inside their own box; the page may not. Added in the Phase 3 review, which found
 * charts and tables pushing seven screens up to 850 px wide.
 *
 * This needs a real browser: charts measure their box with ResizeObserver, which jsdom lacks.
 */
import { expect, open, test, type Role } from "./helpers";

const SCREENS: [url: string, role: Role][] = [
  ["/command-center", "plant_manager"],
  ["/operations/power", "plant_manager"],
  ["/operations/solar", "plant_manager"],
  ["/operations/oil-gas", "plant_manager"],
  ["/reliability", "reliability_engineer"],
  ["/reliability/weibull", "reliability_engineer"],
  ["/reliability/risk", "reliability_engineer"],
  ["/reliability/fmea", "reliability_engineer"],
  ["/reliability/rca", "reliability_engineer"],
  ["/reliability/rca/RCA-001", "reliability_engineer"],
  ["/assets/CBC-GT-101/performance", "reliability_engineer"],
  ["/assets/ANP-TX-104/performance", "reliability_engineer"],
  ["/assets/CBC-GT-101/failures", "reliability_engineer"],
  ["/assets/PBU-PMP-106/vibration", "condition_analyst"],
  ["/assets/GCM-CMP-105/vibration", "condition_analyst"],
  ["/twin", "control_room_operator"],
  ["/twin?site=GCM&area=GCM-PLA", "control_room_operator"],
  ["/twin?site=PCS&area=PCS-BLB", "control_room_operator"],
  ["/assets/CBC-GT-101/twin", "control_room_operator"],
  ["/maintenance/pm", "maintenance_planner"],
  ["/maintenance/pm/PM-PMP-VIB", "maintenance_planner"],
  ["/inventory", "procurement"],
  ["/inventory/parts/SP-BRG-6309", "procurement"],
  ["/hse", "hse_officer"],
  ["/hse/permits?show=all", "hse_officer"],
  ["/hse/incidents", "hse_officer"],
  ["/hse/moc", "hse_officer"],
  ["/esg", "esg_lead"],
  ["/financials", "executive"],
  ["/reports/management-summary", "plant_manager"],
  ["/reports/handover", "control_room_operator"],
  ["/data", "condition_analyst"],
  ["/data/tags", "condition_analyst"],
  ["/admin", "system_admin"],
  ["/admin/users", "system_admin"],
  ["/admin/roles", "system_admin"],
  ["/admin/audit", "system_admin"],
  ["/predictive/models", "reliability_engineer"],
  ["/predictive/rules", "condition_analyst"],
  ["/predictive/what-if", "reliability_engineer"],
  ["/alarms/analytics", "control_room_operator"],
  ["/assets/compare?class=pump&measure=anomaly", "reliability_engineer"],
];

test.use({ viewport: { width: 375, height: 812 } });

for (const [url, role] of SCREENS) {
  test(`${url} fits a phone`, async ({ page }) => {
    await open(page, url, { role });
    await page.waitForTimeout(500); // charts settle to their measured width
    const { width, widest } = await page.evaluate(() => {
      const main = document.querySelector("main")!;
      const clipped = (el: Element) => {
        for (let p = el.parentElement; p && p !== main; p = p.parentElement)
          if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX)) return true;
        return false;
      };
      let widest = "";
      let right = main.clientWidth;
      for (const el of main.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.right > right + 1 && !clipped(el)) {
          right = r.right;
          widest = `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className?.toString() ?? "").slice(0, 60)}`;
        }
      }
      return { width: Math.max(document.documentElement.scrollWidth, main.scrollWidth) - main.clientWidth, widest };
    });
    expect(width, `page scrolls sideways by ${width} px; widest: ${widest}`).toBeLessThanOrEqual(1);
  });
}
