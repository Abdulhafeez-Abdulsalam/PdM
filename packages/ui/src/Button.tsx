import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}

const VARIANTS = {
  primary: "bg-accent text-accent-fg hover:opacity-90",
  secondary: "bg-surface text-fg border border-line hover:bg-sunken",
  ghost: "text-fg hover:bg-sunken",
  danger: "border border-health-critical text-health-critical hover:bg-sunken",
} as const;

/** One primary button per area. Danger only for destructive actions (design system, components). */
export function Button({ variant = "secondary", size = "md", className, type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "h-8 px-2.5 text-xs" : "h-10 px-4 text-sm",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    />
  );
}
