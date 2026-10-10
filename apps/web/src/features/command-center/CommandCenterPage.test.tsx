import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { usePreferences } from "../../shared/preferences";
import { renderApp } from "../../test/render-app";
import { KPI_PRESETS } from "./presets";

beforeEach(() => {
  usePreferences.setState({ role: "executive", theme: "light" });
});

describe("Command Center", () => {
  it("shows the top 5 risks, in the backend's order (acceptance criterion A)", async () => {
    const { backend } = renderApp("/command-center");
    const expected = backend.request("risks.top", { limit: 5 }).items.map((r) => r.assetId);

    const widget = await screen.findByRole("region", { name: "Top risks" });
    const rows = await within(widget).findAllByRole("row");
    const ids = rows.slice(1).map((row) => within(row).getByText(/^[A-Z]{3}-[A-Z]+-\d+$/).textContent);
    expect(ids).toEqual(expected);
  });

  it("shows the KPIs for the selected role", async () => {
    renderApp("/command-center");
    const strip = await screen.findByRole("region", { name: "Key performance indicators" });
    expect(await within(strip).findByText("Value delivered")).toBeInTheDocument();
    expect(within(strip).getByText("Health score")).toBeInTheDocument();
  });

  it("filters to the scope in the URL", async () => {
    const { backend } = renderApp("/command-center?scope=CBC");
    const expected = backend.request("risks.top", { scopeId: "CBC", limit: 5 }).items[0]?.assetId;
    const widget = await screen.findByRole("region", { name: "Top risks" });
    expect(await within(widget).findByText(expected!)).toBeInTheDocument();
    expect(expected).toMatch(/^CBC-/);
  });

  it("falls back to the site list when WebGL isn't available", async () => {
    renderApp("/command-center");
    const sites = await screen.findByRole("region", { name: "Sites" });
    expect(await within(sites).findByText("Coastal Bend CCGT")).toBeInTheDocument();
  });

  it("has the daily briefing with all three sections", async () => {
    renderApp("/command-center");
    const briefing = await screen.findByRole("region", { name: "Daily briefing" });
    for (const heading of ["What changed", "Needs attention", "Recommended actions"]) {
      expect(await within(briefing).findByRole("heading", { name: heading })).toBeInTheDocument();
    }
  });
});

describe("KPI presets", () => {
  it("give every role 4–6 KPIs, all different", () => {
    for (const [role, keys] of Object.entries(KPI_PRESETS)) {
      expect(keys.length, role).toBeGreaterThanOrEqual(4);
      expect(keys.length, role).toBeLessThanOrEqual(6);
      expect(new Set(keys).size, role).toBe(keys.length);
    }
  });
});
