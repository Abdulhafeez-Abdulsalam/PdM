import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { usePreferences } from "../../shared/preferences";
import { renderApp } from "../../test/render-app";

beforeEach(() => {
  usePreferences.setState({ role: "system_admin", theme: "light", units: "si" });
});

describe("access", () => {
  it("is the System Admin's home page", async () => {
    const { router } = renderApp("/");
    expect(await screen.findByRole("heading", { level: 1, name: "Administration" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/admin");
    expect(await screen.findByText(/No changes yet in this session/)).toBeInTheDocument();
  });

  it("every page checks the role, not just the menu", async () => {
    usePreferences.setState({ role: "executive" });
    renderApp("/admin/audit");
    expect(await screen.findByRole("heading", { level: 1, name: "Administration" })).toBeInTheDocument();
    expect(screen.getByText("Not part of your role's view")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows the access matrix", async () => {
    renderApp("/admin/roles");
    const pages = await screen.findByRole("table", { name: "Pages" });
    const row = within(pages).getByRole("rowheader", { name: "Administration" }).closest("tr")!;
    const cells = within(row)
      .getAllByRole("cell")
      .map((c) => c.textContent);
    expect(cells.at(-1)).toBe("Use");
    expect(cells[0]).toBe("No");
  });
});

describe("people, hierarchy and the audit log", () => {
  it("changes a person's role, and the audit log shows who did it", async () => {
    const { router } = renderApp("/admin/users");
    const table = await screen.findByRole("table", { name: /^People/ });
    await userEvent.selectOptions(within(table).getAllByRole("combobox", { name: /^Role for / })[0]!, "maintenance_planner");
    expect(await screen.findByText(/is now Maintenance Planner$/)).toBeInTheDocument();
    await router.navigate({ to: "/admin/audit" });
    const log = await screen.findByRole("table", { name: /^The audit log/ });
    expect(within(log).getByText("admin.setUserRole")).toBeInTheDocument();
    expect(within(log).getByText(/→ maintenance_planner$/)).toBeInTheDocument();
  });

  it("opens the hierarchy a level at a time", async () => {
    renderApp("/admin/hierarchy");
    const tree = await screen.findByRole("region", { name: "Hierarchy" });
    const regions = await within(tree).findAllByRole("button", { expanded: false });
    await userEvent.click(regions[0]!);
    expect(regions[0]).toHaveAttribute("aria-expanded", "true");
    expect((await within(tree).findAllByText(/^(Business unit|Site)/)).length).toBeGreaterThan(0);
  });
});

describe("editing limits", () => {
  it("changes a tag's limits from the tag browser, in the user's units", async () => {
    usePreferences.setState({ role: "condition_analyst" });
    renderApp("/data/tags");
    await userEvent.type(await screen.findByRole("searchbox", { name: "Search tags" }), "CBC-GT-101.EXH_TEMP");
    await userEvent.click(await screen.findByRole("button", { name: "Edit limits for CBC-GT-101.EXH_TEMP" }));
    const dialog = await screen.findByRole("dialog", { name: "Limits for CBC-GT-101.EXH_TEMP" });
    const highAlarm = within(dialog).getByRole("textbox", { name: "High alarm (°C)" });
    const highAlert = Number((within(dialog).getByRole("textbox", { name: "High alert (°C)" }) as HTMLInputElement).value);

    // Out of order: the alarm below the alert is refused before anything is sent.
    await userEvent.clear(highAlarm);
    await userEvent.type(highAlarm, String(highAlert - 1));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save limits" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/must rise/);

    await userEvent.clear(highAlarm);
    await userEvent.type(highAlarm, String(Math.round(highAlert + 7)));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save limits" }));
    expect(await screen.findByText("Limits saved for CBC-GT-101.EXH_TEMP")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(new RegExp(`Alarm ≥ ${Math.round(highAlert + 7)}(\\.0)? °C`))).toBeInTheDocument());
  });

  it("is offered to a reliability engineer, who may only view the Data pages but may edit thresholds", async () => {
    usePreferences.setState({ role: "reliability_engineer" });
    renderApp("/data/tags");
    expect((await screen.findAllByRole("button", { name: /^Edit limits for / })).length).toBeGreaterThan(0);
  });
});
