/**
 * Not a real test: prints a tour of the generated world so you can see what the mock produces.
 * Run with:  npm run inspect -w @pdm/mock-data
 */
import { it } from "vitest";
import { createMockBackend } from "./backend";
import { DAY, HOUR, iso } from "./clock";

it("prints a summary of the simulated world", () => {
  const started = performance.now();
  const b = createMockBackend({ startTime: Date.UTC(2026, 9, 10, 8) });
  const buildMs = Math.round(performance.now() - started);
  const w = b.world;
  const now = b.now();

  const byClass = new Map<string, number>();
  for (const a of w.assets.values()) byClass.set(a.data.assetClass, (byClass.get(a.data.assetClass) ?? 0) + 1);
  const states = new Map<string, number>();
  for (const c of b.snapshot().conditions.values()) states.set(c.health.state, (states.get(c.health.state) ?? 0) + 1);

  const lines: string[] = [];
  const say = (s = "") => lines.push(s);
  say(`Built in ${buildMs} ms — simulated time ${iso(now)}`);
  say(`${w.sites.size} sites · ${w.assets.size} assets · ${w.tags.size} tags · ${w.users.length} people · ${w.faults.length} developing faults`);
  say(`Assets by class: ${[...byClass].map(([k, v]) => `${k} ${v}`).join(", ")}`);
  say(`Health states: ${[...states].map(([k, v]) => `${k} ${v}`).join(", ")}`);

  const s = b.request("alarms.summary", {});
  say(`Alarms active: P1 ${s.active.p1} · P2 ${s.active.p2} · P3 ${s.active.p3} · P4 ${s.active.p4} (unacked ${Object.values(s.unacknowledged).reduce((a, x) => a + x, 0)}) · shelved ${s.shelved} · suppressed ${s.suppressed}`);

  say();
  say("Top 5 risks:");
  for (const r of b.request("risks.top", { limit: 5 }).items) {
    say(`  ${r.rank}. ${r.assetId.padEnd(14)} risk ${r.riskScore.toFixed(2)}  health ${r.health.score} (${r.health.state})  ${r.failureModeLabel ?? "—"}  in ${r.horizonDays ?? "—"} d`);
  }

  say();
  say("KPIs (enterprise):");
  for (const k of b.request("kpis.get", {}).kpis) say(`  ${k.key.padEnd(28)} ${k.value ?? "—"}${k.format === "percent" ? " %" : k.format === "hours" ? " h" : ""}`);

  say();
  say("CBC-GT-101 exhaust temperature, last 24 h (hourly samples):");
  const hist = b.request("timeseries.history", { tagIds: ["CBC-GT-101.EXH_TEMP"], from: iso(now - DAY), to: iso(now), maxPoints: 24 });
  say("  " + hist.series[0]!.points.map((p) => p.avg.toFixed(0)).join(" "));

  say();
  say("Pecos inverter PCS-INV-101 AC power over one day (kW, every 2 h local time):");
  const solar = b.request("timeseries.history", { tagIds: ["PCS-INV-101.AC_POWER"], from: iso(now - DAY), to: iso(now), maxPoints: 12 });
  say("  " + solar.series[0]!.points.map((p) => p.avg.toFixed(0)).join(" "));

  say();
  say("Daily briefing:");
  for (const section of b.request("briefing.daily", {}).sections) {
    say(`  [${section.key}]`);
    for (const item of section.items) say(`   - ${item.text}`);
  }

  say();
  say(`Work orders: ${b.request("workOrders.list", { limit: 1 }).total} total, newest: ${b.request("workOrders.list", { limit: 1 }).items[0]?.title}`);
  say(`Events in last 6 h: ${b.request("events.list", { from: iso(now - 6 * HOUR), to: iso(now), limit: 500 }).items.length}`);

  console.log("\n" + lines.join("\n") + "\n");
});
