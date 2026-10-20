/**
 * Short confirmation messages in the corner ("WO-10482 created"), announced to screen
 * readers. Errors that need a decision use a dialog instead (design system §9).
 */
import { cx } from "@pdm/ui";
import { CircleAlert, CircleCheck, X } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { create } from "zustand";

export interface Toast {
  id: number;
  tone: "success" | "error";
  message: string;
}

interface ToastStore {
  toasts: Toast[];
  show: (tone: Toast["tone"], message: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastStore>((set) => ({
  toasts: [],
  show: (tone, message) => set((s) => ({ toasts: [...s.toasts.slice(-3), { id: nextId++, tone, message }] })),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

const AUTO_DISMISS_MS = 7000;

function ToastItem({ toast }: { toast: Toast }) {
  const { t } = useTranslation();
  const dismiss = useToasts((s) => s.dismiss);
  useEffect(() => {
    const id = setTimeout(() => dismiss(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [toast.id, dismiss]);
  const Icon = toast.tone === "success" ? CircleCheck : CircleAlert;
  return (
    <li className="flex items-start gap-2 rounded-lg border border-line bg-raised p-3 text-sm shadow-2">
      <Icon aria-hidden className={cx("mt-0.5 size-4 shrink-0", toast.tone === "success" ? "text-health-healthy" : "text-health-critical")} />
      <span className="flex-1">{toast.message}</span>
      <button type="button" onClick={() => dismiss(toast.id)} aria-label={t("toast.dismiss")} className="rounded p-0.5 hover:bg-sunken">
        <X aria-hidden className="size-4" />
      </button>
    </li>
  );
}

/** Mounted once, in the app shell. */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <ol aria-live="polite" role="status" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 [&>li]:pointer-events-auto">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </ol>
  );
}
