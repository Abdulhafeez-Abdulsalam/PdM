/**
 * A small floating panel anchored to a trigger (Radix Popover underneath): handles focus,
 * Escape to close, click-outside, and screen-reader wiring for us.
 */
import * as RadixPopover from "@radix-ui/react-popover";
import type { ReactNode } from "react";
import { cx } from "./cx";

export interface PopoverProps {
  trigger: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "center" | "end";
  className?: string;
}

export function Popover({ trigger, children, open, onOpenChange, align = "start", className }: PopoverProps) {
  return (
    <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          align={align}
          sideOffset={6}
          collisionPadding={8}
          className={cx("z-50 rounded-lg border border-line bg-raised text-fg shadow-2 outline-none", className)}
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}

export const PopoverClose = RadixPopover.Close;
