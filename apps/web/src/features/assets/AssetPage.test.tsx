import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { usePreferences } from "../../shared/preferences";
import { renderApp } from "../../test/render-app";

beforeEach(() => {
  usePreferences.setState({ role: "reliability_engineer", theme: "light", units: "si" });
});

describe("prediction panel (acceptance criterion B)", () => {
  it("opens from a top-risk row in one click, with evidence, explanation, confidence and action", async () => {
    const user = userEvent.setup();
    const { backend } = renderApp("/command-center");
    const top = backend.request("risks.top", { limit: 1 }).items[0]!;

    const risks = await screen.findByRole("region", { name: "Top risks" });
    await user.click(await within(risks).findByRole("button", { name: new RegExp(`Open prediction: .* on ${top.assetId}`) })); // ← the one click

    const panel = await screen.findByRole("dialog");
    expect(within(panel).getByRole("heading", { name: top.failureModeLabel! })).toBeInTheDocument();
    for (const section of ["Recommended action", "Why the model thinks so", "How much to trust it", "Evidence"]) {
      expect(await within(panel).findByRole("heading", { name: section })).toBeInTheDocument();
    }
    expect(within(panel).getByText("Confidence")).toBeInTheDocument();
    expect(within(panel).getByText("Cost if it fails")).toBeInTheDocument();
  });
});

describe("Asset 360", () => {
  it("redirects /assets/:id to the overview tab and shows the header", async () => {
    const { router } = renderApp("/assets/CBC-GT-101");
    expect(await screen.findByRole("heading", { level: 1, name: /Gas Turbine\s+CBC-GT-101/ })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/assets/CBC-GT-101/overview");
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
  });

  it("telemetry lists every sensor with its limits in the chosen units", async () => {
    usePreferences.setState({ units: "imperial" });
    const { backend } = renderApp("/assets/CBC-GT-101/telemetry");
    const tags = backend.request("assets.tags", { assetId: "CBC-GT-101" }).items;
    const list = await screen.findByRole("region", { name: `Sensors (${tags.length})` });
    expect(within(list).getAllByRole("checkbox")).toHaveLength(tags.length);
    // Exhaust temperature limits shown in °F, not °C.
    const exhaust = within(list).getByText("Exhaust temperature (average)").closest("label")!;
    expect(within(exhaust).getByText(/°F/)).toBeInTheDocument();
  });

  it("shows a friendly page for an unknown asset", async () => {
    renderApp("/assets/NOPE-1/overview");
    expect(await screen.findByText("Asset not found")).toBeInTheDocument();
  });
});

describe("asset registry", () => {
  it("lists assets in scope, riskiest first, with paging", async () => {
    const { backend } = renderApp("/assets?scope=CBC");
    const expected = backend.request("assets.list", { scopeId: "CBC", limit: 1 });
    expect(await screen.findByRole("region", { name: `${expected.total} assets` })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: expected.items[0]!.id })).toBeInTheDocument();
  });
});
