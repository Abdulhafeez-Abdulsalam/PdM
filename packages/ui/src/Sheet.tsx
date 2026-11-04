/**
 * A panel that slides in from the right over the page (Radix Dialog underneath):
 * traps focus inside, Escape closes, focus returns to what opened it.
 * Used for quick details without leaving the page — e.g. the prediction panel.
 */
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./cx";
import { useDialogFocus } from "./dialog-focus";

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Translated label for the close button. */
  closeLabel: string;
  children: ReactNode;
  className?: string;
}

export function Sheet({ open, onOpenChange, title, description, closeLabel, children, className }: SheetProps) {
  const focus = useDialogFocus();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-scrim" />
        <Dialog.Content
          {...focus}
          className={cx(
            "fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-line bg-surface text-fg shadow-2 outline-none",
            className,
          )}
        >
          <header className="flex items-start gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
              {description && <Dialog.Description className="text-sm text-fg-muted">{description}</Dialog.Description>}
            </div>
            <Dialog.Close className="rounded-md p-1.5 hover:bg-sunken" aria-label={closeLabel}>
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
