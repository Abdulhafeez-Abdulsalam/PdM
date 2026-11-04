import { createMockBackend } from "@pdm/mock-data";
import type { WorkOrderStatus } from "@pdm/contracts";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { usePreferences } from "../../shared/preferences";
import { useToasts } from "../../shared/toast";
import { TEST_SEED, TEST_START, renderApp } from "../../test/render-app";

beforeEach(() => {
  usePreferences.setState({ role: "field_technician", theme: "light", units: "si" });
  useToasts.setState({ toasts: [] });
  sessionStorage.clear();
});

/** A second copy of the same seeded world, to look things up without touching the app's. */
const probe = () => createMockBackend({ seed: TEST_SEED, startTime: TEST_START, realNow: () => TEST_START, role: "field_technician" });

/** One of the demo technician's own jobs in this status, preferring one with readings to enter. */
function myJob(status: WorkOrderStatus) {
  const b = probe();
  const me = b.request("me.get", {});
  const jobs = b.request("workOrders.list", { assigneeId: me.id, status: [status], limit: 50 }).items;
  return jobs.find((w) => w.checklist.some((i) => i.kind === "reading")) ?? jobs[0]!;
}

describe("my jobs", () => {
  it("follows the demo's role picker without a reload", async () => {
    const nameOf = (role: "maintenance_planner" | "field_technician") =>
      createMockBackend({ seed: TEST_SEED, startTime: TEST_START, realNow: () => TEST_START, role }).request("me.get", {}).name;
    usePreferences.setState({ role: "maintenance_planner" });
    renderApp("/field");
    expect(await screen.findByText(new RegExp(`assigned to ${nameOf("maintenance_planner")}$`))).toBeInTheDocument();
    act(() => usePreferences.setState({ role: "field_technician" }));
    expect(await screen.findByText(new RegExp(`assigned to ${nameOf("field_technician")}$`))).toBeInTheDocument();
  });

  it("is the Field Technician's home page, grouped by what to do next", async () => {
    const { router } = renderApp("/");
    await waitFor(() => expect(router.state.location.pathname).toBe("/field"));
    expect(await screen.findByRole("heading", { name: "My jobs", level: 1 })).toBeInTheDocument();
    const ready = await screen.findByRole("region", { name: /^Ready to start · \d+$/ });
    const job = myJob("approved");
    expect(within(ready).getByRole("link", { name: new RegExp(job.number) })).toBeInTheDocument();
  });
});

describe("field task", () => {
  it("won't start work until every safety check is ticked", async () => {
    const user = userEvent.setup();
    const job = myJob("approved");
    const { backend } = renderApp(`/field/tasks/${job.id}`);
    const start = await screen.findByRole("button", { name: "Start work" });
    expect(start).toBeDisabled();
    expect(screen.getByText("Tick every safety check to start.")).toBeInTheDocument();

    for (const item of job.checklist.filter((i) => i.kind === "safety"))
      await user.click(screen.getByRole("checkbox", { name: item.label }));
    expect(start).toBeEnabled();
    await user.click(start);
    await waitFor(() => expect(backend.request("workOrders.get", { workOrderId: job.id }).status).toBe("in_progress"));
    // Now the steps and the close-out appear.
    expect(await screen.findByRole("group", { name: "Steps and readings" })).toBeInTheDocument();
  });

  it("completes a job: steps, readings in the user's units, and close-out", async () => {
    usePreferences.setState({ units: "imperial" });
    const user = userEvent.setup();
    const job = myJob("in_progress");
    const { backend, router } = renderApp(`/field/tasks/${job.id}`);
    const complete = await screen.findByRole("button", { name: "Complete job" });

    // Nothing filled in yet: every unticked step and empty reading is pointed out.
    await user.click(complete);
    expect((await screen.findAllByText("Tick this step before completing the job.")).length).toBeGreaterThan(0);
    expect(backend.request("workOrders.get", { workOrderId: job.id }).status).toBe("in_progress");

    for (const item of job.checklist.filter((i) => i.kind === "step")) await user.click(screen.getByRole("checkbox", { name: item.label }));
    for (const item of job.checklist.filter((i) => i.kind === "reading"))
      await user.type(screen.getByLabelText(new RegExp(`^${escape(item.label)}`)), "1");
    await user.type(screen.getByLabelText(/Findings/), "Coupling guard loose; tightened and checked.");
    await user.click(complete);

    await waitFor(() => expect(router.state.location.pathname).toBe("/field"));
    const after = backend.request("workOrders.get", { workOrderId: job.id });
    expect(after.status).toBe("completed");
    expect(after.closeOut?.findings).toBe("Coupling guard loose; tightened and checked.");
    for (const item of after.checklist.filter((i) => i.kind === "reading")) {
      // Typed "1" in imperial units; stored in SI. (1 °F is −17.2 °C, 1 in/s is 25.4 mm/s, 1 psi is 0.069 bar.)
      expect(item.value).not.toBeNull();
      expect(item.value).not.toBe(1);
    }
  });

  it("keeps everything typed through a dropped connection and a reload (criterion D)", async () => {
    const user = userEvent.setup();
    const job = myJob("in_progress");
    const step = job.checklist.find((i) => i.kind === "step")!;
    const first = renderApp(`/field/tasks/${job.id}`);
    await screen.findByRole("button", { name: "Complete job" });

    await user.click(screen.getByRole("checkbox", { name: step.label }));
    await user.type(screen.getByLabelText(/Findings/), "Half-way: seal replaced, testing next");
    first.transport.setDisconnected(true);

    expect(await screen.findByText(/No connection\. Everything you've entered is kept/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Complete job" })).toBeDisabled();
    expect(screen.getAllByText("Waiting for a connection…").length).toBeGreaterThan(0);

    // The page is reloaded (or the phone browser drops it): everything comes back.
    first.unmount();
    const second = renderApp(`/field/tasks/${job.id}`);
    expect(await screen.findByText("We kept what you entered earlier on this job.")).toBeInTheDocument();
    expect(screen.getByLabelText(/Findings/)).toHaveValue("Half-way: seal replaced, testing next");
    expect(screen.getByRole("checkbox", { name: step.label })).toBeChecked();

    // Back online, the technician finishes and submits; the draft is then gone.
    for (const item of job.checklist.filter((i) => i.kind === "step" && i.id !== step.id))
      await user.click(screen.getByRole("checkbox", { name: item.label }));
    for (const item of job.checklist.filter((i) => i.kind === "reading"))
      await user.type(screen.getByLabelText(new RegExp(`^${escape(item.label)}`)), "2");
    await user.click(screen.getByRole("button", { name: "Complete job" }));
    await waitFor(() => expect(second.backend.request("workOrders.get", { workOrderId: job.id }).status).toBe("completed"));
    expect(sessionStorage.length).toBe(0);
  });

  it("is read-only for roles that don't do the work", async () => {
    usePreferences.setState({ role: "plant_manager" });
    const job = myJob("approved");
    renderApp(`/field/tasks/${job.id}`);
    const safety = job.checklist.find((i) => i.kind === "safety")!;
    expect(await screen.findByRole("checkbox", { name: safety.label })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Start work" })).toBeNull();
  });
});

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
