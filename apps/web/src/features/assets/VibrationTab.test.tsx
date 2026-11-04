import { screen, within } from "@testing-library/react";
import userEvent, { PointerEventsCheckLevel } from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { usePreferences } from "../../shared/preferences";
import { renderApp } from "../../test/render-app";

beforeEach(() => {
  usePreferences.setState({ role: "condition_analyst", theme: "light", units: "si" });
});

const setup = () => userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });

describe("Asset 360 vibration tab", () => {
  it("shows a pump's bearing defect in the spectrum, with its fault frequencies marked", async () => {
    const user = setup();
    renderApp("/assets/PBU-PMP-106/vibration");
    const findings = await screen.findByRole("region", { name: "What the spectrum shows" });
    expect(within(findings).getByText(/: Rolling bearing, (outer|inner)-race defect$/)).toBeInTheDocument();
    expect(screen.getByText("Rolling bearing 6309, 8 balls")).toBeInTheDocument();
    expect(screen.getByRole("application", { name: /^Vibration spectrum of BRG1_VIB/ })).toBeInTheDocument();
    // Rolling bearings have no proximity probes, so no orbit.
    expect(screen.getByText(/^No orbit for this machine/)).toBeInTheDocument();

    const spectrum = screen.getByRole("region", { name: /^Spectrum,/ });
    await user.click(within(spectrum).getByRole("button", { name: "Show as table" }));
    expect(within(spectrum).getByRole("rowheader", { name: "Outer-race frequency (BPFO)" })).toBeInTheDocument();
    expect(within(spectrum).getByRole("rowheader", { name: "Cage frequency (FTF)" })).toBeInTheDocument();
  });

  it("lists the weekly measurements and lets you pick an older one", async () => {
    const user = setup();
    renderApp("/assets/PBU-PMP-106/vibration");
    const waterfall = await screen.findByRole("region", { name: "Waterfall: the last 12 weeks" });
    expect(within(waterfall).getByRole("application", { name: /13 measurements, newest in front/ })).toBeInTheDocument();
    await user.click(within(waterfall).getByRole("button", { name: "Show as table" }));
    const table = within(waterfall).getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(14);
    expect(within(table).getByRole("columnheader", { name: "BPFO" })).toBeInTheDocument();

    const pick = screen.getByLabelText("Spectrum from");
    const oldest = within(pick).getAllByRole("option").at(-1)!;
    await user.selectOptions(pick, oldest);
    expect(screen.getByRole("heading", { name: `Spectrum, ${oldest.textContent}` })).toBeInTheDocument();
  });

  it("draws the orbit of a journal-bearing compressor and opens on its worse bearing", async () => {
    renderApp("/assets/GCM-CMP-105/vibration");
    expect(await screen.findByRole("application", { name: /^Shaft orbit at BRG2_VIB/ })).toBeInTheDocument();
    expect(screen.getByLabelText("Measurement point")).toHaveValue("BRG2_VIB");
    expect(screen.getByText(/: Flow instability$/)).toBeInTheDocument();
  });

  it("moves a cursor over the orbit and the waterfall from the keyboard, and says where it is", async () => {
    const user = setup();
    renderApp("/assets/GCM-CMP-105/vibration");
    const orbit = await screen.findByRole("application", { name: /^Shaft orbit at BRG2_VIB/ });
    orbit.focus();
    await user.keyboard("{PageDown}{ArrowRight}"); // a whole turn on, then one point
    const orbitSection = screen.getByRole("region", { name: "Orbit" });
    expect(within(orbitSection).getByRole("status")).toHaveTextContent(
      /^Turn 2 of \d+, \d+° after the once-per-turn mark: X -?\d+\.\d µm, Y -?\d+\.\d µm$/,
    );

    const waterfall = screen.getByRole("region", { name: "Waterfall: the last 12 weeks" });
    within(waterfall).getByRole("application").focus();
    await user.keyboard("{Home}");
    const status = within(waterfall).getByRole("status");
    expect(status).toHaveTextContent(/^.+: \d+(\.\d)? Hz, .+$/);
    const newest = status.textContent;
    await user.keyboard("{ArrowUp}"); // an older week: another date, same frequency
    expect(status.textContent).not.toBe(newest);
    expect(status.textContent?.split(": ")[1]?.split(",")[0]).toBe(newest?.split(": ")[1]?.split(",")[0]);
  });

  it("only appears for rotating machines", async () => {
    renderApp("/assets/ANP-TX-104/overview");
    const tabs = await screen.findByRole("navigation", { name: "Asset sections" });
    await within(tabs).findByRole("link", { name: "Performance" }); // the tab list is complete once the asset has loaded
    expect(within(tabs).queryByRole("link", { name: "Vibration" })).toBeNull();
  });
});
