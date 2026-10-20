/**
 * Connects a Zod schema to React Hook Form: the same schema that describes the data also
 * validates the form. (A tiny version of @hookform/resolvers' zodResolver, written here
 * because that package currently has unresolvable optional peer dependencies.)
 *
 * Supports flat forms (no nested fields) — all ours are. Error messages are text-catalog
 * keys, e.g. "forms.reasonTooShort", translated where they're shown.
 */
import type { FieldErrors, FieldValues, Resolver } from "react-hook-form";
import type { z } from "zod";

export function zodResolver<S extends z.ZodType<FieldValues, FieldValues>>(schema: S): Resolver<z.input<S>, unknown, z.output<S>> {
  return async (values) => {
    const result = await schema.safeParseAsync(values);
    if (result.success) return { values: result.data, errors: {} };
    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of result.error.issues) {
      const field = String(issue.path[0] ?? "root");
      errors[field] ??= { type: issue.code, message: issue.message };
    }
    return { values: {}, errors: errors as FieldErrors<z.input<S>> };
  };
}
