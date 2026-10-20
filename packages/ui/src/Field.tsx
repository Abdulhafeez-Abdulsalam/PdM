/**
 * A labelled form field with hint and error text, wired for screen readers
 * (aria-describedby / aria-invalid). Pass the input as children via a render function
 * so it receives the right id and aria attributes.
 */
import { useId, type ReactNode } from "react";

export interface FieldControlProps {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

export function Field({ label, hint, error, required, children }: {
  label: string;
  hint?: string;
  /** Already translated. */
  error?: string;
  required?: boolean;
  children: (props: FieldControlProps) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && <span aria-hidden className="ml-0.5 text-health-critical">*</span>}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint && <p id={hintId} className="text-xs text-fg-muted">{hint}</p>}
      {error && <p id={errorId} role="alert" className="text-xs text-health-critical">{error}</p>}
    </div>
  );
}

/** Shared look for text inputs, selects and textareas inside a Field. */
export const inputClass =
  "w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-fg aria-[invalid=true]:border-health-critical";
