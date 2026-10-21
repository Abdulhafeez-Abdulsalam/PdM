import { createMockBackend } from "@pdm/mock-data";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { usePreferences } from "../../shared/preferences";
import { useToasts } from "../../shared/toast";
import { TEST_SEED, TEST_START, renderApp } from "../../test/render-app";
import { bookedHours, boardDays, overbooked } from "./schedule";

beforeEach(() => {
  usePreferences.setState({ role: "maintenance_planner", theme: "light", units: "si" });
  useToasts.setState({ toasts: [] });
});

const probe = () => createMockBackend({ seed: TEST_SEED, startTime: TEST_START, realNow: () => TEST_START });
const BOARD = "/maintenance/schedule?span=2weeks";

describe("schedule board", () => {
  it("shows every technician and flags the days they're booked over 8 hours", async () => {
    const b = probe();
    const techs = b.request("users.list", { role: "field_technician", limit: 50 }).items;
    const jobs = b.request("workOrders.list", { status: ["scheduled", "approved", "in_progress"], limit: 500 }).items;
    const days = boardDays(TEST_START, 14);
    const conflicts = techs.reduce(
      (n, tech) =>
        n +
        overbooked(
          bookedHours(
            jobs.filter((j) => j.assigneeId === tech.id),
            days,
          ),
        ).length,
      0,
    );

    renderApp(BOARD);
    for (const tech of techs)
      expect(await screen.findByRole("region", { name: new RegExp(`^${tech.name}: \\d+ jobs?`) })).toBeInTheDocument();
    expect(conflicts, "the seeded data should contain some overbooking to show").toBeGreaterThan(0);
    expect(screen.getByText(new RegExp(`^${conflicts} conflicts?:`))).toBeInTheDocument();
    expect(screen.getAllByText(/^Overbooked on \d+ days?$/).length).toBeGreaterThan(0);
  });

  it("lets a planner reschedule approved work, which then needs approving again", async () => {
    const user = userEvent.setup();
    const b = probe();
    const wo = b.request("workOrders.list", { status: ["approved"], sort: "start", limit: 1 }).items[0]!;
    const other = b.request("users.list", { role: "field_technician", limit: 50 }).items.find((u) => u.id !== wo.assigneeId)!;
    const { backend } = renderApp(BOARD);

    await user.click(await screen.findByRole("button", { name: `Reschedule ${wo.number}` }));
    const dialog = await screen.findByRole("dialog", { name: "Reschedule work" });
    expect(within(dialog).getByText(/sends it back to the plant manager/)).toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText(/Assign to/), other.id);
    await user.click(within(dialog).getByRole("button", { name: "Reschedule" }));

    await waitFor(() => {
      const after = backend.request("workOrders.get", { workOrderId: wo.id });
      expect(after.assigneeId).toBe(other.id);
      expect(after.status).toBe("scheduled");
    });
    expect(
      await screen.findByText(`${wo.number} rescheduled. It was approved for the old time, so it needs approving again.`),
    ).toBeInTheDocument();
  });

  it("schedules planned work from the tray", async () => {
    const user = userEvent.setup();
    const wo = probe().request("workOrders.list", { status: ["planned"], sort: "priority", limit: 1 }).items[0]!;
    const { backend } = renderApp(BOARD);
    const tray = await screen.findByRole("region", { name: /^Unscheduled work, \d+ jobs$/ });
    const card = await within(tray).findByRole("listitem", { name: `${wo.number}: ${wo.title}` });
    await user.click(within(card).getByRole("button", { name: "Schedule…" }));
    const dialog = await screen.findByRole("dialog", { name: "Schedule work" });
    const assignee = within(dialog).getByLabelText(/Assign to/) as HTMLSelectElement;
    await waitFor(() => expect(assignee.options.length).toBeGreaterThan(1));
    await user.selectOptions(assignee, assignee.options[1]!.value);
    await user.click(within(dialog).getByRole("button", { name: "Schedule" }));
    await waitFor(() => expect(backend.request("workOrders.get", { workOrderId: wo.id }).status).toBe("scheduled"));
  });

  it("is read-only for everyone but the planner", async () => {
    usePreferences.setState({ role: "plant_manager" });
    renderApp(BOARD);
    await screen.findAllByRole("region", { name: /: \d+ jobs?/ });
    expect(screen.queryByRole("button", { name: /^Reschedule / })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Drag / })).toBeNull();
    expect(screen.queryByRole("button", { name: "Schedule…" })).toBeNull();
  });
});

describe("maintenance calendar", () => {
  it("shows work on the day it starts", async () => {
    const wo = probe().request("workOrders.list", { status: ["scheduled"], sort: "start", limit: 1 }).items[0]!;
    const day = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(
      Date.parse(wo.scheduledStart!),
    );
    const month = wo.scheduledStart!.slice(0, 7);
    renderApp(`/maintenance?view=calendar&month=${month}`);
    const table = await screen.findByRole("table", { name: /^Maintenance starting in / });
    const cell = within(table).getByText(day).closest("td")!;
    expect(within(cell).getByRole("link", { name: new RegExp(wo.number) })).toBeInTheDocument();
  });
});
