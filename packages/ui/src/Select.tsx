import { useId, type SelectHTMLAttributes } from "react";
import { cx } from "./cx";

export interface SelectOption<V extends string> {
  value: V;
  label: string;
}

export interface SelectProps<V extends string> extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value"> {
  /** Accessible label. Shown visually unless `hideLabel`. */
  label: string;
  hideLabel?: boolean;
  value: V;
  options: readonly SelectOption<V>[];
  onChange: (value: V) => void;
}

/**
 * A styled native <select>. Native selects are keyboard- and screen-reader-friendly
 * for free, and work well with touch — the right default for short option lists.
 */
export function Select<V extends string>({ label, hideLabel, value, options, onChange, className, ...rest }: SelectProps<V>) {
  const id = useId();
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-2">
      <label htmlFor={id} className={hideLabel ? "sr-only" : "shrink-0 text-xs text-fg-muted"}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as V)}
        className={cx("h-8 max-w-full min-w-0 rounded-md border border-line bg-surface px-2 text-sm text-fg", className)}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}
