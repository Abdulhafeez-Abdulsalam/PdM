import { createMockBackend } from "@pdm/mock-data";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { usePreferences } from "../../shared/preferences";
import { useToasts } from "../../shared/toast";
import { TEST_SEED, TEST_START, renderApp } from "../../test/render-app";

beforeEach(() => {
  usePreferences.setState({ role: "reliability_engineer", theme: "light", units: "si" });
  useToasts.setState({ toasts: [] });
});

/** A separate copy of the same deterministic world, for looking up ids before rendering. */
const probe = () => createMockBackend({ seed: TEST_SEED, startTime: TEST_START, realNow: () => TEST_START });

function openPrediction(withoutWorkOrder = false) {
  const p = probe()
    .request("predictions.list", { status: ["open"], limit: 100 })
    .items.find((x) => !withoutWorkOrder || !x.workOrderId);
  if (!p) throw new Error("test data has no suitable open prediction");
  return p;
}

describe("prediction console", () => {
  it("lists predictions by money at risk, as the backend ranks them", async () => {
    const { backend } = renderApp("/predictive");
    const expected = backend.request("predictions.list", { status: ["open", "acknowledged", "actioned"], limit: 3 }).items.map((p) => p.id);
    const table = await screen.findByRole("region", { name: /predictions?$/ });
    await waitFor(() => {
      const ids = within(table)
        .getAllByText(/^PRED-\d+$/)
        .map((el) => el.textContent);
      expect(ids.slice(0, 3)).toEqual(expected);
    });
  });

  it("is the Condition Monitoring Analyst's home page", async () => {
    usePreferences.setState({ role: "condition_analyst" });
    const { router } = renderApp("/");
    await waitFor(() => expect(router.state.location.pathname).toBe("/predictive"));
  });
});

describe("prediction page", () => {
  it("records feedback in one click", async () => {
    const user = userEvent.setup();
    const p = openPrediction();
    const { backend } = renderApp(`/predictive/${p.id}`);
    const panel = await screen.findByRole("group", { name: "Was the model right?" });
    await user.click(within(panel).getByRole("button", { name: "No — false alarm" }));
    await waitFor(() => expect(backend.request("predictions.get", { predictionId: p.id }).feedback).toBe("false_positive"));
  });

  it("needs a reason to dismiss", async () => {
    const user = userEvent.setup();
    const p = openPrediction();
    const { backend } = renderApp(`/predictive/${p.id}`);
    await user.click(await screen.findByRole("button", { name: "Dismiss" }));
    const dialog = await screen.findByRole("dialog", { name: "Dismiss prediction" });
    await user.click(within(dialog).getByRole("button", { name: "Dismiss" }));
    expect(await within(dialog).findByText("Give a reason of at least 5 characters.")).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Reason/), "Sensor replaced last week; readings were wrong");
    await user.click(within(dialog).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(backend.request("predictions.get", { predictionId: p.id }).status).toBe("dismissed"));
  });

  it("raises a work order from the prediction, linked both ways", async () => {
    const user = userEvent.setup();
    const p = openPrediction(true);
    const { backend } = renderApp(`/predictive/${p.id}`);
    await user.click(await screen.findByRole("button", { name: "Create work order" }));
    const dialog = await screen.findByRole("dialog", { name: "Create work order" });
    expect(await within(dialog).findByDisplayValue(new RegExp(`${p.assetId}$`))).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Create work order" }));
    await waitFor(() => expect(backend.request("predictions.get", { predictionId: p.id }).workOrderId).not.toBeNull());
    const wo = backend.request("workOrders.list", { assetId: p.assetId, limit: 1 }).items[0]!;
    expect(wo.type).toBe("predictive");
    expect(wo.source).toEqual({ kind: "prediction", refId: p.id });
  });

  it("shows no actions or feedback buttons to an executive", async () => {
    usePreferences.setState({ role: "executive" });
    const p = openPrediction();
    renderApp(`/predictive/${p.id}`);
    expect(await screen.findByRole("heading", { name: "Was the model right?" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
    expect(screen.queryByRole("button", { name: "No — false alarm" })).toBeNull();
  });
});
