/** App-wide wiring: data cache, API, theme, and keeping the backend's demo role in sync. */
import { ApiProvider, useApiContext, type ApiContextValue } from "@pdm/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { usePreferences } from "../shared/preferences";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000, // data younger than this is shown without refetching
        retry: 1,
        refetchOnWindowFocus: false,
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
