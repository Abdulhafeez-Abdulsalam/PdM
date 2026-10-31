/**
 * The PdM server (Phase 5, chunk 1; ADR-0012). It answers every endpoint in @pdm/contracts over
 * HTTP, at the method and path the contract gives (GET /api/assets/:assetId…), by running the
 * same plant simulation as demo mode. Requests are read back with the shared fromHttpRequest,
 * and the simulation checks every input and output against the contracts, exactly as in the
 * browser. Failures come back as the contract's ApiError with a matching HTTP status.
 *
 * For now one simulated plant serves everyone, and the browser says which demo role it's
 * playing in an X-Demo-Role header. Chunk 3 replaces that with sign-in and sessions, and the
 * server's own role checks.
 */
import {
  API_PREFIX,
  HTTP_STATUS,
  RoleId,
  SimulationControl,
  endpoints,
  fromHttpRequest,
  type ApiError,
  type EndpointName,
} from "@pdm/contracts";
import { ApiFailure, type MockBackend } from "@pdm/mock-data";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";

export const DEMO_ROLE_HEADER = "x-demo-role";

export interface ServerOptions {
  backend: MockBackend;
  /** Log each request (on when running, off in tests). */
  logger?: boolean;
}

export function buildServer({ backend, logger = false }: ServerOptions): FastifyInstance {
  const app = Fastify({ logger });

  /** The demo role the browser is playing, if it said (chunk 1 only). */
  const applyDemoRole = (request: FastifyRequest) => {
    const role = RoleId.safeParse(request.headers[DEMO_ROLE_HEADER]);
    if (role.success) backend.control({ type: "set_role", role: role.data });
  };

  const fail = (reply: FastifyReply, error: ApiError) => reply.status(HTTP_STATUS[error.code]).send(error);

  for (const name of Object.keys(endpoints) as EndpointName[]) {
    const def = endpoints[name];
    app.route({
      method: def.method,
      url: `${API_PREFIX}${def.path}`,
      handler: async (request, reply) => {
        let input: unknown;
        try {
          input = fromHttpRequest(
            name,
            request.params as Record<string, string>,
            firstValues(request.query as Record<string, string | string[] | undefined>),
            request.body,
          );
        } catch (error) {
          return fail(reply, { code: "bad_request", message: (error as Error).message });
        }
        applyDemoRole(request);
        try {
          return backend.request(name, input as never);
        } catch (error) {
          if (error instanceof ApiFailure) return fail(reply, error.toApiError());
          // Anything else is a bug: the details go to the server's log, never to the browser.
          request.log.error(error);
          return fail(reply, { code: "internal", message: "Something went wrong on the server" });
        }
      },
    });
  }

  // The simulation panel's controls: speed, chaos mode, the storyline, the demo role.
  app.post(`${API_PREFIX}/simulation/control`, async (request, reply) => {
    const control = SimulationControl.safeParse(request.body);
    if (!control.success) return fail(reply, { code: "bad_request", message: "Not a simulation control" });
    return backend.control(control.data);
  });
  app.get(`${API_PREFIX}/simulation/status`, async () => backend.status());
  app.get(`${API_PREFIX}/health`, async () => ({ ok: true }));

  // An unknown /api path is an ApiError too, so the browser always gets the same shape.
  app.setNotFoundHandler((request, reply) =>
    fail(reply, { code: "not_found", message: `No such endpoint: ${request.method} ${request.url.split("?")[0]}` }),
  );
  return app;
}

/** A repeated query key arrives as a list; each value is one JSON document, so take the first. */
function firstValues(query: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(query).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
}
