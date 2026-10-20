/**
 * The alarm list (ISA-18.2). Used on the Alarms page and on each asset's Alarms tab.
 *
 * Keyboard: ↑/↓ move between rows; on a row, A = acknowledge, S = shelve, W = work order.
 * Action buttons only appear for roles allowed to use them (ADR-0008).
 */
import type { Alarm } from "@pdm/contracts";
import { Button, PriorityIcon, cx } from "@pdm/ui";
import { Link } from "@tanstack/react-router";
import { Archive, ArchiveRestore, Check, ClipboardPlus, Repeat, Timer } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
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

  const rows = useMemo(() => (groupByAsset ? [...alarms].sort((a, b) => a.assetId.localeCompare(b.assetId)) : [...alarms]), [alarms, groupByAsset]);
  const ackable = rows.filter((a) => NEEDS_ACK.has(a.state));
  const selectedAckable = ackable.filter((a) => selected.has(a.id));

  const ack = (ids: string[]) => {
    if (ids.length === 0) return;
    acknowledge.mutate({ alarmIds: ids });
    setSelected(new Set());
  };

  const onRowKey = (e: KeyboardEvent<HTMLTableRowElement>, alarm: Alarm, index: number) => {
    if (e.target !== e.currentTarget) return; // a button inside the row has focus
    const move = (to: number) => {
      const next = rows[to];
      if (next) rowRefs.current.get(next.id)?.focus();
    };
    const key = e.key.toLowerCase();
    if (e.key === "ArrowDown") move(index + 1);
    else if (e.key === "ArrowUp") move(index - 1);
    else if (key === "a" && may.ack && NEEDS_ACK.has(alarm.state)) ack([alarm.id]);
    else if (key === "s" && may.shelve && alarm.state !== "shelved" && alarm.state !== "cleared") setShelveTarget(alarm);
    else if (key === "w" && may.wo && !alarm.workOrderId) setWoTarget(alarm);
    else return;
    e.preventDefault();
  };

  const columns = (anyAction ? 1 : 0) + (showAsset ? 1 : 0) + 6;
  let lastAsset: string | null = null;

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
      <div className="-mx-4 overflow-x-auto">
        <table className="w-full min-w-[880px] text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-fg-muted">
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
              <th scope="col" className={cx("py-2 pr-3 font-medium", !anyAction && "px-4")}>{t("alarmList.priority")}</th>
              {showAsset && <th scope="col" className="py-2 font-medium">{t("assets.col.asset")}</th>}
              <th scope="col" className="py-2 font-medium">{t("alarmList.message")}</th>
              <th scope="col" className="py-2 text-right font-medium">{t("alarmTable.value")}</th>
              <th scope="col" className="py-2 pl-4 font-medium">{t("alarmList.state")}</th>
              <th scope="col" className="py-2 font-medium">{t("alarmList.raised")}</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                <span className="sr-only">{t("alarmTable.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a, i) => {
              const groupHeader =
                groupByAsset && a.assetId !== lastAsset ? (
                  <tr key={`g-${a.assetId}`} className="bg-sunken">
                    <th colSpan={columns} scope="colgroup" className="px-4 py-1.5 text-left text-xs font-semibold">
                      {a.assetId} · {t("alarmTable.groupCount", { count: rows.filter((r) => r.assetId === a.assetId).length })}
                    </th>
                  </tr>
                ) : null;
              lastAsset = a.assetId;
              const raised = Date.parse(a.raisedAt);
              const standing = ACTIVE.has(a.state) && now - raised > STANDING_AFTER_MS;
              const value = a.value !== null && a.quantity ? toDisplay(a.value, a.quantity, units) : null;
              const limit = a.limit !== null && a.quantity ? toDisplay(a.limit, a.quantity, units) : null;
              const unacked = NEEDS_ACK.has(a.state);
              return [
                groupHeader,
                <tr
                  key={a.id}
                  ref={(el) => {
                    if (el) rowRefs.current.set(a.id, el);
                    else rowRefs.current.delete(a.id);
                  }}
                  tabIndex={0}
                  onKeyDown={(e) => onRowKey(e, a, i)}
                  aria-label={t("alarmTable.rowLabel", { priority: t(`alarms.priority.${a.priority}`), message: a.message, asset: a.assetId, state: t(`alarmList.states.${a.state}`) })}
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
                    <td className="whitespace-nowrap py-2 pr-3">
                      <Link to="/assets/$assetId/$tab" params={{ assetId: a.assetId, tab: "alarms" }} search={(prev) => prev} className="font-mono text-xs font-normal hover:underline">
                        {a.assetId}
                      </Link>
                    </td>
                  )}
                  <td className="py-2 pr-3">
                    {a.message}
                    <span className="mt-0.5 flex flex-wrap gap-1 font-normal">
                      {a.occurrenceCount > CHATTERING_COUNT && (
                        <Badge icon={<Repeat aria-hidden className="size-3" />}>{t("alarmTable.chattering", { count: a.occurrenceCount })}</Badge>
                      )}
                      {standing && <Badge icon={<Timer aria-hidden className="size-3" />}>{t("alarmTable.standing")}</Badge>}
                      {a.workOrderId && <Badge icon={<ClipboardPlus aria-hidden className="size-3" />}>{t("alarmTable.hasWorkOrder")}</Badge>}
                      {a.state === "shelved" && a.shelve && <Badge icon={<Archive aria-hidden className="size-3" />}>{t("alarmTable.shelvedUntil", { ago: formatAgo(Date.parse(a.shelve.until), now) })}</Badge>}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-2 text-right font-normal tabular-nums">
                    {value ? (
                      <>
                        {formatMeasurement(value.value)}
                        {limit && <span className="text-fg-muted"> / {formatMeasurement(limit.value)}</span>} <span className="text-fg-muted">{t(`unitSymbol.${value.unit}`)}</span>
                      </>
                    ) : (
                      <span className="text-fg-muted">—</span>
                    )}
                  </td>
                  <td className="py-2 pl-4 font-normal">{t(`alarmList.states.${a.state}`)}</td>
                  <td className="whitespace-nowrap py-2 font-normal" title={absolute(raised)}>
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
                        <Button size="sm" onClick={() => unshelve.mutate({ alarmId: a.id })} aria-label={t("alarmTable.unshelveOne", { id: a.id })}>
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
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
      <ShelveDialog alarm={shelveTarget} onClose={() => setShelveTarget(null)} />
      <CreateWorkOrderDialog alarm={woTarget} onClose={() => setWoTarget(null)} />
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
