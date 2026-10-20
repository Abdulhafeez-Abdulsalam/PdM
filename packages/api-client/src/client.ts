/**
 * Typed request function. Every response is checked against the contract before the UI
 * sees it (architecture §1, step 7) — a backend bug becomes a clear error, not a broken screen.
 */
import { endpoints, type EndpointDef, type EndpointInput, type EndpointName, type EndpointOutput } from "@pdm/contracts";
import { ApiRequestError, type Transport } from "./transport";

export interface ApiClient {
  request<N extends EndpointName>(name: N, input: EndpointInput<N>): Promise<EndpointOutput<N>>;
}

export function createApiClient(transport: Transport): ApiClient {
  return {
    async request(name, input) {
      const raw = await transport.request(name, input);
      const def: EndpointDef = endpoints[name];
      const result = def.output.safeParse(raw);
      if (!result.success) {
        throw new ApiRequestError({
          code: "internal",
          message: `Response from ${name} did not match the contract`,
          details: result.error.issues,
        });
      }
      return result.data as EndpointOutput<typeof name>;
    },
  };
}
