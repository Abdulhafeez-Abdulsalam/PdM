import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePreferences } from "../../shared/preferences";
import { renderApp } from "../../test/render-app";

beforeEach(() => {
  usePreferences.setState({ role: "plant_manager", theme: "dark", units: "si" });
});

describe("report library and reports", () => {
  it("lists the ready-made reports, the handover and the builder", async () => {
    renderApp("/reports");
    expect(await screen.findByRole("heading", { level: 1, name: "Reports" })).toBeInTheDocument();
    for (const name of [
      "Weekly reliability report",
      "Monthly ESG report",
      "Monthly financial report",
      "Management summary",
      "Shift handover",
      "Build a report",
    ])
      expect(screen.getAllByRole("link", { name }).length).toBeGreaterThan(0);
  });

  it("shows each figure with how it was worked out, and prints through the browser", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    renderApp("/reports/monthly-financials?scope=EBC");
    expect(await screen.findByRole("heading", { level: 2, name: "Monthly financial report" })).toBeInTheDocument();
    expect(await screen.findByText(/^Ebute Combined Cycle · made /)).toBeInTheDocument();
    const figures = await screen.findByRole("table", { name: "Financials, last 12 months: each figure and how it was worked out" });
    const row = within(figures).getByRole("rowheader", { name: "Money at risk" }).closest("tr")!;
    expect(within(row).getByText(/^\$/)).toBeInTheDocument();
    expect(within(row).getByText(/probability × what its failure would cost/)).toBeInTheDocument();
    for (const name of ["Preventive maintenance", "Spare parts"])
      expect(screen.getByRole("heading", { level: 3, name })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Print or save as PDF" }));
    expect(print).toHaveBeenCalledOnce();
  });

  it("prints in the light theme, then goes back", async () => {
    renderApp("/reports");
    await screen.findByRole("heading", { level: 1, name: "Reports" });
    expect(document.documentElement.dataset.theme).toBe("dark");
    fireEvent(window, new Event("beforeprint"));
    expect(document.documentElement.dataset.theme).toBe("light");
    fireEvent(window, new Event("afterprint"));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("builds a report from the sections ticked, kept in the address", async () => {
    const { router } = renderApp("/reports/build");
    expect(await screen.findByText("Choose at least one section above.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Spare parts" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Top risks" }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ sections: "risks,inventory" }));
    const headings = await screen.findAllByRole("heading", { level: 3 });
    expect(headings.map((h) => h.textContent)).toEqual(["Top risks", "Spare parts"]);
  });
});

describe("shift handover", () => {
  it("shows this shift, urgent alarms, work in progress and the previous shift's notes", async () => {
    usePreferences.setState({ role: "control_room_operator" });
    renderApp("/reports/handover");
    expect(await screen.findByRole("heading", { level: 2, name: /^(Day|Night) shift handover, / })).toBeInTheDocument();
    for (const name of ["This shift so far", "Urgent alarms still open", "Work in progress", "What happened", "Notes for the next shift"])
      expect(screen.getByRole("heading", { level: 3, name })).toBeInTheDocument();
    const notes = screen.getByRole("region", { name: "Notes for the next shift" });
    expect(within(notes).getAllByText(/(predicted|is still active)/).length).toBeGreaterThan(0);
  });

  it("lets the operator leave a note for the next shift", async () => {
    usePreferences.setState({ role: "control_room_operator" });
    renderApp("/reports/handover?scope=EBC");
    const box = await screen.findByRole("textbox", { name: /^Leave a note for the next shift about Ebute/ });
    await userEvent.type(box, "Feed pump B tripped twice; restarted. Watch it.");
    await userEvent.click(screen.getByRole("button", { name: "Leave note" }));
    const notes = screen.getByRole("region", { name: "Notes for the next shift" });
    expect(await within(notes).findByText("Feed pump B tripped twice; restarted. Watch it.")).toBeInTheDocument();
  });

  it("lets an executive read the handover but not write in it", async () => {
    usePreferences.setState({ role: "executive" });
    renderApp("/reports/handover");
    await screen.findByRole("heading", { level: 3, name: "Notes for the next shift" });
    expect(screen.queryByRole("button", { name: "Leave note" })).not.toBeInTheDocument();
  });
});
