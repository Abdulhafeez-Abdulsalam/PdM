/**
 * Keeps what a technician has typed (ADR-0007, acceptance criterion D). While a form is open,
 * every change is copied to this tab's session storage, so a dropped connection, a failed
 * submit or a page reload never wipes it. It's removed once the server has accepted it.
 *
 * Closing the tab does lose it. That is deliberate: it's the line we drew instead of full
 * offline sync, which would need a database in the browser and conflict resolution.
 */
import { useEffect } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";

const PREFIX = "pdm-draft:";

// Storage can be unavailable (private mode, full, blocked); a draft is a convenience, so never crash over it.
export function readDraft<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeDraft(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // ignore: see above
  }
}

export function clearDraft(key: string): void {
  try {
    sessionStorage.removeItem(PREFIX + key);
  } catch {
    // ignore: see above
  }
}

/** Copies the form's values to the draft on every change. */
export function useKeepDraft<T extends FieldValues, U>(form: UseFormReturn<T, unknown, U>, key: string): void {
  useEffect(() => {
    const subscription = form.watch((values) => writeDraft(key, values));
    return () => subscription.unsubscribe();
  }, [form, key]);
}
