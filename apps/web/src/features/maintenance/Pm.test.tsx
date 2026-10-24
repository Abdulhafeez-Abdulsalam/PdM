import { screen, within } from "@testing-library/react";
import userEvent, { PointerEventsCheckLevel } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { usePreferences } from "../../shared/preferences";
import { renderApp } from "../../test/render-app";

const setup = () => userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
const as = (role: "maintenance_planner" | "reliability_engineer") => usePreferences.setState({ role, theme: "light", units: "si" });

describe("PM programs", () => {
  it("lists the plans with PM compliance, most overdue first", async () => {
    as("maintenance_planner");
    renderApp("/maintenance/pm");
    expect(await screen.findByRole("heading", { level: 1, name: "PM programs" })).toBeInTheDocument();
    const kpis = await screen.findByRole("region", { name: "PM measures" });
    expect(within(kpis).getByText("PM compliance")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: /^PM plans/ });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.length).toBeGreaterThan(10);
    expect(within(rows[0]!).getByRole("link", { name: /^(Planned replacement|Condition check): / })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Failure modes with no PM" })).toBeInTheDocument();
  });

  // Slow: a whole PM overview, a plan, raising its work orders, then a work order page.
  it("raises the work that's due from a plan, and the work order points back to it", { timeout: 60_000 }, async () => {
    as("maintenance_planner");
    const user = setup();
    const { backend, router } = renderApp("/maintenance/pm");
    await screen.findByRole("table", { name: /^PM plans/ });
    // A plan with something overdue, on a few dozen machines rather than hundreds of solar strings.
    const plan = backend.request("pm.overview", {}).plans.find((p) => p.counts.overdue > 0 && p.assets < 60)!;
    await router.navigate({ to: "/maintenance/pm/$planId", params: { planId: plan.id } });
    const raise = await screen.findByRole("button", { name: /^Raise \d+ work orders?$/ });
    expect(screen.getAllByText("Overdue").length).toBeGreaterThan(1);
    await user.click(raise);
    expect(await screen.findByText(/^Raised \d+ work orders?$/, { selector: "p" })).toBeInTheDocument();
    expect((await screen.findAllByText("Work order raised")).length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole("link", { name: /^WO-\d+$/ })[0]!);
    expect(await screen.findByRole("link", { name: /^PM plan PM-/ })).toBeInTheDocument();
  });

  it("shows the raise button only to the planner", async () => {
    as("reliability_engineer");
    const user = setup();
    renderApp("/maintenance/pm");
    const table = await screen.findByRole("table", { name: /^PM plans/ });
    await user.click(within(within(table).getAllByRole("row")[1]!).getByRole("link"));
    expect(await screen.findByRole("heading", { name: "Why this plan" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Raise/ })).toBeNull();
  });
});
