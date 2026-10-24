import { screen, waitFor, within } from "@testing-library/react";
import userEvent, { PointerEventsCheckLevel } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { usePreferences } from "../../shared/preferences";
import { renderApp } from "../../test/render-app";

const setup = () => userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });
const as = (role: "hse_officer" | "maintenance_planner") => usePreferences.setState({ role, theme: "light", units: "si" });

describe("HSE", () => {
  it("is the HSE Officer's home page, with impaired safety-critical equipment and why", async () => {
    as("hse_officer");
    const { router } = renderApp("/");
    expect(await screen.findByRole("heading", { level: 1, name: "HSE & Compliance" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/hse");
    const table = await screen.findByRole("table", { name: /^Safety-critical equipment/ });
    const first = within(table).getAllByRole("row")[1]!;
    expect(within(first).getByText(/^(Poor health|PM overdue|P1 alarm)$/, { selector: "li" })).toBeInTheDocument();
  });

  it("issues a waiting permit", async () => {
    as("hse_officer");
    const user = setup();
    const { backend } = renderApp("/hse/permits");
    const table = await screen.findByRole("table", { name: /^Permits to work/ });
    const waiting = backend.request("hse.permits", { status: ["requested"] }).items;
    const first = within(table).getAllByRole("row")[1]!;
    await user.click(within(first).getByRole("button", { name: /^Issue PTW-/ }));
    expect(await screen.findByText(/^PTW-\d+ issued: WO-\d+ may start$/)).toBeInTheDocument();
    await waitFor(() => expect(backend.request("hse.permits", { status: ["requested"] }).items).toHaveLength(waiting.length - 1));
  });

  it("shows a scheduled job's permit on its work order, and that it can't start yet", async () => {
    as("maintenance_planner");
    const { backend, router } = renderApp("/maintenance");
    await screen.findByRole("heading", { level: 1 });
    const permit = backend.request("hse.permits", { status: ["requested"] }).items[0]!;
    await router.navigate({ to: "/maintenance/$workOrderId", params: { workOrderId: permit.workOrderId } });
    const card = await screen.findByRole("region", { name: "Permit to work" });
    expect(within(card).getByText("Waiting to be issued")).toBeInTheDocument();
    expect(within(card).getByText("Work can't start until this permit is issued.")).toBeInTheDocument();
    // Only the HSE officer issues permits.
    expect(within(card).queryByRole("button", { name: /^Issue/ })).toBeNull();
  });

  it("takes a near-miss report", async () => {
    as("hse_officer");
    const user = setup();
    renderApp("/hse/incidents");
    const form = await screen.findByRole("region", { name: "Report a near miss" });
    await user.type(within(form).getByLabelText("Asset tag"), "PBU-PMP-106");
    await user.type(within(form).getByLabelText("What happened"), "Loose guard on the coupling");
    await user.click(within(form).getByRole("button", { name: "Report" }));
    expect(await screen.findByText(/^INC-\d+ reported\. Thank you\.$/)).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Incidents, newest first" });
    expect(await within(table).findByText("Loose guard on the coupling")).toBeInTheDocument();
  });

  it("proposes a change, and a rejection needs a reason", async () => {
    as("hse_officer");
    const user = setup();
    renderApp("/hse/moc");
    const form = await screen.findByRole("region", { name: "Propose a change" });
    await user.type(within(form).getByLabelText("Change"), "Change the lube oil grade");
    await user.type(within(form).getByLabelText("Asset tag"), "PBU-PMP-106");
    await user.type(within(form).getByLabelText("What and why"), "Move to a synthetic oil with a longer life.");
    await user.click(within(form).getByRole("button", { name: "Propose" }));
    expect(await screen.findByText(/^MOC-\d+ proposed$/)).toBeInTheDocument();
    const list = screen.getByRole("region", { name: /changes$/ });
    const row = (await within(list).findByText("Change the lube oil grade")).closest("li")!;
    await user.click(within(row).getByRole("button", { name: /^Reject MOC-/ }));
    const confirm = within(row).getByRole("button", { name: "Reject" });
    expect(confirm).toBeDisabled();
    await user.type(within(row).getByLabelText("Reason"), "Not needed");
    expect(confirm).toBeEnabled();
  });
});
