import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { usePreferences } from "../../shared/preferences";
import { renderApp } from "../../test/render-app";

beforeEach(() => {
  usePreferences.setState({ role: "plant_manager", theme: "light", units: "si" });
});

describe("solar operations", () => {
  it("is linked from gas-to-power and shows every solar plant", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/operations/power");
    const nav = await screen.findByRole("navigation", { name: "Operations pages" });
    await user.click(within(nav).getByRole("link", { name: "Solar" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/operations/solar"));
    const plants = await screen.findByRole("region", { name: "Plants" });
    for (const name of ["Pecos Solar Farm", "Sahra PV Park", "Wadi Shams Solar"])
      expect(within(plants).getByText(name)).toBeInTheDocument();
  });

  it("shows where the week's energy went", async () => {
    renderApp("/operations/solar?site=PCS");
    const section = await screen.findByRole("region", { name: /Where the energy went/ });
    expect(within(section).getByRole("img", { name: /^Pecos Solar Farm energy losses.*performance ratio/ })).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(within(section).getByRole("button", { name: "Show as table" }));
    const table = within(section).getByRole("table");
    // Sunlight, seven losses, delivered.
    expect(within(table).getAllByRole("row")).toHaveLength(10);
    expect(within(table).getByRole("rowheader", { name: "Dust" })).toBeInTheDocument();
  });

  it("points out the weak inverter and string, and opens their details", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/operations/solar?site=PCS");
    const inverters = await screen.findByRole("region", { name: "Inverters, last 24 hours" });
    const tile = within(inverters).getByRole("link", { name: /^PCS-INV-117/ });
    expect(tile).toHaveTextContent(/of expected/);
    const strings = screen.getByRole("table", { name: "Strings lagging their sisters" });
    expect(within(strings).getAllByRole("row")[1]).toHaveTextContent("PCS-STR-150");

    await user.click(tile);
    await waitFor(() => expect(router.state.location.pathname).toBe("/assets/PCS-INV-117/performance"));
    expect(await screen.findByRole("img", { name: /^PCS-INV-117 power and expected power/ })).toBeInTheDocument();
  });

  it("gives cleaning advice and battery health", async () => {
    renderApp("/operations/solar?site=PCS");
    const cleaning = await screen.findByRole("region", { name: "When to wash the panels" });
    expect(within(cleaning).getByText(/^(Wash now|Wash within|No wash needed yet)/)).toBeInTheDocument();
    const bess = screen.getByRole("table", { name: "Batteries" });
    expect(within(bess).getAllByRole("row")).toHaveLength(3);
  });
});

describe("Asset 360 performance for solar equipment", () => {
  it("compares a string with its sisters", async () => {
    renderApp("/assets/PCS-STR-150/performance");
    expect(await screen.findByRole("img", { name: /^PCS-STR-150 power and its sister strings' median/ })).toBeInTheDocument();
    expect(screen.getByText("IV-curve test and thermal scan")).toBeInTheDocument();
  });

  it("shows a battery's charge over two days", async () => {
    renderApp("/assets/PCS-BESS-102/performance");
    expect(await screen.findByRole("img", { name: /^PCS-BESS-102 charge over the last 48 hours/ })).toBeInTheDocument();
  });
});
