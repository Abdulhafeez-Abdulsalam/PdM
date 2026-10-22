import { createMockBackend } from "@pdm/mock-data";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { usePreferences } from "../../shared/preferences";
import { TEST_SEED, TEST_START, renderApp } from "../../test/render-app";

beforeEach(() => {
  usePreferences.setState({ role: "reliability_engineer", theme: "light", units: "si" });
});

const probe = () => createMockBackend({ seed: TEST_SEED, startTime: TEST_START, realNow: () => TEST_START });

describe("fleet comparison", () => {
  it("ranks a class worst first and flags the outliers", async () => {
    const r = probe().request("assets.compare", { assetClass: "pump", measure: "tag:BRG1_VIB" });
    const outliers = r.items.filter((i) => i.outlier);
    expect(outliers.length).toBeGreaterThan(0);
    renderApp("/assets/compare?class=pump&measure=tag:BRG1_VIB");
    const table = await screen.findByRole("table", { name: /Assets ranked worst to best/ });
    const first = within(table).getAllByRole("row")[1]!;
    expect(first).toHaveTextContent(r.items[0]!.assetName);
    expect(within(table).getAllByText("Unusually high")).toHaveLength(outliers.filter((o) => o.outlier === "high").length);
    expect(screen.getByRole("img", { name: new RegExp(`${outliers.length} outliers`) })).toBeInTheDocument();
  });

  it("says why a stopped asset has no sensor value", async () => {
    renderApp("/assets/compare?class=pump&measure=tag:BRG1_VIB");
    const table = await screen.findByRole("table", { name: /Assets ranked worst to best/ });
    expect(within(table).getAllByText(/^Not running \(/).length).toBeGreaterThan(0);
  });

  it("filters to the outliers, and points out a highlighted asset", async () => {
    const user = userEvent.setup();
    const r = probe().request("assets.compare", { assetClass: "pump", measure: "health" });
    const pick = r.items[5]!;
    renderApp(`/assets/compare?class=pump&measure=health&highlight=${pick.assetId}`);
    const table = await screen.findByRole("table", { name: /Assets ranked worst to best/ });
    expect(within(table).getByRole("link", { name: pick.assetName }).closest("tr")).toHaveAttribute("aria-current", "true");

    await user.click(screen.getByRole("checkbox", { name: /^Only outliers/ }));
    await waitFor(() => expect(within(table).getAllByRole("row")).toHaveLength(r.items.filter((i) => i.outlier).length + 1));
  });

  it("changes class and measure, and is reached from the registry", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/assets");
    const nav = await screen.findByRole("navigation", { name: "Asset pages" });
    await user.click(within(nav).getByRole("link", { name: "Compare" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/assets/compare"));

    await user.selectOptions(await screen.findByLabelText("Equipment type"), "inverter");
    await waitFor(() => expect(router.state.location.search).toMatchObject({ class: "inverter" }));
    await user.selectOptions(await screen.findByLabelText("Compare on"), "anomaly");
    await waitFor(() => expect(router.state.location.search).toMatchObject({ class: "inverter", measure: "anomaly" }));
    expect(await screen.findByRole("img", { name: /^Anomaly score \(0–1\) for every Inverter/ })).toBeInTheDocument();
  });
});
