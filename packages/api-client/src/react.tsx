/**
 * React hooks over the API client. Screens use these and never touch the transport.
 *
 *   const { data, isPending, error } = useApiQuery("risks.top", { limit: 5 });
 *
 * TanStack Query handles caching, loading/error states and refetching; the query key is
 * [endpoint name, input], so the same request from two components is fetched once.
 */
import type {
  AlarmSummary,
  EndpointInput,
  EndpointName,
  EndpointOutput,
  LiveValue,
  SimulationControl,
  SimulationStatus,
} from "@pdm/contracts";
import { useMutation, useQuery, useQueryClient, type UseMutationOptions, type UseQueryOptions } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { ApiClient } from "./client";
import type { LiveClient } from "./live";
import type { ConnectionState, Transport } from "./transport";

export interface ApiContextValue {
  api: ApiClient;
  live: LiveClient;
  transport: Transport;
}

const ApiContext = createContext<ApiContextValue | null>(null);

export function ApiProvider({ value, children }: { value: ApiContextValue; children: ReactNode }) {
  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}

export function useApiContext(): ApiContextValue {
  const ctx = useContext(ApiContext);
  if (!ctx) throw new Error("useApiContext must be used inside <ApiProvider>");
  return ctx;
}

export const queryKey = <N extends EndpointName>(name: N, input: EndpointInput<N>) => [name, input] as const;

// ─── Requests ────────────────────────────────────────────────────────────────

export function useApiQuery<N extends EndpointName>(
  name: N,
  input: EndpointInput<N>,
  options?: Omit<UseQueryOptions<EndpointOutput<N>, Error, EndpointOutput<N>, readonly [N, EndpointInput<N>]>, "queryKey" | "queryFn">,
) {
  const { api } = useApiContext();
  return useQuery({
    queryKey: queryKey(name, input),
    queryFn: () => api.request(name, input),
    ...options,
  });
}

export function useApiMutation<N extends EndpointName>(
  name: N,
  options?: Omit<UseMutationOptions<EndpointOutput<N>, Error, EndpointInput<N>>, "mutationFn">,
) {
  const { api } = useApiContext();
  return useMutation({ mutationFn: (input: EndpointInput<N>) => api.request(name, input), ...options });
}

// ─── Live data ───────────────────────────────────────────────────────────────

/** The latest live value of one tag, or undefined until the first one arrives. Subscribes while mounted. */
export function useLiveValue(tagId: string | null): LiveValue | undefined {
  const { live } = useApiContext();
  useEffect(() => (tagId ? live.subscribeTags([tagId]) : undefined), [live, tagId]);
  const subscribe = useCallback((cb: () => void) => (tagId ? live.listenTag(tagId, cb) : () => {}), [live, tagId]);
  return useSyncExternalStore(subscribe, () => (tagId ? live.getValue(tagId) : undefined));
}

/** Alarm bar counts for a scope: fetched once, then kept fresh by live alarm_summary messages. */
export function useAlarmSummary(scopeId: string) {
  const { live } = useApiContext();
  const client = useQueryClient();
  const query = useApiQuery("alarms.summary", { scopeId });

  useEffect(() => {
    const stopWatching = live.watchAlarms(scopeId);
    const offSummary = live.onAlarmSummary((summary: AlarmSummary) => {
      if (summary.scopeId === scopeId) client.setQueryData(queryKey("alarms.summary", { scopeId }), summary);
    });
    // Any alarm change makes cached alarm lists out of date.
    const offChanged = live.onAlarmsChanged(() => client.invalidateQueries({ queryKey: ["alarms.list"] }));
    return () => {
      stopWatching();
      offSummary();
      offChanged();
    };
  }, [live, client, scopeId]);

  return query;
}

// ─── Connection & simulation ─────────────────────────────────────────────────

export function useConnectionState(): ConnectionState {
  const { transport } = useApiContext();
  const [state, setState] = useState<ConnectionState>("connecting");
  useEffect(() => transport.onConnection(setState), [transport]);
  return state;
}

/** Demo-mode simulation status (sim time, speed, chaos, storyline), updated every second. */
export function useSimulationStatus(): SimulationStatus | null {
  const { transport } = useApiContext();
  const [status, setStatus] = useState<SimulationStatus | null>(null);
  useEffect(() => transport.onStatus(setStatus), [transport]);
  return status;
}

/** Send a demo control. Data changes afterwards (new role, storyline), so cached queries are refreshed. */
export function useSimulationControl() {
  const { transport } = useApiContext();
  const client = useQueryClient();
  return useCallback(
    async (control: SimulationControl) => {
      const status = await transport.control(control);
      await client.invalidateQueries();
      return status;
    },
    [transport, client],
  );
}
