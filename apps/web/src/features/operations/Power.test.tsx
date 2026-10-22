import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { usePreferences } from "../../shared/preferences";
import { renderApp } from "../../test/render-app";

beforeEach(() => {
  usePreferences.setState({ role: "plant_manager", theme: "light", units: "si" });
});

describe("gas-to-power operations", () => {
  it("is where /operations goes, and shows every plant", async () => {
    const { router } = renderApp("/operations");
    await waitFor(() => expect(router.state.location.pathname).toBe("/operations/power"));
    const plants = await screen.findByRole("region", { name: "Plants" });
    for (const name of ["Coastal Bend CCGT", "Al Noor CCGT", "Ebute Combined Cycle", "Sahel Peaker Plant"]) {
      expect(within(plants).getByText(name)).toBeInTheDocument();
    }
    // The first plant is picked.
    expect(within(plants).getByText("Coastal Bend CCGT").closest("a")).toHaveAttribute("aria-current", "true");
  });

  it("flags a fouled turbine and shows its efficiency trend", async () => {
    renderApp("/operations/power?site=EBC");
    expect(await screen.findByText("1 gas turbine needs a water wash")).toBeInTheDocument();
    const table = await screen.findByRole("table", { name: "Gas turbines" });
    const row = within(table).getByRole("link", { name: "EBC-GT-101" }).closest("tr")!;
    expect(row).toHaveTextContent("Water wash advised");
    // The worst turbine's trend is shown first.
    expect(await screen.findByRole("heading", { name: "EBC-GT-101: efficiency over 14 days" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /^EBC-GT-101 heat rate compared with its baseline/ })).toBeInTheDocument();
  });

  it("switches the trend to another turbine", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/operations/power?site=EBC");
    const table = await screen.findByRole("table", { name: "Gas turbines" });
    const row = within(table).getByRole("link", { name: "EBC-GT-102" }).closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Show trend" }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ site: "EBC", gt: "EBC-GT-102" }));
    expect(await screen.findByRole("heading", { name: "EBC-GT-102: efficiency over 14 days" })).toBeInTheDocument();
  });

  it("puts a gassing transformer on the Duval triangle and in the table", async () => {
    renderApp("/operations/power?site=ANP");
    const table = await screen.findByRole("table", { name: "Latest oil sample of each transformer" });
    const row = within(table).getByRole("link", { name: "ANP-TX-104" }).closest("tr")!;
    expect(row).toHaveTextContent(/Condition [2-4]/);
    expect(screen.getByRole("img", { name: /^Duval triangle.*Needs a look: ANP-TX-104/ })).toBeInTheDocument();
  });

  it("gives the output chart as a table too", async () => {
    const user = userEvent.setup();
    renderApp("/operations/power?site=CBC");
    const section = await screen.findByRole("region", { name: "Coastal Bend CCGT: output and dispatch" });
    await user.click(within(section).getByRole("button", { name: "Show as table" }));
    const table = within(section).getByRole("table", { name: /Plant output and dispatch over the last 48 hours/ });
    expect(within(table).getAllByRole("row")).toHaveLength(49);
  });
});

describe("Asset 360 performance tab", () => {
  it("shows a gas turbine's inspection hours", async () => {
    renderApp("/assets/CBC-GT-101/performance");
    expect(await screen.findByRole("heading", { name: "Operating hours and inspections" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Performance" })).toHaveAttribute("aria-current", "page");
  });

  it("shows a transformer's oil samples over time", async () => {
    renderApp("/assets/ANP-TX-104/performance");
    const table = await screen.findByRole("table", { name: "Oil samples" });
    expect(within(table).getAllByRole("row")).toHaveLength(7);
    expect(screen.getByRole("img", { name: /^Duval triangle with ANP-TX-104's last oil samples/ })).toBeInTheDocument();
  });

  it("isn't offered for equipment without performance measures", async () => {
    renderApp("/assets/CBC-ST-101/overview");
    const tabs = await screen.findByRole("navigation", { name: "Asset sections" });
    await screen.findByRole("heading", { name: /CBC-ST-101/ }); // the asset has loaded
    expect(within(tabs).queryByRole("link", { name: "Performance" })).not.toBeInTheDocument();
  });
});
