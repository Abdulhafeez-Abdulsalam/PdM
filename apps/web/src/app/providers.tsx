/** App-wide wiring: data cache, API, theme, and keeping the backend's demo role in sync. */
import { ApiProvider, ApiRequestError, useApiContext, type ApiContextValue } from "@pdm/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { usePreferences } from "../shared/preferences";

/** Errors that won't change if we ask again. */
const DEFINITE = new Set<string>(["not_found", "bad_request", "conflict", "too_many_tags"]);

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000, // data younger than this is shown without refetching
        // Retry once for temporary problems; never for definite answers like "not found".
        retry: (failures, error) => failures < 1 && !(error instanceof ApiRequestError && DEFINITE.has(error.code)),
        refetchOnWindowFocus: false,
        // Our transport decides what "offline" means (ADR-0007), so don't let the cache pause on its own.
        networkMode: "always",
      },
      mutations: {
        // Never queue a submit to send later by itself: it fails, the form keeps its values,
        // and the person presses Submit again once back online (ADR-0007).
        networkMode: "always",
      },
    },
  });
}

/** Puts the chosen theme on <html data-theme="…">, which switches every design token. */
function ThemeSync() {
  const theme = usePreferences((p) => p.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  return null;
}

/** Tells the mock backend which role is selected, so "me" and role-specific data match. */
function RoleSync() {
  const role = usePreferences((p) => p.role);
  const { transport } = useApiContext();
  useEffect(() => {
    void transport.control({ type: "set_role", role });
  }, [transport, role]);
  return null;
}

export function Providers({ backend, children }: { backend: ApiContextValue; children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <ApiProvider value={backend}>
        <ThemeSync />
        <RoleSync />
        {children}
      </ApiProvider>
    </QueryClientProvider>
  );
}
