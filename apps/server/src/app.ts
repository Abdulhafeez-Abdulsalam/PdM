/**
 * The PdM server (Phase 5; ADR-0012, ADR-0013). It answers every endpoint in @pdm/contracts over
 * HTTP, at the method and path the contract gives (GET /api/assets/:assetId…), by running the
 * same plant simulation as demo mode. Requests are read back with the shared fromHttpRequest,
 * and the simulation checks every input and output against the contracts, exactly as in the
 * browser. Failures come back as the contract's ApiError with a matching HTTP status.
 *
 * Live values travel over one WebSocket per browser (GET /api/live): the browser says which
 * tags and alarms it wants, and the server pushes changes and the simulation status once a
 * second. Everyone shares one plant and one simulated clock, so two browsers see the same thing.
 *
 * For now one simulated plant serves everyone, and the browser says which demo role it's
 * playing in an X-Demo-Role header. Chunk 3 replaces that with sign-in and sessions, and the
 * server's own role checks.
 */
import {
  API_PREFIX,
  ClientMessage,
  HTTP_STATUS,
  LIVE_PATH,
  RoleId,
  SimulationControl,
  endpoints,
  fromHttpRequest,
  type ApiError,
  type EndpointName,
  type LiveFrame,
} from "@pdm/contracts";
import { ApiFailure, type MockBackend } from "@pdm/mock-data";
import websocket, { type WebSocket } from "@fastify/websocket";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";

export const DEMO_ROLE_HEADER = "x-demo-role";
/** The biggest message a browser may send: a full 300-tag subscription is about 10 KB. */
const MAX_LIVE_MESSAGE_BYTES = 64 * 1024;
/** A browser that has this much unsent data waiting is too slow to keep up: drop it, and it reconnects. */
const MAX_UNSENT_BYTES = 1024 * 1024;

export interface ServerOptions {
  backend: MockBackend;
  /** Log each request (on when running, off in tests). */
  logger?: boolean;
  /**
   * Move the plant on and push the status to every browser this often (LIVE_FLUSH_INTERVAL_MS
   * when running). Leave it out to tick by hand.
   */
  tickMs?: number;
}

export function buildServer({ backend, logger = false, tickMs }: ServerOptions): FastifyInstance {
  const app = Fastify({ logger });
  const sockets = new Set<WebSocket>();

  const sendFrame = (socket: WebSocket, frame: LiveFrame) => {
    if (socket.readyState !== socket.OPEN) return;
    if (socket.bufferedAmount > MAX_UNSENT_BYTES) {
      socket.terminate();
      return;
    }
    socket.send(JSON.stringify(frame));
  };
  /** Everyone sees the same clock, speed and storyline, so a change is news for every browser. */
  const broadcastStatus = () => {
    const frame: LiveFrame = { kind: "status", status: backend.status() };
    for (const socket of sockets) sendFrame(socket, frame);
  };
  if (tickMs !== undefined) {
    const timer = setInterval(() => {
      backend.tick();
      broadcastStatus();
    }, tickMs);
    app.addHook("onClose", async () => clearInterval(timer));
  }

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
    const status = backend.control(control.data);
    broadcastStatus();
    return status;
  });

  void app.register(websocket, { options: { maxPayload: MAX_LIVE_MESSAGE_BYTES } });
  void app.register(async (live) => {
    live.get(`${API_PREFIX}${LIVE_PATH}`, { websocket: true, preValidation: sameSiteOnly }, (socket, request) => {
      sockets.add(socket);
      const connection = backend.connect((message) => sendFrame(socket, { kind: "live", message }));
      sendFrame(socket, { kind: "status", status: backend.status() });

      socket.on("message", (data) => {
        let message;
        try {
          message = ClientMessage.safeParse(JSON.parse(String(data)));
        } catch {
          message = null;
        }
        if (!message?.success) {
          sendFrame(socket, { kind: "live", message: { type: "error", error: { code: "bad_request", message: "Not a live message" } } });
          return;
        }
        try {
          connection.handle(message.data);
        } catch (error) {
          // A bug: an uncaught error here would stop the whole server, so log it and carry on.
          request.log.error(error);
        }
      });
      socket.on("close", () => {
        sockets.delete(socket);
        connection.close();
      });
    });
  });
  app.get(`${API_PREFIX}/simulation/status`, async () => backend.status());
  app.get(`${API_PREFIX}/health`, async () => ({ ok: true }));

  // An unknown /api path is an ApiError too, so the browser always gets the same shape.
  app.setNotFoundHandler((request, reply) =>
    fail(reply, { code: "not_found", message: `No such endpoint: ${request.method} ${request.url.split("?")[0]}` }),
  );
  return app;
}

/**
 * Browsers let any web page open a WebSocket to any address, this computer's included, and send
 * this site's cookies with it. So a browser's connection must come from a page on this same site.
 * (Programs that aren't browsers send no Origin; chunk 3's sign-in covers those.)
 */
async function sameSiteOnly(request: FastifyRequest, reply: FastifyReply) {
  const origin = request.headers.origin;
  if (origin === undefined) return;
  let host: string | null = null;
  try {
    host = new URL(origin).host;
  } catch {
    // "null" or nonsense: not this site.
  }
  if (host !== request.headers.host) {
    return reply.status(403).send({ code: "bad_request", message: "Live connections are only for pages on this site" });
  }
}

/** A repeated query key arrives as a list; each value is one JSON document, so take the first. */
function firstValues(query: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(query).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
}
