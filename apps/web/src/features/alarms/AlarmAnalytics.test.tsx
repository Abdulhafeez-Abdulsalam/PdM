import { createMockBackend } from "@pdm/mock-data";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { usePreferences } from "../../shared/preferences";
import { TEST_SEED, TEST_START, renderApp } from "../../test/render-app";

beforeEach(() => {
  usePreferences.setState({ role: "control_room_operator", theme: "light", units: "si" });
});

const probe = () => createMockBackend({ seed: TEST_SEED, startTime: TEST_START, realNow: () => TEST_START });

describe("alarm performance", () => {
  it("shows the ISA-18.2 measures with their targets and a verdict", async () => {
    const a = probe().request("alarms.analytics", { window: "24h" });
    const busiest = [...a.sites].sort((x, y) => y.averagePer10Min - x.averagePer10Min)[0]!;
    renderApp("/alarms/analytics");
    const headline = await screen.findByRole("region", { name: "Alarm system health" });
    expect(within(headline).getByText(busiest.averagePer10Min.toFixed(2))).toBeInTheDocument();
    expect(within(headline).getByText(busiest.siteName)).toBeInTheDocument();
    expect(within(headline).getByText(a.top10SharePercent.toFixed(1))).toBeInTheDocument();
    expect(within(headline).getByText("Target ≤ 5 %")).toBeInTheDocument();
    // The seeded data has chattering bad actors, so the top-10 measure is over target.
    expect(a.top10SharePercent).toBeGreaterThan(5);
    expect(within(headline).getAllByText("Above target").length).toBeGreaterThan(0);
  });

  it("lists every control room and the top 10 alarms, chattering ones marked", async () => {
    const a = probe().request("alarms.analytics", { window: "24h" });
    renderApp("/alarms/analytics");
    const rooms = await screen.findByRole("table", { name: "Control rooms" });
    expect(within(rooms).getAllByRole("row")).toHaveLength(a.sites.length + 1);
    const actors = screen.getByRole("table", { name: "Top 10 alarms (bad actors)" });
    const first = within(actors).getAllByRole("row")[1]!;
    expect(first).toHaveTextContent(a.badActors[0]!.message);
    expect(first).toHaveTextContent(String(a.badActors[0]!.count));
    expect(within(actors).getAllByText(/^Chattering \(\d+ bursts?\)$/)).toHaveLength(
      a.badActors.filter((b) => a.chattering.some((c) => c.key === b.key)).length,
    );
  });

  it("switches to the last 7 days, and shows the chart as a table", async () => {
    const user = userEvent.setup();
    const week = probe().request("alarms.analytics", { window: "7d" });
    const { router } = renderApp("/alarms/analytics");
    await user.click(await screen.findByRole("tab", { name: "Last 7 days" }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ window: "7d" }));
    const chart = await screen.findByRole("region", { name: "Alarms per 60 minutes, all control rooms" });
    await user.click(within(chart).getByRole("button", { name: "Show as table" }));
    const table = within(chart).getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(week.rate.points.length + 1);
  });

  it("is reached from the alarm list's navigation", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/alarms");
    const nav = await screen.findByRole("navigation", { name: "Alarm pages" });
    await user.click(within(nav).getByRole("link", { name: "Performance" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/alarms/analytics"));
  });
});
