import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useOverlays } from "../../shared/overlays";
import { usePreferences } from "../../shared/preferences";
import { renderApp } from "../../test/render-app";

beforeEach(() => {
  usePreferences.setState({ role: "plant_manager", theme: "light", units: "si" });
  useOverlays.setState({ open: null, answers: [], pendingQuestion: null });
});

describe("copilot", () => {
  it("answers from the data, citing where each number came from", async () => {
    renderApp("/command-center");
    await userEvent.click(await screen.findByRole("button", { name: "Open the copilot (.)" }));
    const panel = await screen.findByRole("dialog", { name: "Copilot" });
    await userEvent.click(within(panel).getByRole("button", { name: "Which alarms are urgent right now?" }));
    const answer = await within(panel).findByText(/^Read as: Urgent alarms · /);
    const article = answer.closest("article")!;
    expect(within(article).getByText(/urgent alarms? (is|are) active|No urgent/)).toBeInTheDocument();
    expect(within(article).getAllByRole("link", { name: /^(Page|Asset) / }).length).toBeGreaterThan(0);
    expect(within(article).getByText(/^Answered by the scripted copilot/)).toBeInTheDocument();
  });

  it("only suggests a work order: nothing is raised until the person confirms", async () => {
    const { backend } = renderApp("/command-center");
    const before = backend.request("workOrders.list", { limit: 1 }).total;
    await userEvent.click(await screen.findByRole("button", { name: "Open the copilot (.)" }));
    const panel = await screen.findByRole("dialog", { name: "Copilot" });
    await userEvent.type(
      within(panel).getByRole("textbox", { name: "Your question" }),
      "Which assets are likely to fail in the next 90 days?",
    );
    await userEvent.click(within(panel).getByRole("button", { name: "Ask" }));
    const raise = await within(panel).findByRole("button", { name: /^Raise a work order for / });
    await userEvent.click(raise);
    const confirm = await screen.findByRole("dialog", { name: "Raise this work order?" });
    expect(backend.request("workOrders.list", { limit: 1 }).total).toBe(before);
    await userEvent.click(within(confirm).getByRole("button", { name: "Raise work order" }));
    expect(await screen.findByText(/^WO-\d+ raised$/)).toBeInTheDocument();
    expect(backend.request("workOrders.list", { limit: 1 }).total).toBe(before + 1);
  });

  it("says what it can answer when it doesn't understand", async () => {
    renderApp("/command-center");
    await userEvent.click(await screen.findByRole("button", { name: "Open the copilot (.)" }));
    const panel = await screen.findByRole("dialog", { name: "Copilot" });
    await userEvent.type(within(panel).getByRole("textbox", { name: "Your question" }), "Tell me a joke");
    await userEvent.click(within(panel).getByRole("button", { name: "Ask" }));
    // Once in the answer, once in the live region that reads it out to screen readers.
    expect((await within(panel).findAllByText(/^I can only answer questions I was built for/)).length).toBeGreaterThan(0);
    expect(within(panel).getByRole("button", { name: "What are our emissions?" })).toBeInTheDocument();
  });
});

describe("command palette and shortcuts", () => {
  it("Ctrl+K finds a page and opens it with Enter", async () => {
    const { router } = renderApp("/command-center");
    await screen.findByRole("heading", { level: 1 });
    await userEvent.keyboard("{Control>}k{/Control}");
    const box = await screen.findByRole("combobox", { name: "Search pages, assets and actions" });
    await userEvent.type(box, "weibull");
    expect(await screen.findByRole("option", { name: /Reliability › Weibull analysis/, selected: true })).toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(router.state.location.pathname).toBe("/reliability/weibull"));
  });

  it("finds assets, and only offers pages the role can open", async () => {
    usePreferences.setState({ role: "executive" });
    renderApp("/command-center");
    await screen.findByRole("heading", { level: 1 });
    await userEvent.click(screen.getByRole("button", { name: "Search pages and assets (Ctrl+K)" }));
    const box = await screen.findByRole("combobox", { name: "Search pages, assets and actions" });
    await userEvent.type(box, "admin");
    expect(screen.queryByRole("option", { name: /Administration/ })).not.toBeInTheDocument();
    await userEvent.clear(box);
    await userEvent.type(box, "CBC-GT-101");
    expect(await screen.findByRole("option", { name: /CBC-GT-101 · / })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /^Ask the copilot: "CBC-GT-101"/ })).toBeInTheDocument();
  });

  it("g then a goes to Assets, ? lists the shortcuts, and keys typed in a box are left alone", async () => {
    const { router } = renderApp("/command-center");
    await screen.findByRole("heading", { level: 1 });
    await userEvent.keyboard("ga");
    await waitFor(() => expect(router.state.location.pathname).toBe("/assets"));
    await userEvent.keyboard("?");
    const sheet = await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
    expect(within(sheet).getByRole("rowheader", { name: /Ctrl\/⌘\+K/ })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const search = await screen.findByRole("searchbox");
    await userEvent.type(search, "g");
    await userEvent.type(search, "l");
    expect(router.state.location.pathname).toBe("/assets");
  });
});
