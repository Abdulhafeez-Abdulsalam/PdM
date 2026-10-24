import { screen, waitFor, within } from "@testing-library/react";
import userEvent, { PointerEventsCheckLevel } from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { usePreferences } from "../../shared/preferences";
import { renderApp } from "../../test/render-app";

beforeEach(() => {
  usePreferences.setState({ role: "reliability_engineer", theme: "light", units: "si" });
});

const setup = () => userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });

describe("FMEA", () => {
  it("ranks a type's failure modes by RPN with a strategy for each", async () => {
    renderApp("/reliability/fmea?class=pump");
    const table = await screen.findByRole("table", { name: /^Failure modes with severity/ });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent("(act on this)");
    expect(within(table).getByText("Condition-based maintenance")).toBeInTheDocument();
  });
});

describe("root-cause analysis", () => {
  it("starts an investigation from an asset and opens it", async () => {
    const user = setup();
    const { router } = renderApp("/reliability/rca?asset=CBC-GT-101");
    expect(await screen.findByDisplayValue("CBC-GT-101")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start investigation" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/reliability\/rca\/RCA-\d+$/));
    expect(await screen.findByRole("heading", { level: 1, name: "Repeated failures on CBC-GT-101" })).toBeInTheDocument();
  });

  it("fills in the whys and a cause, saves, and raises a work order from an action", async () => {
    const user = setup();
    renderApp("/reliability/rca/RCA-002");
    const why1 = await screen.findByLabelText("Why 1");
    await user.type(why1, "The seal leaked again");
    await user.type(screen.getByLabelText("Add a cause under Material"), "Seal kit from a new supplier");
    await user.click(within(screen.getByLabelText("Add a cause under Material").closest("form")!).getByRole("button", { name: "Add" }));
    expect(screen.getByText("Seal kit from a new supplier")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved")).toBeInTheDocument();

    await user.type(screen.getByLabelText("New action"), "Qualify the new seal supplier");
    await user.click(screen.getByRole("button", { name: "Add action" }));
    const link = await screen.findByRole("link", { name: /^WO-\d+$/ });
    expect(link.getAttribute("href")).toMatch(/^\/maintenance\/wo-\d+/);
  });

  it("can't be closed without a root cause", async () => {
    const user = setup();
    renderApp("/reliability/rca/RCA-002");
    await user.click(await screen.findByRole("button", { name: "Send for review" }));
    const close = await screen.findByRole("button", { name: "Close investigation" });
    expect(close).toBeDisabled();
    await user.type(screen.getByLabelText(/^The root cause/), "No owner for the seal supplier list.");
    expect(close).toBeEnabled();
  });
});
