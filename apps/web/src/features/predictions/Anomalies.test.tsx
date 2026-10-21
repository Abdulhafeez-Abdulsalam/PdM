import { createMockBackend } from "@pdm/mock-data";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { usePreferences } from "../../shared/preferences";
import { TEST_SEED, TEST_START, renderApp } from "../../test/render-app";

beforeEach(() => {
  usePreferences.setState({ role: "condition_analyst", theme: "light", units: "si" });
});

const probe = () => createMockBackend({ seed: TEST_SEED, startTime: TEST_START, realNow: () => TEST_START });

describe("fleet anomaly view", () => {
  it("shows the counts, and lists anomalous and rising assets by default", async () => {
    const fleet = probe().request("anomalies.fleet", { state: ["anomalous", "rising"], limit: 500 });
    renderApp("/predictive/anomalies");
    const filters = await screen.findByRole("group", { name: "Show assets that are" });
    const anomalous = within(filters).getByRole("button", { name: /^Anomalous/ });
    await waitFor(() => expect(anomalous).toHaveTextContent(String(fleet.counts.anomalous)));
    expect(anomalous).toHaveAttribute("aria-pressed", "true");
    expect(within(filters).getByRole("button", { name: /^Normal/ })).toHaveAttribute("aria-pressed", "false");

    const table = await screen.findByRole("table", { name: /anomaly score/ });
    const top = fleet.items[0]!;
    expect(within(table).getByRole("link", { name: top.assetName })).toBeInTheDocument();
    expect(within(table).getAllByRole("row")).toHaveLength(Math.min(fleet.total, 200) + 1); // + header row
  });

  it("names the sensors driving an anomaly, and links to its prediction", async () => {
    const row = probe()
      .request("anomalies.fleet", { state: ["anomalous"], limit: 500 })
      .items.find((r) => r.predictionId !== null && r.contributions.length > 1)!;
    renderApp(`/predictive/anomalies?q=${row.assetId}`);
    const table = await screen.findByRole("table", { name: /anomaly score/ });
    const tr = within(table).getByRole("link", { name: row.assetName }).closest("tr")!;
    for (const c of row.contributions.slice(0, 3)) expect(within(tr).getByText(c.label)).toBeInTheDocument();
    expect(within(tr).getByRole("link", { name: row.predictionId! })).toBeInTheDocument();
  });

  it("is honest when the score is over the line but no prediction exists yet", async () => {
    const row = probe()
      .request("anomalies.fleet", { state: ["anomalous"], limit: 500 })
      .items.find((r) => r.predictionId === null);
    expect(row, "the seeded data has one such case at the test start time (CBC-PMP-109)").toBeDefined();
    if (!row) return;
    renderApp(`/predictive/anomalies?q=${row.assetId}`);
    const table = await screen.findByRole("table", { name: /anomaly score/ });
    const tr = within(table).getByRole("link", { name: row.assetName }).closest("tr")!;
    expect(within(tr).getByText(/^No prediction yet/)).toBeInTheDocument();
  });

  it("filters by group: switching Normal on adds the normal assets", async () => {
    const user = userEvent.setup();
    const counts = probe().request("anomalies.fleet", { limit: 1 }).counts;
    renderApp("/predictive/anomalies");
    const filters = await screen.findByRole("group", { name: "Show assets that are" });
    await user.click(within(filters).getByRole("button", { name: /^Normal/ }));
    const total = counts.anomalous + counts.rising + counts.normal;
    expect(await screen.findByText(`${total} assets`)).toBeInTheDocument();
    expect(screen.getByText(/^Showing the 200 most relevant of/)).toBeInTheDocument();
  });

  it("is one of the Predictive pages, next to the prediction console", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/predictive");
    const nav = await screen.findByRole("navigation", { name: "Predictive pages" });
    expect(within(nav).getByRole("link", { name: "Predictions" })).toHaveAttribute("aria-current", "page");
    await user.click(within(nav).getByRole("link", { name: "Anomalies" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/predictive/anomalies"));
  });
});
