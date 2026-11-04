/**
 * The notification centre (spec §5, §7): a bell in the top bar with the number unread, and a panel
 * of what needs this person's attention. Each item goes to the thing itself. The list is worked
 * out by the backend from the plant, so an alarm someone acknowledged stops being unread by itself.
 */
import { useApiMutation, useApiQuery, queryKey } from "@pdm/api-client";
import { NotificationKind, type Notification } from "@pdm/contracts";
import { Button, HealthBadge, Popover, cx } from "@pdm/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpCircle, Bell, BrainCircuit, ClipboardList, FileText, Siren } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { makeTimeFormatter } from "../../shared/format";
import { usePreferences } from "../../shared/preferences";
import { useSimNow } from "../../shared/sim-time";

const ICON = { alarm: Siren, escalation: ArrowUpCircle, work_order: ClipboardList, prediction: BrainCircuit, report: FileText } as const;
const SNOOZE_MS = 3_600_000;
const LIST = { unreadOnly: false, limit: 100 };

export function NotificationBell() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const list = useApiQuery("notifications.list", LIST, { refetchInterval: 15_000 });
  const unread = list.data?.unread ?? 0;

  return (
    <>
      {/* Always there, so a screen reader hears the number change. */}
      <span role="status" className="sr-only">
        {t("notifications.unread", { count: unread })}
      </span>
      <Popover
        open={open}
        onOpenChange={setOpen}
        align="end"
        className="w-[min(26rem,calc(100vw-1rem))]"
        trigger={
          <button
            type="button"
            className="relative rounded-md border border-line p-1.5 hover:bg-sunken"
            aria-label={t("notifications.open", { count: unread })}
          >
            <Bell aria-hidden className="size-4" />
            {unread > 0 && (
              <span
                aria-hidden
                className="absolute -top-1.5 -right-1.5 min-w-4 rounded-full bg-health-critical px-1 text-center text-[10px] leading-4 font-semibold text-canvas"
              >
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </button>
        }
      >
        <Panel items={list.data?.items ?? []} unread={unread} onClose={() => setOpen(false)} />
      </Popover>
    </>
  );
}

function Panel({ items, unread, onClose }: { items: readonly Notification[]; unread: number; onClose: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [kind, setKind] = useState<NotificationKind | "all">("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const shown = items.filter((n) => (kind === "all" || n.kind === kind) && (!unreadOnly || !n.read));
  const refresh = { onSuccess: () => client.invalidateQueries({ queryKey: queryKey("notifications.list", LIST) }) };
  const markRead = useApiMutation("notifications.markRead", refresh);

  return (
    <div className="flex max-h-[70vh] flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <h2 className="font-semibold">{t("notifications.title")}</h2>
        <Button size="sm" variant="ghost" disabled={unread === 0} onClick={() => markRead.mutate({})}>
          {t("notifications.markAll")}
        </Button>
      </header>
      <div role="group" aria-label={t("notifications.filter")} className="flex flex-wrap gap-1 border-b border-line px-3 py-2">
        {(["all", ...NotificationKind.options] as const).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            className={cx("rounded-md border px-2 py-0.5 text-xs", kind === k ? "border-accent text-fg" : "border-line text-fg-muted")}
          >
            {t(`notifications.kind.${k}`)}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1 text-xs text-fg-muted">
          <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
          {t("notifications.unreadOnly")}
        </label>
      </div>
      {shown.length === 0 ? (
        <p className="p-6 text-center text-sm text-fg-muted">{t("notifications.empty")}</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {shown.map((n) => (
            <Item key={n.id} notification={n} onClose={onClose} refresh={refresh} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Item({
  notification: n,
  onClose,
  refresh,
}: {
  notification: Notification;
  onClose: () => void;
  refresh: { onSuccess: () => Promise<void> };
}) {
  const { t } = useTranslation();
  const { now } = useSimNow();
  const tz = usePreferences((p) => p.timeZone);
  const format = useMemo(() => makeTimeFormatter(tz === "site" ? "utc" : tz), [tz]);
  const markRead = useApiMutation("notifications.markRead", refresh);
  const snooze = useApiMutation("notifications.snooze", refresh);
  const Icon = ICON[n.kind];
  const open = () => {
    if (!n.read) markRead.mutate({ ids: [n.id] });
    onClose();
  };
  const title = (
    <>
      {!n.read && <span className="sr-only">{t("notifications.unreadItem")}: </span>}
      <span className={cx("block text-sm", !n.read && "font-semibold")}>{n.title}</span>
      {n.detail && <span className="block text-xs text-fg-muted">{n.detail}</span>}
    </>
  );
  const link = "min-w-0 flex-1 hover:underline";

  return (
    <li className={cx("flex items-start gap-2 border-b border-line px-3 py-2 last:border-0", !n.read && "bg-sunken")}>
      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-muted" />
      <div className="min-w-0 flex-1">
        {n.kind === "report" ? (
          <Link
            to="/reports/$reportId"
            params={{ reportId: n.refId }}
            search={(prev) => ({ ...prev, scope: n.scopeId ?? undefined })}
            onClick={open}
            className={link}
          >
            {title}
          </Link>
        ) : n.kind === "alarm" || n.kind === "escalation" ? (
          <Link
            to="/assets/$assetId/$tab"
            params={{ assetId: n.assetId ?? "", tab: "alarms" }}
            search={(prev) => prev}
            onClick={open}
            className={link}
          >
            {title}
          </Link>
        ) : n.kind === "work_order" ? (
          <Link to="/maintenance/$workOrderId" params={{ workOrderId: n.refId }} onClick={open} className={link}>
            {title}
          </Link>
        ) : (
          <Link to="/predictive/$predictionId" params={{ predictionId: n.refId }} onClick={open} className={link}>
            {title}
          </Link>
        )}
        <span className="mt-0.5 flex items-center gap-2 text-xs text-fg-muted">
          {n.severity && <HealthBadge compact state={n.severity} label={t(`health.${n.severity}`)} />}
          {format(Date.parse(n.t))}
          <button
            type="button"
            className="ml-auto text-accent hover:underline"
            onClick={() => snooze.mutate({ id: n.id, until: new Date(now + SNOOZE_MS).toISOString() })}
          >
            {t("notifications.snooze")}
            <span className="sr-only">: {n.title}</span>
          </button>
        </span>
      </div>
    </li>
  );
}
