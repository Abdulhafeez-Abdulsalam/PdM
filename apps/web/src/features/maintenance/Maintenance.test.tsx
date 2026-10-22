import { createMockBackend } from "@pdm/mock-data";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent, { PointerEventsCheckLevel } from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { usePreferences } from "../../shared/preferences";
import { useToasts } from "../../shared/toast";
import { TEST_SEED, TEST_START, renderApp } from "../../test/render-app";

/**
 * The board has a few hundred cards, so thousands of elements. Two test-library costs grow
 * with that: "find by role" works out every element's role, and every click first checks the
 * whole chain of parents for "pointer-events: none". On the board the tests use text lookups
 * for menu items and skip that check, which took them from over 20 s under load to a few.
 */
const boardUser = () => userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });

beforeEach(() => {
  usePreferences.setState({ role: "maintenance_planner", theme: "light", units: "si" });
  useToasts.setState({ toasts: [] });
});

const probe = () => createMockBackend({ seed: TEST_SEED, startTime: TEST_START, realNow: () => TEST_START });

describe("work-order board", () => {
  it("shows the lifecycle columns with the backend's counts", async () => {
    const { backend } = renderApp("/maintenance");
    const count = (status: ("requested" | "triaged" | "in_progress")[]) => backend.request("workOrders.list", { status, limit: 1 }).total;
    expect(await screen.findByRole("region", { name: `Requested, ${count(["requested", "triaged"])} work orders` })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: `In progress, ${count(["in_progress"])} work orders` })).toBeInTheDocument();
  });

  it("is the Maintenance Planner's home page", async () => {
    const { router } = renderApp("/");
    await waitFor(() => expect(router.state.location.pathname).toBe("/maintenance"));
  });

  it("lets a planner triage a request from the card's Move to… menu", async () => {
    const user = boardUser();
    const wo = probe().request("workOrders.list", { status: ["requested"], sort: "priority", limit: 1 }).items[0]!;
    const { backend } = renderApp("/maintenance");
    const card = await screen.findByRole("article", { name: `${wo.number}: ${wo.title}` });
    await user.click(within(card).getByRole("button", { name: `Move to… ${wo.number}` }));
    await user.click(await screen.findByText("Triage", { selector: "button" }));
    await waitFor(() => expect(backend.request("workOrders.get", { workOrderId: wo.id }).status).toBe("triaged"));
  });

  it("asks when and who before scheduling", async () => {
    const user = boardUser();
    const wo = probe().request("workOrders.list", { status: ["planned"], limit: 1 }).items[0]!;
    const { backend } = renderApp("/maintenance");
    const card = await screen.findByRole("article", { name: `${wo.number}: ${wo.title}` });
    await user.click(within(card).getByRole("button", { name: `Move to… ${wo.number}` }));
    await user.click(await screen.findByText("Schedule…", { selector: "button" }));
    const dialog = await screen.findByRole("dialog", { name: "Schedule work" });
    const assignee = within(dialog).getByLabelText(/Assign to/) as HTMLSelectElement;
    await waitFor(() => expect(assignee.options.length).toBeGreaterThan(1));
    await user.selectOptions(assignee, assignee.options[1]!.value);
    await user.click(within(dialog).getByRole("button", { name: "Schedule" }));
    await waitFor(() => {
      const after = backend.request("workOrders.get", { workOrderId: wo.id });
      expect(after.status).toBe("scheduled");
      expect(after.scheduledStart).not.toBeNull();
    });
  });

  it("is read-only for an executive", async () => {
    usePreferences.setState({ role: "executive" });
    renderApp("/maintenance");
    const column = await screen.findByRole("region", { name: /^Requested, \d+ work orders$/ });
    await within(column).findAllByRole("article");
    expect(within(column).queryByRole("button", { name: /^Move to…/ })).toBeNull();
    expect(within(column).queryByRole("button", { name: /^Drag/ })).toBeNull();
  });
});

describe("work-order page", () => {
  it("sends a technician to the field task page to close out", async () => {
    usePreferences.setState({ role: "field_technician" });
    const user = userEvent.setup();
    const wo = probe().request("workOrders.list", { status: ["in_progress"], limit: 1 }).items[0]!;
    const { router } = renderApp(`/maintenance/${wo.id}`);
    expect(await screen.findByRole("region", { name: "Checklist" })).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Close out…" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/field/tasks/${wo.id}`));
  });
});
