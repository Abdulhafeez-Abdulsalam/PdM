import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { usePreferences } from "../../shared/preferences";
import { renderApp } from "../../test/render-app";

beforeEach(() => {
  usePreferences.setState({ role: "executive", theme: "light", units: "si" });
});

describe("financials", () => {
  it("shows value from predictions, money at risk, downtime and spend against budget", async () => {
    renderApp("/financials");
    expect(await screen.findByRole("heading", { level: 1, name: "Financials" })).toBeInTheDocument();
    const kpis = await screen.findByRole("region", { name: "Financial measures" });
    for (const label of ["Value from predictions", "Money at risk", "Cost of downtime", "Maintenance spend", "Planned work"])
      expect(within(kpis).getByText(label)).toBeInTheDocument();
    expect(within(kpis).getByText(/^Budget \$/)).toBeInTheDocument();
    const kinds = screen.getByRole("table", { name: /^Maintenance spend by kind of work/ });
    expect(within(kinds).getByRole("rowheader", { name: "Corrective (repairs)" })).toBeInTheDocument();
  });

  it("shows the working for each predictive job: labour hours at the rate, parts, value", async () => {
    renderApp("/financials");
    const table = await screen.findByRole("table", { name: /^Finished predictive jobs/ });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.length).toBeGreaterThan(0);
    expect(within(rows[0]!).getByRole("link", { name: /^WO-/ })).toBeInTheDocument();
    expect(within(rows[0]!).getByText(/^[\d.]+ h · \$[\d,]+$/)).toBeInTheDocument();
    expect(within(table).getAllByText(/^(Fault confirmed|False alarm)$/).length).toBe(rows.length);
  });

  it("costs an hour of downtime by business and narrows to one site", async () => {
    renderApp("/financials?scope=EBC");
    const table = await screen.findByRole("table", { name: /^Hours lost to failures/ });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(1);
    expect(within(rows[0]!).getByRole("rowheader", { name: "Ebute Combined Cycle" })).toBeInTheDocument();
    expect(within(rows[0]!).getByText("$12,000")).toBeInTheDocument();
  });
});
