import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { usePreferences } from "../../shared/preferences";
import { renderApp } from "../../test/render-app";

beforeEach(() => {
  usePreferences.setState({ role: "reliability_engineer", theme: "light", units: "si" });
});

describe("Weibull analysis", () => {
  it("is reached from the Reliability tabs and explains the fitted β", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/reliability");
    const nav = await screen.findByRole("navigation", { name: "Reliability pages" });
    await user.click(within(nav).getByRole("link", { name: "Weibull analysis" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/reliability/weibull"));
    // Pumps by default, their commonest failure mode.
    const summary = await screen.findByRole("region", { name: "Fitted Weibull" });
    expect(within(summary).getByText("Shape β")).toBeInTheDocument();
    expect(within(summary).getByRole("heading", { name: /^β (below|about|above) 1/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^Weibull probability plot.*Fitted line: β/ })).toBeInTheDocument();
  });

  it("calls inverter breakdowns early failures", async () => {
    renderApp("/reliability/weibull?class=inverter&mode=BRD");
    expect(await screen.findByRole("heading", { name: "β below 1: early failures (infant mortality)" })).toBeInTheDocument();
  });

  it("switches failure mode and shows the plot as a table", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/reliability/weibull?class=pump&mode=VIB");
    expect(await screen.findByRole("heading", { name: "β above 1: wear-out" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Failure mode"), "ELP");
    await waitFor(() => expect(router.state.location.search).toMatchObject({ class: "pump", mode: "ELP" }));
    const plot = screen.getByRole("region", { name: "Weibull probability plot" });
    await user.click(within(plot).getAllByRole("button", { name: "Show as table" })[0]!);
    const table = await within(plot).findByRole("table");
    expect(within(table).getAllByRole("row").length).toBeGreaterThan(20);
  });
});

describe("risk matrix", () => {
  it("lists the riskiest assets, and a cell's assets when picked", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/reliability/risk");
    expect(await screen.findByRole("heading", { name: "Riskiest assets" })).toBeInTheDocument();
    const matrix = screen.getByRole("table", { name: "Number of assets in each cell of the risk matrix" });
    const cell = within(matrix).getByRole("button", { name: /likelihood 3, consequence 3$/ });
    await user.click(cell);
    await waitFor(() => expect(router.state.location.search).toMatchObject({ l: 3, c: 3 }));
    expect(await screen.findByRole("heading", { name: /^Likelihood 3 × consequence 3:/ })).toBeInTheDocument();
    expect(cell).toHaveAttribute("aria-pressed", "true");
    const items = screen.getByRole("table", { name: "Assets with their likelihood, consequence and risk" });
    for (const row of within(items).getAllByRole("row").slice(1, 6)) expect(row).toHaveTextContent("3 × 3");
  });
});
