import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { usePreferences } from "../../shared/preferences";
import { renderApp } from "../../test/render-app";

beforeEach(() => {
  usePreferences.setState({ role: "condition_analyst", theme: "light", units: "si" });
});

describe("data and integrations", () => {
  it("shows the sources, data completeness and the tags needing attention", async () => {
    renderApp("/data");
    expect(await screen.findByRole("heading", { level: 1, name: "Data & Integrations" })).toBeInTheDocument();
    const sources = await screen.findByRole("table", { name: "Data sources" });
    expect(within(sources).getAllByRole("row")).toHaveLength(6);
    const historian = within(sources).getByRole("rowheader", { name: "Plant historian" }).closest("tr")!;
    expect(within(historian).getByText("Connected")).toBeInTheDocument();
    const kpis = await screen.findByRole("region", { name: "Data-quality measures" });
    expect(within(kpis).getByText("Data complete")).toBeInTheDocument();
    const worst = screen.getByRole("table", { name: "Tags needing attention" });
    expect(within(worst).getAllByText("No data").length).toBeGreaterThan(0);
  });

  it("opens the tag browser on one kind of issue", async () => {
    const { router } = renderApp("/data");
    await userEvent.click(await screen.findByRole("link", { name: "Flatline" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/data/tags"));
    const table = await screen.findByRole("table", { name: /^Tags with their asset/ });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(within(row).getByText("Flatline")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Issue" })).toHaveValue("flatline");
  });

  it("finds tags by name and shows their limits in the user's units", async () => {
    usePreferences.setState({ units: "imperial" });
    renderApp("/data/tags");
    await userEvent.type(await screen.findByRole("searchbox", { name: "Search tags" }), "CBC-GT-101.EXH_TEMP");
    const table = await screen.findByRole("table", { name: /^Tags with their asset/ });
    await waitFor(() => expect(within(table).getAllByRole("row")).toHaveLength(2));
    const row = within(table).getAllByRole("row")[1]!;
    expect(within(row).getByText(/^CBC-GT-101\.EXH/)).toBeInTheDocument();
    expect(within(row).getByText(/Alarm ≥ [\d,.]+ °F/)).toBeInTheDocument();
    expect(within(row).getByText("Good")).toBeInTheDocument();
  });
});
