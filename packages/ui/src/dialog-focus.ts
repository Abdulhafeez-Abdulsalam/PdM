/**
 * Where keyboard focus goes when a dialog or sheet opens and closes. Radix only gives focus back
 * to its own trigger button, and ours open from code, so focus would be lost on closing: a
 * keyboard or screen-reader user would land at the top of the page. This remembers what had focus.
 *
 * On opening, focus goes to whatever inside is marked `data-autofocus`, else the first control.
 */
import { useRef } from "react";

export function useDialogFocus() {
  const opener = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: (e: Event) => {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const wanted = (e.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>("[data-autofocus]");
      if (wanted) {
        e.preventDefault();
        wanted.focus();
      }
    },
    onCloseAutoFocus: (e: Event) => {
      // Not if it has gone meanwhile: the row it was on may have left the list.
      if (opener.current?.isConnected) {
        e.preventDefault();
        opener.current.focus();
      }
    },
  };
}
