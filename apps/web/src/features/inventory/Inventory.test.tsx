import { screen, within } from "@testing-library/react";
import userEvent, { PointerEventsCheckLevel } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { usePreferences } from "../../shared/preferences";
import { renderApp } from "../../test/render-app";

const setup = () => userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
const as = (role: "procurement" | "reliability_engineer" | "maintenance_planner") =>
  usePreferences.setState({ role, theme: "light", units: "si" });

describe("inventory", () => {
  it("is Procurement's home page, with the parts that will run short first", async () => {
    as("procurement");
    const { router } = renderApp("/");
    expect(await screen.findByRole("heading", { level: 1, name: "Inventory" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/inventory");
    const table = await screen.findByRole("table", { name: /^Stock lines/ });
    const first = within(table).getAllByRole("row")[1]!;
    expect(within(first).getByText("Will run short")).toBeInTheDocument();
  });

  it("places an order from a line", async () => {
    as("procurement");
    const user = setup();
    renderApp("/inventory");
    const table = await screen.findByRole("table", { name: /^Stock lines/ });
    const first = within(table).getAllByRole("row")[1]!;
    await user.click(within(first).getByRole("button", { name: /^Order \d+ of / }));
    expect(await screen.findByText(/^PO-\d+ placed: \d+ arriving /)).toBeInTheDocument();
  });

  it("shows who will need a part, and why", async () => {
    as("procurement");
    renderApp("/inventory/parts/SP-BRG-6309");
    expect(await screen.findByRole("heading", { level: 1, name: /Ball bearing 6309-2RS/ })).toBeInTheDocument();
    expect(screen.getByText("None: used only when a failure needs it")).toBeInTheDocument();
    const demand = screen.getByRole("table", { name: "Demand for SP-BRG-6309, soonest first" });
    const row = within(demand).getByRole("link", { name: "PBU-PMP-106" }).closest("tr")!;
    expect(within(row).getByRole("link", { name: /^Prediction, .* likely$/ })).toBeInTheDocument();
  });

  it("shows a work order's parts and whether the site has them", async () => {
    as("maintenance_planner");
    const { backend, router } = renderApp("/maintenance");
    await screen.findByRole("heading", { level: 1 });
    const plan = backend.request("pm.overview", {}).plans.find((p) => p.task === "planned_remedy" && p.counts.dueSoon > 0)!;
    const job = backend.request("pm.generate", { planId: plan.id }).created[0]!;
    await router.navigate({ to: "/maintenance/$workOrderId", params: { workOrderId: job.workOrderId } });
    const parts = await screen.findByRole("region", { name: "Parts" });
    expect(within(parts).getByRole("link", { name: plan.parts[0]!.partNumber })).toBeInTheDocument();
    expect(within(parts).getByText(/on the shelf at /)).toBeInTheDocument();
  });

  it("offers ordering only to the roles that buy", async () => {
    as("reliability_engineer");
    renderApp("/inventory");
    await screen.findByRole("table", { name: /^Stock lines/ });
    expect(screen.queryByRole("button", { name: /^Order / })).toBeNull();
  });
});
