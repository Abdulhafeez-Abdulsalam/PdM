import { createMockBackend } from "@pdm/mock-data";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { usePreferences } from "../../shared/preferences";
import { useToasts } from "../../shared/toast";
import { TEST_SEED, TEST_START, renderApp } from "../../test/render-app";

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
    const user = userEvent.setup();
    const wo = probe().request("workOrders.list", { status: ["requested"], sort: "priority", limit: 1 }).items[0]!;
    const { backend } = renderApp("/maintenance");
    const card = await screen.findByRole("article", { name: `${wo.number}: ${wo.title}` });
    await user.click(within(card).getByRole("button", { name: `Move to… ${wo.number}` }));
    await user.click(await screen.findByRole("button", { name: "Triage" }));
    await waitFor(() => expect(backend.request("workOrders.get", { workOrderId: wo.id }).status).toBe("triaged"));
  });

  it("asks when and who before scheduling", async () => {
    const user = userEvent.setup();
    const wo = probe().request("workOrders.list", { status: ["planned"], limit: 1 }).items[0]!;
    const { backend } = renderApp("/maintenance");
    const card = await screen.findByRole("article", { name: `${wo.number}: ${wo.title}` });
    await user.click(within(card).getByRole("button", { name: `Move to… ${wo.number}` }));
    await user.click(await screen.findByRole("button", { name: "Schedule…" }));
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
  it("lets a technician close out work with ISO 14224 coding", async () => {
    usePreferences.setState({ role: "field_technician" });
    const user = userEvent.setup();
    const wo = probe().request("workOrders.list", { status: ["in_progress"], limit: 1 }).items[0]!;
    const { backend } = renderApp(`/maintenance/${wo.id}`);

    await user.click(await screen.findByRole("button", { name: "Close out…" }));
    const dialog = await screen.findByRole("dialog", { name: "Close out work" });
    await user.selectOptions(within(dialog).getByLabelText(/Failure mode/), "VIB");
    await user.selectOptions(within(dialog).getByLabelText(/Cause/), "2.4");
    await user.selectOptions(within(dialog).getByLabelText(/Action taken/), "replace");
    await user.click(within(dialog).getByRole("button", { name: "Complete work" }));
    expect(await within(dialog).findByText("Describe what you found in at least 10 characters.")).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText(/Findings/), "Drive-end bearing spalled; replaced and aligned.");
    await user.type(within(dialog).getByLabelText(/Hours worked/), "4.5");
    await user.click(within(dialog).getByRole("button", { name: "Complete work" }));

    await waitFor(() => {
      const after = backend.request("workOrders.get", { workOrderId: wo.id });
      expect(after.status).toBe("completed");
      expect(after.closeOut).toMatchObject({ failureMode: "VIB", cause: "2.4", remedy: "replace", laborHours: 4.5 });
    });
  });
});
