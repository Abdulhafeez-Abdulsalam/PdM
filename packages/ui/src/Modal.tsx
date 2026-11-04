/**
 * A centred dialog for decisions that block work (design system: Dialog). Radix underneath:
 * focus is trapped inside, Escape closes, focus returns to the button that opened it.
 */
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./cx";
import { useDialogFocus } from "./dialog-focus";

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  closeLabel: string;
  children: ReactNode;
  className?: string;
}

export function Modal({ open, onOpenChange, title, description, closeLabel, children, className }: ModalProps) {
  const focus = useDialogFocus();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-scrim" />
        <Dialog.Content
          {...focus}
          className={cx(
            "fixed top-1/2 left-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-line bg-surface text-fg shadow-2 outline-none",
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
