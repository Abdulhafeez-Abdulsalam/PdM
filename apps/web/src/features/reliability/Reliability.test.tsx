import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { usePreferences } from "../../shared/preferences";
import { renderApp } from "../../test/render-app";

beforeEach(() => {
  usePreferences.setState({ role: "reliability_engineer", theme: "light", units: "si" });
});

describe("reliability", () => {
  it("is the reliability engineer's home page", async () => {
    const { router } = renderApp("/");
    await waitFor(() => expect(router.state.location.pathname).toBe("/reliability"));
    expect(await screen.findByRole("heading", { level: 1, name: "Reliability" })).toBeInTheDocument();
    const kpis = screen.getByRole("region", { name: "Reliability for the period" });
    expect(within(kpis).getByText("Time between failures (MTBF)")).toBeInTheDocument();
  });

  it("changes period and focuses on one type of equipment", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/reliability");
    await user.selectOptions(await screen.findByLabelText("Period"), "5");
    await waitFor(() => expect(router.state.location.search).toMatchObject({ years: 5 }));
    const classes = await screen.findByRole("table", { name: "By type of equipment" });
    await user.click(within(classes).getByRole("button", { name: "Pump" }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ years: 5, class: "pump" }));
    expect(screen.getByLabelText("Equipment type")).toHaveValue("pump");
  });

  it("ranks failure modes and can rank them by downtime instead", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/reliability");
    expect(await screen.findByRole("img", { name: /^Failure modes ranked by number of failures.*make 80 %/ })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Downtime" }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ by: "downtime" }));
    expect(await screen.findByRole("img", { name: /^Failure modes ranked by downtime/ })).toBeInTheDocument();
  });

  it("lists bad actors, each linking to its failures", async () => {
    const user = userEvent.setup();
    const { router } = renderApp("/reliability?years=5");
    const table = await screen.findByRole("table", { name: "Bad actors" });
    const first = within(table).getAllByRole("link")[0]!;
    const id = first.textContent!;
    await user.click(first);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/assets/${id}/failures`));
    expect(await screen.findByRole("table", { name: "Failures of this asset, newest first" })).toBeInTheDocument();
  });
});

describe("Asset 360 failures tab", () => {
  it("compares the asset with its type and lists its failures", async () => {
    renderApp("/assets/CBC-GT-101/failures");
    const compare = await screen.findByRole("table", { name: "This asset's reliability measures beside its type's" });
    expect(within(compare).getByRole("columnheader", { name: "All 11 of its type" })).toBeInTheDocument();
    const list = screen.getByRole("table", { name: "Failures of this asset, newest first" });
    expect(within(list).getAllByRole("row").length).toBeGreaterThan(1);
  });
});
