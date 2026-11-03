/**
 * The alarm list (ISA-18.2). Used on the Alarms page and on each asset's Alarms tab.
 *
 * Keyboard: ↑/↓ move between rows; on a row, A = acknowledge, S = shelve, W = work order.
 * Action buttons only appear for roles allowed to use them (ADR-0008).
 *
 * Long lists are virtualised (Phase 6 chunk 2): only the rows in view, and a few either side, are
 * drawn. Every row shows "raised 3 min ago", so the whole list redraws every second; with every row
 * drawn, a 266-alarm list froze the page for up to ~100 ms each second, worse in a flood. The table
 * still tells screen readers how many rows there are and where each is (aria-rowcount/rowindex),
 * and ↑/↓ scroll a row into view before focusing it.
 */
import type { Alarm } from "@pdm/contracts";
import { Button, PriorityIcon, cx } from "@pdm/ui";
import { Link } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Archive, ArchiveRestore, Check, ClipboardPlus, Repeat, Timer } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { formatAgo, makeTimeFormatter } from "../../shared/format";
import { usePreferences } from "../../shared/preferences";
import { canDo } from "../../shared/roles/roles";
import { useSimNow } from "../../shared/sim-time";
import { formatMeasurement, toDisplay } from "../../shared/units";
import { CreateWorkOrderDialog } from "./CreateWorkOrderDialog";
import { ShelveDialog } from "./ShelveDialog";
import { useAlarmActions } from "./use-alarm-actions";

/** Active for longer than this = a "standing" alarm, a common alarm-management problem. */
const STANDING_AFTER_MS = 24 * 3_600_000;
const CHATTERING_COUNT = 5;

const ACTIVE = new Set(["active_unacked", "active_acked"]);
const NEEDS_ACK = new Set(["active_unacked", "rtn_unacked"]);

/** Up to this many rows the whole list is drawn (an asset's tab, a quiet plant); above it, only what's in view. */
const VIRTUALIZE_ABOVE = 60;
/** First guesses at row heights; each drawn row is then measured (badges can make a row taller). */
const ROW_ESTIMATE = 49;
const GROUP_ESTIMATE = 30;

/** What the table body shows, in order: alarms, and (when grouping) a heading before each asset's alarms. */
type Item = { kind: "group"; alarm: Alarm } | { kind: "alarm"; alarm: Alarm; index: number };
const keyOf = (item: Item) => (item.kind === "group" ? `g-${item.alarm.assetId}` : item.alarm.id);

interface Props {
  alarms: readonly Alarm[];
  caption: string;
  groupByAsset?: boolean;
  showAsset?: boolean;
}

export function AlarmTable({ alarms, caption, groupByAsset = false, showAsset = true }: Props) {
  const { t } = useTranslation();
  const role = usePreferences((p) => p.role);
  const tz = usePreferences((p) => p.timeZone);
  const units = usePreferences((p) => p.units);
  const { now } = useSimNow();
  const { acknowledge, unshelve } = useAlarmActions();
  const [shelveTarget, setShelveTarget] = useState<Alarm | null>(null);
  const [woTarget, setWoTarget] = useState<Alarm | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  const may = {
    ack: canDo(role, "alarm.acknowledge"),
    shelve: canDo(role, "alarm.shelve"),
    wo: canDo(role, "alarm.createWorkOrder"),
  };
  const anyAction = may.ack || may.shelve || may.wo;
  // Alarms don't carry their site's time zone, so "site local" falls back to UTC here.
  const absolute = useMemo(() => makeTimeFormatter(tz === "site" ? "utc" : tz), [tz]);

  const rows = useMemo(
    () => (groupByAsset ? [...alarms].sort((a, b) => a.assetId.localeCompare(b.assetId)) : [...alarms]),
    [alarms, groupByAsset],
  );
  // Group headings, worked out before drawing (React may draw more than once, so drawing
  // must not change variables): which rows start a new asset, and how many alarms each has.
  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    const starts = new Set<string>();
    rows.forEach((a, i) => {
      counts.set(a.assetId, (counts.get(a.assetId) ?? 0) + 1);
      if (rows[i - 1]?.assetId !== a.assetId) starts.add(a.id);
    });
    return { counts, starts };
  }, [rows]);
  const ackable = rows.filter((a) => NEEDS_ACK.has(a.state));
  const selectedAckable = ackable.filter((a) => selected.has(a.id));

  const items = useMemo(() => {
    const out: Item[] = [];
    rows.forEach((a, index) => {
      if (groupByAsset && groups.starts.has(a.id)) out.push({ kind: "group", alarm: a });
      out.push({ kind: "alarm", alarm: a, index });
    });
    return out;
  }, [rows, groups, groupByAsset]);
  const itemIndex = useMemo(() => new Map(items.map((item, k) => [keyOf(item), k])), [items]);

  // The page scrolls inside the app's <main>, not the window; the list starts some way down it
  // (filters, headings, the table's header), which the virtualiser must know to work out what's in view.
  // Only where the page can be measured: every browser can (ResizeObserver); the unit tests' jsdom
  // can't lay a page out at all, so there the whole list is drawn, as it always was.
  const virtual = items.length > VIRTUALIZE_ABOVE && typeof ResizeObserver !== "undefined";
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  // eslint-disable-next-line react-hooks/incompatible-library -- only matters with the React Compiler, which this app doesn't use
  const virtualizer = useVirtualizer({
    count: items.length,
    enabled: virtual,
    getScrollElement: () => tbodyRef.current?.closest("main") ?? null,
    estimateSize: (k) => (items[k]?.kind === "group" ? GROUP_ESTIMATE : ROW_ESTIMATE),
    getItemKey: (k) => keyOf(items[k]!),
    overscan: 8,
    scrollMargin,
    // Let React batch the redraws while scrolling, instead of one synchronous redraw per scroll
    // event: measured, fast scrolling's worst frame was about twice as long with them.
    useFlushSync: false,
    // Before anything is measured: draw enough rows for a typical screen.
    initialRect: { width: 1200, height: 900 },
  });
  useLayoutEffect(() => {
    const body = tbodyRef.current;
    const main = body?.closest("main");
    if (!virtual || !body || !main || typeof ResizeObserver === "undefined") return;
    // Measured whenever the page's layout changes (and once at the start, as observing begins).
    const observer = new ResizeObserver(() => {
      const margin = body.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop;
      setScrollMargin((old) => (Math.abs(old - margin) > 1 ? margin : old));
    });
    observer.observe(main);
    if (main.firstElementChild) observer.observe(main.firstElementChild);
    return () => observer.disconnect();
  }, [virtual]);

  // ↑/↓ to a row that isn't drawn yet: scroll it into view, then focus it once it's there.
  const pendingFocus = useRef<{ id: string; index: number } | null>(null);
  useEffect(() => {
    const pending = pendingFocus.current;
    const row = pending ? rowRefs.current.get(pending.id) : undefined;
    if (row) {
      pendingFocus.current = null;
      row.focus();
    }
  });

  const ack = (ids: string[]) => {
    if (ids.length === 0) return;
    acknowledge.mutate({ alarmIds: ids });
    setSelected(new Set());
  };

  const onRowKey = (e: KeyboardEvent<HTMLTableRowElement>, alarm: Alarm, index: number) => {
    if (e.target !== e.currentTarget) return; // a button inside the row has focus
    const move = (to: number) => {
      const next = rows[to];
      if (!next) return;
      const row = rowRefs.current.get(next.id);
      if (row) row.focus();
      else {
        pendingFocus.current = { id: next.id, index: to };
        virtualizer.scrollToIndex(itemIndex.get(next.id) ?? 0, { align: "auto" });
      }
    };
    // Count from the row on its way into view, if any: a quick second press still moves one further.
    const from = pendingFocus.current?.index ?? index;
    const key = e.key.toLowerCase();
    if (e.key === "ArrowDown") move(from + 1);
    else if (e.key === "ArrowUp") move(from - 1);
    else if (key === "a" && may.ack && NEEDS_ACK.has(alarm.state)) ack([alarm.id]);
    else if (key === "s" && may.shelve && alarm.state !== "shelved" && alarm.state !== "cleared") setShelveTarget(alarm);
    else if (key === "w" && may.wo && !alarm.workOrderId) setWoTarget(alarm);
    else return;
    e.preventDefault();
  };

  const columns = (anyAction ? 1 : 0) + (showAsset ? 1 : 0) + 6;

  // What to draw: every item, or (virtualised) those in view, with empty rows standing in for the rest.
  const measure = virtual ? virtualizer.measureElement : undefined;
  const inView = virtual ? virtualizer.getVirtualItems() : [];
  const drawn = virtual ? inView.map((v) => ({ item: items[v.index]!, k: v.index })) : items.map((item, k) => ({ item, k }));
  const spaceAbove = inView[0] ? inView[0].start - scrollMargin : 0;
  const lastInView = inView.at(-1);
  const spaceBelow = lastInView ? virtualizer.getTotalSize() - (lastInView.end - scrollMargin) : 0;
  const spacer = (key: string, height: number) =>
    height > 0 ? (
      <tr key={key} aria-hidden="true">
        <td colSpan={columns} className="p-0" style={{ height }} />
      </tr>
    ) : null;

  return (
    <>
      {may.ack && ackable.length > 0 && (
        <div className="mb-2 flex items-center gap-2 text-sm">
          <Button size="sm" variant="primary" disabled={selectedAckable.length === 0} onClick={() => ack(selectedAckable.map((a) => a.id))}>
            <Check aria-hidden className="size-4" />
            {t("alarmTable.ackSelected", { count: selectedAckable.length })}
          </Button>
          <span className="text-xs text-fg-muted">{t("alarmTable.keyboardHint")}</span>
        </div>
      )}
      <div className="relative -mx-4 overflow-x-auto">
        <table className="w-full min-w-[880px] text-sm" aria-rowcount={items.length + 1}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr aria-rowindex={1} className="border-b border-line text-left text-xs text-fg-muted">
              {anyAction && (
                <th scope="col" className="w-8 px-4 py-2">
                  {may.ack && (
                    <input
                      type="checkbox"
                      aria-label={t("alarmTable.selectAll")}
                      checked={ackable.length > 0 && selectedAckable.length === ackable.length}
                      onChange={(e) => setSelected(new Set(e.target.checked ? ackable.map((a) => a.id) : []))}
                    />
                  )}
                </th>
              )}
              <th scope="col" className={cx("py-2 pr-3 font-medium", !anyAction && "px-4")}>
                {t("alarmList.priority")}
              </th>
              {showAsset && (
                <th scope="col" className="py-2 font-medium">
                  {t("assets.col.asset")}
                </th>
              )}
              <th scope="col" className="py-2 font-medium">
                {t("alarmList.message")}
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                {t("alarmTable.value")}
              </th>
              <th scope="col" className="py-2 pl-4 font-medium">
                {t("alarmList.state")}
              </th>
              <th scope="col" className="py-2 font-medium">
                {t("alarmList.raised")}
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                <span className="sr-only">{t("alarmTable.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody ref={tbodyRef}>
            {spacer("space-above", spaceAbove)}
            {drawn.map(({ item, k }) => {
              const a = item.alarm;
              if (item.kind === "group")
                return (
                  <tr key={keyOf(item)} data-index={k} ref={measure} aria-rowindex={k + 2} className="bg-sunken">
                    <th colSpan={columns} scope="colgroup" className="px-4 py-1.5 text-left text-xs font-semibold">
                      {a.assetId} · {t("alarmTable.groupCount", { count: groups.counts.get(a.assetId) ?? 0 })}
                    </th>
                  </tr>
                );
              const i = item.index;
              const raised = Date.parse(a.raisedAt);
              const standing = ACTIVE.has(a.state) && now - raised > STANDING_AFTER_MS;
              const value = a.value !== null && a.quantity ? toDisplay(a.value, a.quantity, units) : null;
              const limit = a.limit !== null && a.quantity ? toDisplay(a.limit, a.quantity, units) : null;
              const unacked = NEEDS_ACK.has(a.state);
              return (
                <tr
                  key={a.id}
                  data-index={k}
                  aria-rowindex={k + 2}
                  ref={(el) => {
                    if (el) rowRefs.current.set(a.id, el);
                    else rowRefs.current.delete(a.id);
                    measure?.(el);
                  }}
                  tabIndex={0}
                  onKeyDown={(e) => onRowKey(e, a, i)}
                  aria-label={t("alarmTable.rowLabel", {
                    priority: t(`alarms.priority.${a.priority}`),
                    message: a.message,
                    asset: a.assetId,
                    state: t(`alarmList.states.${a.state}`),
                  })}
                  className={cx("border-b border-line last:border-0 hover:bg-sunken focus:bg-sunken", unacked && "font-semibold")}
                >
                  {anyAction && (
                    <td className="px-4 py-2">
                      {may.ack && unacked && (
                        <input
                          type="checkbox"
                          aria-label={t("alarmTable.select", { id: a.id })}
                          checked={selected.has(a.id)}
                          onChange={(e) => {
                            const next = new Set(selected);
                            if (e.target.checked) next.add(a.id);
                            else next.delete(a.id);
                            setSelected(next);
                          }}
                        />
                      )}
                    </td>
                  )}
                  <td className={cx("py-2 pr-3", !anyAction && "px-4")}>
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      <PriorityIcon priority={a.priority} />
                      {a.priority.toUpperCase()}
                    </span>
                  </td>
                  {showAsset && (
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <Link
                        to="/assets/$assetId/$tab"
                        params={{ assetId: a.assetId, tab: "alarms" }}
                        search={(prev) => prev}
                        className="font-mono text-xs font-normal hover:underline"
                      >
                        {a.assetId}
                      </Link>
                    </td>
                  )}
                  <td className="py-2 pr-3">
                    {a.message}
                    <span className="mt-0.5 flex flex-wrap gap-1 font-normal">
                      {a.occurrenceCount > CHATTERING_COUNT && (
                        <Badge icon={<Repeat aria-hidden className="size-3" />}>
                          {t("alarmTable.chattering", { count: a.occurrenceCount })}
                        </Badge>
                      )}
                      {standing && <Badge icon={<Timer aria-hidden className="size-3" />}>{t("alarmTable.standing")}</Badge>}
                      {a.workOrderId && (
                        <Badge icon={<ClipboardPlus aria-hidden className="size-3" />}>{t("alarmTable.hasWorkOrder")}</Badge>
                      )}
                      {a.state === "shelved" && a.shelve && (
                        <Badge icon={<Archive aria-hidden className="size-3" />}>
                          {t("alarmTable.shelvedUntil", { ago: formatAgo(Date.parse(a.shelve.until), now) })}
                        </Badge>
                      )}
                    </span>
                  </td>
                  <td className="py-2 text-right font-normal whitespace-nowrap tabular-nums">
                    {value ? (
                      <>
                        {formatMeasurement(value.value)}
                        {limit && <span className="text-fg-muted"> / {formatMeasurement(limit.value)}</span>}{" "}
                        <span className="text-fg-muted">{t(`unitSymbol.${value.unit}`)}</span>
                      </>
                    ) : (
                      <span className="text-fg-muted">—</span>
                    )}
                  </td>
                  <td className="py-2 pl-4 font-normal">{t(`alarmList.states.${a.state}`)}</td>
                  <td className="py-2 font-normal whitespace-nowrap" title={absolute(raised)}>
                    {formatAgo(raised, now)}
                  </td>
                  <td className="px-4 py-2">
                    <span className="flex justify-end gap-1">
                      {may.ack && unacked && (
                        <Button size="sm" onClick={() => ack([a.id])} aria-label={t("alarmTable.ackOne", { id: a.id })}>
                          <Check aria-hidden className="size-4" />
                        </Button>
                      )}
                      {may.shelve && a.state === "shelved" && (
                        <Button
                          size="sm"
                          onClick={() => unshelve.mutate({ alarmId: a.id })}
                          aria-label={t("alarmTable.unshelveOne", { id: a.id })}
                        >
                          <ArchiveRestore aria-hidden className="size-4" />
                        </Button>
                      )}
                      {may.shelve && a.state !== "shelved" && a.state !== "cleared" && (
                        <Button size="sm" onClick={() => setShelveTarget(a)} aria-label={t("alarmTable.shelveOne", { id: a.id })}>
                          <Archive aria-hidden className="size-4" />
                        </Button>
                      )}
                      {may.wo && !a.workOrderId && (
                        <Button size="sm" onClick={() => setWoTarget(a)} aria-label={t("alarmTable.woOne", { id: a.id })}>
                          <ClipboardPlus aria-hidden className="size-4" />
                        </Button>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
            {spacer("space-below", spaceBelow)}
          </tbody>
        </table>
      </div>
      <ShelveDialog alarm={shelveTarget} onClose={() => setShelveTarget(null)} />
      <CreateWorkOrderDialog target={woTarget && { kind: "alarm", alarm: woTarget }} onClose={() => setWoTarget(null)} />
    </>
  );
}

function Badge({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-line px-1 text-[11px] leading-4 text-fg-muted">
      {icon}
      {children}
    </span>
  );
}
