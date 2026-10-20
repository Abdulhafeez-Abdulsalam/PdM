/** Look up people's names by id (work orders store ids; screens show names). */
import { useApiQuery } from "@pdm/api-client";
import type { User } from "@pdm/contracts";
import { useMemo } from "react";

export function useUsers(): { byId: Map<string, User>; technicians: User[] } {
  const users = useApiQuery("users.list", { limit: 500 }, { staleTime: 5 * 60_000 });
  return useMemo(() => {
    const items = users.data?.items ?? [];
    return { byId: new Map(items.map((u) => [u.id, u])), technicians: items.filter((u) => u.role === "field_technician") };
  }, [users.data]);
}
