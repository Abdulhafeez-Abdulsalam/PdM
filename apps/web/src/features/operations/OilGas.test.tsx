import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { usePreferences } from "../../shared/preferences";
import { renderApp } from "../../test/render-app";

beforeEach(() => {
  usePreferences.setState({ role: "plant_manager", theme: "light", units: "si" });
});

describe("oil & gas operations", () => {
  it("opens on upstream: the decline curve, the pumps and the wells", async () => {
    renderApp("/operations/oil-gas");
    expect(await screen.findByRole("img", { name: /^Daily oil rate over the last 180 days.*Fitted decline/ })).toBeInTheDocument();
    const pumps = screen.getByRole("table", { name: "Electric submersible pumps (ESPs)" });
    const hot = within(pumps).getByRole("link", { name: "PBU-ESP-107" }).closest("tr")!;
    expect(hot).toHaveTextContent("Motor running hot");
    const wells = screen.getByRole("table", { name: "Wells" });
    // The well whose pump failed loses the most oil, so it's listed first.
    expect(within(wells).getAllByRole("row")[1]).toHaveTextContent(/PBU-WH-1\d\d/);
  });

  it("switches to midstream with the cards, and flags the thin pipe and the compressor near surge", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/operations/oil-gas");
    const parts = await screen.findByRole("navigation", { name: "Parts of the business" });
    await user.click(within(parts).getByRole("link", { name: /^Midstream/ }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ part: "midstream" }));
    const segments = await screen.findByRole("table", { name: "Pipeline segments" });
    expect(within(segments).getAllByRole("row")[1]).toHaveTextContent("GCM-PL-142");
    expect(within(segments).getAllByRole("row")[1]).toHaveTextContent("Act: under 10 years left");
    const compressors = screen.getByRole("table", { name: "Compressor stations" });
    expect(within(compressors).getByRole("link", { name: "GCM-CMP-105" }).closest("tr")).toHaveTextContent("Close to surge");
    expect(screen.getByRole("img", { name: /^Pipeline wall thickness by distance/ })).toBeInTheDocument();
  });

  it("downstream lists what's due first, and can show every inspection", async () => {
    const user = userEvent.setup();
    renderApp("/operations/oil-gas?part=downstream");
    const table = await screen.findByRole("table", { name: "Inspection schedule" });
    const due = within(table).getAllByRole("row").length - 1;
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("overdue");
    await user.click(screen.getByRole("checkbox", { name: /^Show all/ }));
    await waitFor(() =>
      expect(within(screen.getByRole("table", { name: "Inspection schedule" })).getAllByRole("row").length - 1).toBeGreaterThan(due),
    );
    const hx = screen.getByRole("table", { name: "Heat exchangers" });
    expect(within(hx).getAllByRole("row")[1]).toHaveTextContent(/Clean now|In about/);
  });
});

describe("Asset 360 performance for oil & gas equipment", () => {
  it("explains an ESP's diagnosis", async () => {
    renderApp("/assets/PBU-ESP-107/performance");
    expect(await screen.findByText(/insulation is ageing fast/)).toBeInTheDocument();
  });

  it("shows a pipe's remaining life and its next inspection", async () => {
    renderApp("/assets/GCM-PL-142/performance");
    expect(await screen.findByRole("heading", { name: "Wall thickness and remaining life" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Next inspection" })).toBeInTheDocument();
    expect(screen.getByText("Pipeline in-line inspection")).toBeInTheDocument();
  });

  it("shows a well against its own decline curve", async () => {
    renderApp("/assets/PBU-WH-101/performance");
    expect(await screen.findByRole("img", { name: /^PBU-WH-101 daily oil rate with its fitted decline curve/ })).toBeInTheDocument();
  });
});
