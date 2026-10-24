import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { usePreferences } from "../../shared/preferences";
import { renderApp } from "../../test/render-app";

beforeEach(() => {
  usePreferences.setState({ role: "control_room_operator", theme: "light", units: "si" });
});

describe("digital twin", () => {
  it("lays a process area out from supply to grid, every asset linking to Asset 360", async () => {
    renderApp("/twin?site=CBC&area=CBC-GT1");
    const flow = await screen.findByRole("list", { name: "GT Train 1, from supply to grid" });
    expect(within(flow).getByRole("heading", { name: "Drive" })).toBeInTheDocument();
    expect(within(flow).getByRole("link", { name: /^CBC-GT-101/ })).toHaveAttribute("href", "/assets/CBC-GT-101/overview");
    expect(screen.getByRole("heading", { name: "Valves and protection" })).toBeInTheDocument();
  });

  it("draws a pipeline as a route by distance, with a table of its segments", async () => {
    renderApp("/twin?site=GCM&area=GCM-PLA");
    const route = await screen.findByRole("list", { name: /^Pipeline Section A, \d+ km, segment by segment$/ });
    expect(within(route).getAllByRole("link")).toHaveLength(14);
    const table = screen.getByRole("table", { name: "Segments of Pipeline Section A in route order" });
    expect(within(table).getAllByRole("row")).toHaveLength(15);
    expect(within(table).getByRole("columnheader", { name: "Wall thickness" })).toBeInTheDocument();
  });

  it("shows a solar block as inverters with their strings", async () => {
    renderApp("/twin?site=PCS&area=PCS-BLA");
    const inverters = await screen.findByRole("list", { name: "Inverters in Block A, each with its strings" });
    const strings = within(inverters).getByRole("list", { name: "Strings feeding PCS-INV-101" });
    expect(within(strings).getAllByRole("link")).toHaveLength(6);
  });

  it("replays an earlier hour with the slider", async () => {
    renderApp("/twin?site=CBC&area=CBC-GT1");
    const slider = await screen.findByLabelText(/^Showing: now/);
    fireEvent.change(slider, { target: { value: "48" } });
    await waitFor(() => expect(screen.getByLabelText(/^Showing: 24 hours ago/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Back to now" })).toBeEnabled();
    expect(await screen.findByText(/past a limit, 24 hours ago/)).toBeInTheDocument();
  });

  it("puts the asset in its place on Asset 360, with a way into the replay", async () => {
    renderApp("/assets/CBC-GT-101/twin");
    const me = await screen.findByRole("link", { name: /^CBC-GT-101/, current: true });
    expect(me).toHaveAttribute("href", "/assets/CBC-GT-101/overview");
    const replay = screen.getByRole("link", { name: "Replay the last three days in the digital twin" });
    expect(replay.getAttribute("href")).toContain("area=CBC-GT1");
    expect(replay.getAttribute("href")).toContain("focus=CBC-GT-101");
  });
});
