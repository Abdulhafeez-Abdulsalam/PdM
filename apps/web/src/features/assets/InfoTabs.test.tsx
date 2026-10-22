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
  sessionStorage.clear();
});

const probe = () => createMockBackend({ seed: TEST_SEED, startTime: TEST_START, realNow: () => TEST_START, role: "reliability_engineer" });
/** An asset with a developing fault, so it has a seeded discussion. */
const discussedAsset = () => {
  const b = probe();
  return b
    .request("anomalies.fleet", { state: ["anomalous"], limit: 500 })
    .items.find((a) => b.request("assets.comments", { assetId: a.assetId }).items.length > 0)!;
};

describe("documents tab", () => {
  it("lists the asset's documents and filters by type", async () => {
    const user = userEvent.setup();
    const docs = probe().request("assets.documents", { assetId: "CBC-GT-101" }).items;
    renderApp("/assets/CBC-GT-101/documents");
    const table = await screen.findByRole("table", { name: "Documents" });
    expect(within(table).getAllByRole("row")).toHaveLength(docs.length + 1);
    await user.selectOptions(screen.getByLabelText("Show"), "pid");
    await waitFor(() => expect(within(table).getAllByRole("row")).toHaveLength(docs.filter((d) => d.kind === "pid").length + 1));
    expect(within(table).getByText(docs.find((d) => d.kind === "pid")!.number)).toBeInTheDocument();
  });
});

describe("related tab", () => {
  it("lists sister assets and links to comparing them, with this asset highlighted", async () => {
    const user = userEvent.setup();
    const related = probe().request("assets.related", { assetId: "CBC-GT-101" });
    const { router } = renderApp("/assets/CBC-GT-101/related");
    const sisters = await screen.findByRole("region", { name: /^Sister assets: / });
    for (const s of related.sisters.items) expect(within(sisters).getByRole("link", { name: s.name })).toBeInTheDocument();
    await user.click(within(sisters).getByRole("link", { name: "Compare with all of them" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/assets/compare"));
    expect(router.state.location.search).toMatchObject({ class: "gas_turbine", highlight: "CBC-GT-101" });
  });
});

describe("comments tab", () => {
  it("shows the discussion, newest first, with mentions in bold", async () => {
    const asset = discussedAsset();
    const comments = probe().request("assets.comments", { assetId: asset.assetId }).items;
    renderApp(`/assets/${asset.assetId}/comments`);
    const list = await screen.findByRole("region", { name: `Comments (${comments.length})` });
    const articles = within(list).getAllByRole("article");
    expect(articles).toHaveLength(comments.length);
    expect(articles[0]).toHaveTextContent(comments[0]!.body.slice(0, 30));
    expect(list.querySelectorAll("strong").length).toBeGreaterThan(0);
  });

  it("posts a comment that mentions someone picked from the list", async () => {
    const user = userEvent.setup();
    const asset = discussedAsset();
    const planner = probe().request("users.list", { role: "maintenance_planner", limit: 1 }).items[0]!;
    const { backend } = renderApp(`/assets/${asset.assetId}/comments`);
    await user.type(await screen.findByLabelText("Your comment"), "Seal is weeping again.");
    const picker = screen.getByLabelText("Mention someone") as HTMLSelectElement;
    await waitFor(() => expect(picker.options.length).toBeGreaterThan(1));
    await user.selectOptions(picker, planner.id);
    expect(screen.getByLabelText("Your comment")).toHaveValue(`Seal is weeping again. @${planner.name} `);
    await user.click(screen.getByRole("button", { name: "Post comment" }));

    await waitFor(() => {
      const first = backend.request("assets.comments", { assetId: asset.assetId }).items[0]!;
      expect(first.body).toBe(`Seal is weeping again. @${planner.name}`);
      expect(first.mentions).toEqual([planner.id]);
    });
    expect(await screen.findByText("Comment posted.")).toBeInTheDocument();
    expect(screen.getByLabelText("Your comment")).toHaveValue("");
  });

  it("keeps a half-written comment through a reload, and won't post while offline", async () => {
    const user = userEvent.setup();
    const first = renderApp("/assets/CBC-GT-101/comments");
    await user.type(await screen.findByLabelText("Your comment"), "Draft about the exhaust spread");
    first.transport.setDisconnected(true);
    await waitFor(() => expect(screen.getByRole("button", { name: "Post comment" })).toBeDisabled());

    first.unmount();
    renderApp("/assets/CBC-GT-101/comments");
    expect(await screen.findByLabelText("Your comment")).toHaveValue("Draft about the exhaust spread");
    expect(screen.getByText("We kept what you were writing.")).toBeInTheDocument();
  });

  it("asks for some text before posting", async () => {
    const user = userEvent.setup();
    renderApp("/assets/CBC-GT-101/comments");
    await user.click(await screen.findByRole("button", { name: "Post comment" }));
    expect(await screen.findByText("Write something first.")).toBeInTheDocument();
  });
});
