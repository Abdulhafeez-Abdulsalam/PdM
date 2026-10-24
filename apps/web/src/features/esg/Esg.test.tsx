import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { usePreferences } from "../../shared/preferences";
import { renderApp } from "../../test/render-app";

beforeEach(() => {
  usePreferences.setState({ role: "esg_lead", theme: "light", units: "si" });
});

describe("energy and ESG", () => {
  it("is the ESG Lead's home page, with emissions, intensity and targets per site", async () => {
    const { router } = renderApp("/");
    expect(await screen.findByRole("heading", { level: 1, name: "Energy & ESG" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/esg");
    const kpis = await screen.findByRole("region", { name: "Emissions measures" });
    expect(within(kpis).getByText("Avoidable")).toBeInTheDocument();
    const sites = screen.getByRole("table", { name: /^Sites with emissions/ });
    expect(within(sites).getAllByText(/ t\/MWh$/).length).toBeGreaterThan(0);
    expect(within(sites).getAllByText(/^(On track|Over): /).length).toBeGreaterThan(0);
  });

  it("names the fouled turbine's lost efficiency as avoidable", async () => {
    renderApp("/esg");
    const table = await screen.findByRole("table", { name: /^The assets emitting most/ });
    const row = within(table).getByRole("link", { name: "EBC-GT-101" }).closest("tr")!;
    expect(within(row).getByText(/ t: lost efficiency \(fouling\)$/)).toBeInTheDocument();
  });

  it("shows a solar park emitting nothing directly, and what it saved", async () => {
    renderApp("/esg?scope=PCS");
    const sites = await screen.findByRole("table", { name: /^Sites with emissions/ });
    const row = within(sites)
      .getByRole("rowheader", { name: /^Pecos Solar Farm/ })
      .closest("tr")!;
    expect(within(row).getByText("No direct emissions")).toBeInTheDocument();
  });
});
