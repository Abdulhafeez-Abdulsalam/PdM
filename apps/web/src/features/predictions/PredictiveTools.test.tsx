import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { usePreferences } from "../../shared/preferences";
import { renderApp } from "../../test/render-app";

beforeEach(() => {
  usePreferences.setState({ role: "reliability_engineer", theme: "light", units: "si" });
});

describe("model registry", () => {
  it("compares a candidate with production, and approving it puts it into production", async () => {
    renderApp("/predictive/models");
    const candidates = await screen.findByRole("table", { name: "Candidate model versions compared with production" });
    const approve = within(candidates).getAllByRole("button", { name: /^Approve .+ model 2\.5\.0$/ })[0]!;
    const row = approve.closest("tr")!;
    const model = within(row).getByRole("rowheader").firstChild!.textContent!;
    expect(within(row).getAllByText(/ (better|worse)$|^same$/).length).toBe(3);
    await userEvent.click(approve);
    expect(await screen.findByText(`${model} model: new version in production`)).toBeInTheDocument();
    const all = screen.getByRole("table", { name: /^Models in production/ });
    await waitFor(() => {
      const prod = within(all)
        .getByRole("rowheader", { name: new RegExp(`^${model}`) })
        .closest("tr")!;
      expect(within(prod).getByText("2.5.0")).toBeInTheDocument();
    });
  });

  it("lets only reliability engineers and analysts decide", async () => {
    usePreferences.setState({ role: "plant_manager" });
    renderApp("/predictive/models");
    const candidates = await screen.findByRole("table", { name: "Candidate model versions compared with production" });
    expect(within(candidates).queryByRole("button", { name: /^Approve/ })).not.toBeInTheDocument();
    expect(within(candidates).getAllByText("Waiting for a reliability engineer or analyst").length).toBeGreaterThan(0);
  });
});

describe("rule builder", () => {
  it("tests a rule on the last 24 hours before it can be saved, and a change needs a new test", async () => {
    renderApp("/predictive/rules");
    const rules = await screen.findByRole("table", { name: "Rules" });
    expect(within(rules).getAllByText(/^\d+ times?, \d+ assets$/).length).toBeGreaterThan(1);

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Signal" }), "BRG1_VIB");
    const threshold = screen.getByRole("textbox", { name: "Threshold (mm/s)" });
    await userEvent.clear(threshold);
    await userEvent.type(threshold, "3");
    const save = screen.getByRole("button", { name: "Save rule" });
    await userEvent.type(screen.getByRole("textbox", { name: "Rule name" }), "Pump bearings rough");
    expect(save).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Test on the last 24 hours" }));
    expect(await screen.findByText(/^Would have fired \d+ times?, on \d+ of \d+ assets, in the last 24 hours\.$/)).toBeInTheDocument();
    expect(save).toBeEnabled();

    await userEvent.type(threshold, ".5");
    expect(save).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Test on the last 24 hours" }));
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);
    expect(await screen.findByText("Rule saved: Pump bearings rough")).toBeInTheDocument();
    expect(await within(rules).findByRole("rowheader", { name: /^Pump bearings rough/ })).toBeInTheDocument();
  });
});

describe("what-if", () => {
  it("shows the chance of failing first and what deferring costs, as the delay changes", async () => {
    renderApp("/predictive/what-if");
    const kpis = await screen.findByRole("region", { name: "What deferring costs" });
    expect(within(kpis).getByText("Chance it fails within 30 days")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Deferring by" });
    const now = within(table).getByRole("rowheader", { name: "Repair now" }).closest("tr")!;
    expect(within(now).getByText("0%")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("slider", { name: "Defer the repair by" }), { target: { value: "60" } });
    expect(within(kpis).getByText("Chance it fails within 60 days")).toBeInTheDocument();
  });
});
