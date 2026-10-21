/**
 * Load test for acceptance criterion E (ADR-0005): the live-data budget, 300 tags updating
 * once a second, all on one screen. Not in the menu; the end-to-end performance test opens
 * /diagnostics/live-load and measures how busy the browser gets.
 *
 * Each tile is the real LiveTagValue widget from Asset 360, so this measures the app's own
 * code, not a simplified copy.
 */
import { queryKey, useApiContext, useApiQuery } from "@pdm/api-client";
import { MAX_SUBSCRIBED_TAGS, type Tag } from "@pdm/contracts";
import { Button, Skeleton } from "@pdm/ui";
import { useQueries } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LiveTagValue } from "../telemetry/LiveTagValue";

export function LiveLoadPage() {
  const { t } = useTranslation();
  const { api } = useApiContext();
  const requested = Number((useSearch({ strict: false }) as { tags?: unknown }).tags ?? MAX_SUBSCRIBED_TAGS);
  const wanted = Math.min(MAX_SUBSCRIBED_TAGS, Math.max(1, Number.isFinite(requested) ? Math.round(requested) : MAX_SUBSCRIBED_TAGS));

  // Assets that are running (an offline asset sends no values), most tags first.
  const assets = useApiQuery("assets.list", { limit: 200 });
  const running = (assets.data?.items ?? []).filter((a) => a.health.state !== "offline");
  const tagLists = useQueries({
    queries: running.map((a) => ({
      queryKey: queryKey("assets.tags", { assetId: a.id }),
      queryFn: () => api.request("assets.tags", { assetId: a.id }),
    })),
  });
  const ready = assets.data !== undefined && tagLists.every((q) => q.data !== undefined);
  const tags: Tag[] = ready ? tagLists.flatMap((q) => q.data?.items ?? []).slice(0, wanted) : [];

  useEffect(() => {
    document.title = `${t("diagnostics.liveLoad.title")} · ${t("app.name")}`;
  }, [t]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("diagnostics.liveLoad.title")}</h1>
          <p className="text-fg-muted">{t("diagnostics.liveLoad.intro", { count: tags.length, max: MAX_SUBSCRIBED_TAGS })}</p>
        </div>
        <TapTest />
      </header>
      {!ready ? (
        <Skeleton className="h-96" />
      ) : (
        <ul
          aria-label={t("diagnostics.liveLoad.listLabel")}
          data-testid="live-load-grid"
          className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-2"
        >
          {tags.map((tag) => (
            // content-visibility: the browser skips drawing tiles that are scrolled out of view
            // (most of them), the recommended pattern for any screen with many live tiles (ADR-0005).
            <li
              key={tag.id}
              className="flex flex-col gap-0.5 rounded-md border border-line bg-surface p-2 text-xs [contain-intrinsic-size:auto_3.5rem] [content-visibility:auto]"
            >
              <span className="truncate font-mono text-fg-muted">{tag.id}</span>
              <LiveTagValue tag={tag} className="text-sm" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A button to tap while the values stream; the test measures how quickly the screen answers.
 * Its count lives here, not in the page, so a tap re-renders this button only, not 300 tiles
 * (the first version did, and the performance test measured the test instead of the app).
 */
function TapTest() {
  const { t } = useTranslation();
  const [taps, setTaps] = useState(0);
  return (
    <Button onClick={() => setTaps((n) => n + 1)}>
      {t("diagnostics.liveLoad.tap")} <output className="tabular-nums">{taps}</output>
    </Button>
  );
}
