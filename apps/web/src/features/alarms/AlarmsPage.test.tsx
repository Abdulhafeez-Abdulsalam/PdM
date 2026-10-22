import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { usePreferences } from "../../shared/preferences";
import { useToasts } from "../../shared/toast";
import { renderApp } from "../../test/render-app";

beforeEach(() => {
  usePreferences.setState({ role: "control_room_operator", theme: "light", units: "si" });
  useToasts.setState({ toasts: [] });
});

/** The first unacknowledged alarm in the list, as the backend sees it. */
function firstUnacked(backend: ReturnType<typeof renderApp>["backend"]) {
  const alarm = backend.request("alarms.list", { states: ["active_unacked"], sort: "priority", limit: 1 }).items[0];
  if (!alarm) throw new Error("test data has no unacknowledged alarm");
  return alarm;
}

describe("alarm → work order (acceptance criterion C)", () => {
  it("takes two clicks: open the pre-filled form, then Create", async () => {
    const user = userEvent.setup();
    const { backend } = renderApp("/alarms");
    const alarm = firstUnacked(backend);

    await user.click(await screen.findByRole("button", { name: `Create work order from ${alarm.id}` })); // click 1
    const dialog = await screen.findByRole("dialog", { name: "Create work order" });

    // Pre-filled: title from the alarm, a technician already chosen, readings snapshot ready.
    expect(await within(dialog).findByDisplayValue(`${alarm.message} — ${alarm.assetId}`)).toBeInTheDocument();
    expect((within(dialog).getByLabelText(/Assign to/) as HTMLSelectElement).value).not.toBe("");
    expect(within(dialog).getByText(/Attach a snapshot of [1-9]\d* current reading/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Create work order" })); // click 2

    expect(await screen.findByText(/^WO-\d+ created and assigned to .+\.$/)).toBeInTheDocument();
    await waitFor(() => expect(backend.alarms.get(alarm.id).workOrderId).not.toBeNull());
    const wo = backend.request("workOrders.list", { assetId: alarm.assetId, limit: 1 }).items[0]!;
    expect(wo.source).toEqual({ kind: "alarm", refId: alarm.id });
    expect(wo.evidence?.values.length).toBeGreaterThan(0); // snapshot of readings attached
    // A long journey (the whole alarm list, a form, a create): 14–16 s on its own on the dev
    // laptop, and past the 20 s default when the full suite runs in parallel. The real-browser
    // journey in e2e/journeys.spec.ts checks the same flow against its 5 s budget.
  }, 40_000);
});

describe("acknowledge and shelve", () => {
  it("acknowledges an alarm from its row", async () => {
    const user = userEvent.setup();
    const { backend } = renderApp("/alarms");
    const alarm = firstUnacked(backend);
    await user.click(await screen.findByRole("button", { name: `Acknowledge ${alarm.id}` }));
    await waitFor(() => expect(backend.alarms.get(alarm.id).state).toBe("active_acked"));
    expect(await screen.findByText("Alarm acknowledged.")).toBeInTheDocument();
  });

  it("acknowledges with the keyboard: focus the row, press A", async () => {
    const user = userEvent.setup();
    const { backend } = renderApp("/alarms");
    const alarm = firstUnacked(backend);
    const row = await screen.findByRole("row", { name: new RegExp(`${escape(alarm.message)} on ${alarm.assetId}`) });
    row.focus();
    await user.keyboard("a");
    await waitFor(() => expect(backend.alarms.get(alarm.id).state).toBe("active_acked"));
  });

  it("refuses to shelve without a real reason, then shelves", async () => {
    const user = userEvent.setup();
    const { backend } = renderApp("/alarms");
    const alarm = firstUnacked(backend);
    await user.click(await screen.findByRole("button", { name: `Shelve ${alarm.id}` }));
    const dialog = await screen.findByRole("dialog", { name: "Shelve alarm" });

    await user.type(within(dialog).getByLabelText(/Reason/), "ok");
    await user.click(within(dialog).getByRole("button", { name: "Shelve" }));
    expect(await within(dialog).findByText("Give a reason of at least 5 characters.")).toBeInTheDocument();
    expect(backend.alarms.get(alarm.id).state).not.toBe("shelved");

    await user.type(within(dialog).getByLabelText(/Reason/), " — transmitter being replaced");
    await user.click(within(dialog).getByRole("button", { name: "Shelve" }));
    await waitFor(() => expect(backend.alarms.get(alarm.id).state).toBe("shelved"));
    expect(backend.alarms.get(alarm.id).shelve?.reason).toContain("transmitter being replaced");
  });
});

describe("role-based views and filters", () => {
  it("shows no action buttons to an executive (view only)", async () => {
    usePreferences.setState({ role: "executive" });
    renderApp("/alarms");
    const list = await screen.findByRole("region", { name: /alarms?$/ });
    await within(list).findAllByRole("row");
    expect(within(list).queryByRole("button", { name: /^Acknowledge/ })).toBeNull();
    expect(within(list).queryByRole("button", { name: /^Create work order/ })).toBeNull();
  });

  it("filters by priority from the URL", async () => {
    renderApp("/alarms?priority=p2");
    const list = await screen.findByRole("region", { name: /alarms?$/ });
    const rows = (await within(list).findAllByRole("row")).slice(1);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row).toHaveAccessibleName(/^P2 High:/);
  });
});

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
