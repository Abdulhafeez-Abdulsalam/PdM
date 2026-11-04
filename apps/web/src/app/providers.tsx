/** App-wide wiring: data cache, API, theme, and keeping the backend's demo role in sync. */
import { ApiProvider, ApiRequestError, HttpTransport, useApiContext, useSimulationControl, type ApiContextValue } from "@pdm/api-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { usePreferences } from "../shared/preferences";

/** Errors that won't change if we ask again. */
const DEFINITE = new Set<string>(["not_found", "bad_request", "unauthenticated", "forbidden", "conflict", "too_many_tags", "rate_limited"]);

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

/**
 * Puts the chosen theme on <html data-theme="…">, which switches every design token. Printing
 * always uses the light theme: dark themes' light text would vanish on white paper.
 */
function ThemeSync() {
  const theme = usePreferences((p) => p.theme);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    const toLight = () => (root.dataset.theme = "light");
    const back = () => (root.dataset.theme = theme);
    window.addEventListener("beforeprint", toLight);
    window.addEventListener("afterprint", back);
    return () => {
      window.removeEventListener("beforeprint", toLight);
      window.removeEventListener("afterprint", back);
    };
  }, [theme]);
  return null;
}

/**
 * Demo mode: tells the mock backend which role is selected, so "me" and role-specific data match.
 * (On the server the role comes from who signed in, and it refuses to be told.)
 */
function RoleSync() {
  const role = usePreferences((p) => p.role);
  const { transport } = useApiContext();
  const control = useSimulationControl(); // also refreshes what was fetched as the previous role
  useEffect(() => {
    if (transport instanceof HttpTransport) return;
    void control({ type: "set_role", role });
  }, [transport, control, role]);
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
