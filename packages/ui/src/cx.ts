/** Joins class names, skipping empty ones: cx("a", cond && "b") → "a b" or "a". */
export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}
