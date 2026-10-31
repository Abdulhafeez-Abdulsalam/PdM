/**
 * The PdM server (Phase 5; ADR-0012, ADR-0013, ADR-0014). It answers every endpoint in
 * @pdm/contracts over HTTP, at the method and path the contract gives (GET /api/assets/:assetId…),
 * by running the same plant simulation as demo mode. Requests are read back with the shared
 * fromHttpRequest, and the simulation checks every input and output against the contracts, exactly
 * as in the browser. Failures come back as the contract's ApiError with a matching HTTP status.
 *
 * Live values travel over one WebSocket per browser (GET /api/live): the browser says which
 * tags and alarms it wants, and the server pushes changes and the simulation status once a
 * second. Everyone shares one plant and one simulated clock, so two browsers see the same thing.
 *
 * Everything except the sign-in page needs a session (a cookie, see sessions.ts), and every
 * request is checked against the signed-in person's role with the same rules the screens use
 * (contracts/src/access.ts): not signed in → 401, not allowed → 403.
 */
import {
  API_PREFIX,
  ClientMessage,
  HTTP_STATUS,
  LIVE_CLOSE_SIGNED_OUT,
  LIVE_PATH,
  SESSION_PATH,
  SignInRequest,
  SimulationControl,
  aiToolsFor,
  endpoints,
  fromHttpRequest,
  mayRequest,
  type AccessLookups,
  type ApiError,
  type EndpointName,
  type LiveFrame,
  type SessionInfo,
  type User,
} from "@pdm/contracts";
import { ApiFailure, type MockBackend } from "@pdm/mock-data";
import cookie from "@fastify/cookie";
import websocket, { type WebSocket } from "@fastify/websocket";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "./db";
import { PlantStore } from "./plant";
import { SESSION_COOKIE, SessionStore, type Session } from "./sessions";

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
  /** Where changes and sessions are kept (ADR-0015). Default: a database that lives only in memory. */
  db?: DatabaseSync;
  /** Tests pass one with a clock they control. */
  sessions?: SessionStore;
}

export function buildServer({ backend, logger = false, tickMs, db = openDatabase(":memory:"), sessions }: ServerOptions): FastifyInstance {
  const app = Fastify({ logger });
  sessions ??= new SessionStore(db);
  const plant = new PlantStore(db);
  /** Who moved a simulation control, while it's being moved (the change itself doesn't say). */
  let controlledBy: string | null = null;
  // Every change goes into the command log as it happens, so a restart can make it again.
  backend.onCommand = (entry) => plant.append(entry, controlledBy);
  /** Every open live connection, and the session it belongs to. */
  const sockets = new Map<WebSocket, string>();

  const fail = (reply: FastifyReply, error: ApiError) => reply.status(HTTP_STATUS[error.code]).send(error);
  const signInFirst = (reply: FastifyReply) => fail(reply, { code: "unauthenticated", message: "Sign in first" });

  /** Who sent this request: their session and their current record (a role change applies at once). */
  const signedIn = (request: FastifyRequest): { session: Session; user: User } | null => {
    const session = sessions.use(request.cookies[SESSION_COOKIE]);
    const user = session && backend.world.users.find((u) => u.id === session.userId);
    return session && user ? { session, user } : null;
  };

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
    for (const socket of sockets.keys()) sendFrame(socket, frame);
  };
  /** Close the live connections of sessions that have ended or gone idle. */
  const closeSignedOut = () => {
    for (const [socket, token] of sockets) if (!sessions.peek(token)) socket.close(LIVE_CLOSE_SIGNED_OUT, "Signed out");
  };
  if (tickMs !== undefined) {
    let ticks = 0;
    const timer = setInterval(() => {
      backend.tick();
      // Where the clock has got to, every 10 ticks: a crash sets it back at most that far.
      if (++ticks % 10 === 0) plant.saveClock(backend.now());
      broadcastStatus();
      closeSignedOut();
    }, tickMs);
    app.addHook("onClose", async () => clearInterval(timer));
  }

  void app.register(cookie);
  // Changes must come as JSON. A plain-text POST is something a page on another site can send
  // without asking first; JSON makes the browser ask (and this server never says yes).
  app.removeContentTypeParser("text/plain");
  // And a change sent by a browser must come from a page on this site.
  app.addHook("onRequest", async (request, reply) => {
    if (request.method !== "GET" && request.method !== "HEAD") return sameSiteOnly(request, reply);
  });

  // ─── Sign-in ───────────────────────────────────────────────────────────────

  const session = `${API_PREFIX}${SESSION_PATH}`;
  // The people to choose from: the one thing open to everyone, since it IS the sign-in page.
  app.get(`${session}/people`, async () => backend.world.users);
  app.get(session, async (request, reply) => {
    const who = signedIn(request);
    return who ? ({ user: who.user } satisfies SessionInfo) : signInFirst(reply);
  });
  app.post(session, async (request, reply) => {
    const body = SignInRequest.safeParse(request.body);
    if (!body.success) return fail(reply, { code: "bad_request", message: "Say who is signing in" });
    const user = backend.world.users.find((u) => u.id === body.data.userId);
    if (!user) return fail(reply, { code: "not_found", message: `No such person: ${body.data.userId}` });
    // A fresh token at every sign-in, and the old one ends: a token someone saw earlier is worthless.
    sessions.end(request.cookies[SESSION_COOKIE]);
    const created = sessions.create(user.id);
    void reply.setCookie(SESSION_COOKIE, created.token, { httpOnly: true, sameSite: "strict", path: "/" });
    return { user } satisfies SessionInfo;
  });
  app.post(`${session}/end`, async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    sessions.end(token);
    for (const [socket, owner] of sockets) if (owner === token) socket.close(LIVE_CLOSE_SIGNED_OUT, "Signed out");
    void reply.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  });

  // ─── The plant's endpoints ─────────────────────────────────────────────────

  const lookups: AccessLookups = {
    workOrderStatus: (workOrderId) => {
      try {
        return backend.request("workOrders.get", { workOrderId }).status;
      } catch {
        return null;
      }
    },
  };

  for (const name of Object.keys(endpoints) as EndpointName[]) {
    const def = endpoints[name];
    app.route({
      method: def.method,
      url: `${API_PREFIX}${def.path}`,
      handler: async (request, reply) => {
        const who = signedIn(request);
        if (!who) return signInFirst(reply);
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
        // Checked against the role here; an input that isn't valid is refused by the simulation
        // below (400) before it changes anything.
        const checked = def.input.safeParse(input);
        if (checked.success && !mayRequest(who.user.role, name, checked.data as never, lookups)) {
          return fail(reply, { code: "forbidden", message: `${who.user.title} can't do that (${who.user.name})` });
        }
        try {
          // Awaited here, so a failure from the AI provider is caught below like any other.
          return await backend.requestAsync(name, input as never, who.user.id);
        } catch (error) {
          if (error instanceof ApiFailure) return fail(reply, error.toApiError());
          // Anything else is a bug: the details go to the server's log, never to the browser.
          request.log.error(error);
          return fail(reply, { code: "internal", message: "Something went wrong on the server" });
        }
      },
    });
  }

  // ─── Simulation and live values ────────────────────────────────────────────

  // The simulation panel's controls: speed, chaos mode, the storyline. One plant for everyone.
  app.post(`${API_PREFIX}/simulation/control`, async (request, reply) => {
    const who = signedIn(request);
    if (!who) return signInFirst(reply);
    const control = SimulationControl.safeParse(request.body);
    if (!control.success) return fail(reply, { code: "bad_request", message: "Not a simulation control" });
    if (control.data.type === "set_role") {
      return fail(reply, { code: "forbidden", message: "Your role comes from who you signed in as" });
    }
    controlledBy = who.user.id;
    let status;
    try {
      status = backend.control(control.data);
    } finally {
      controlledBy = null;
    }
    broadcastStatus();
    return status;
  });
  app.get(`${API_PREFIX}/simulation/status`, async (request, reply) => (signedIn(request) ? backend.status() : signInFirst(reply)));

  void app.register(websocket, { options: { maxPayload: MAX_LIVE_MESSAGE_BYTES } });
  void app.register(async (live) => {
    live.get(`${API_PREFIX}${LIVE_PATH}`, { websocket: true, preValidation: sameSiteOnly }, (socket, request) => {
      const who = signedIn(request);
      if (!who) {
        // Said with a close code the browser can read, so it knows to show the sign-in page.
        socket.close(LIVE_CLOSE_SIGNED_OUT, "Sign in first");
        return;
      }
      sockets.set(socket, who.session.token);
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
  // The tools an AI model would be given for the signed-in person (ADR-0016): look before trusting.
  app.get(`${API_PREFIX}/ai/tools`, async (request, reply) => {
    const who = signedIn(request);
    if (!who) return signInFirst(reply);
    return { provider: backend.ai.name, role: who.user.role, tools: aiToolsFor(who.user.role) };
  });
  app.get(`${API_PREFIX}/health`, async () => ({ ok: true }));

  // An unknown /api path is an ApiError too, so the browser always gets the same shape.
  app.setNotFoundHandler((request, reply) =>
    fail(reply, { code: "not_found", message: `No such endpoint: ${request.method} ${request.url.split("?")[0]}` }),
  );
  return app;
}

/**
 * Browsers let any web page send requests, and open WebSockets, to any address (this computer's
 * included), with this site's cookies attached. So a browser's change or live connection must come
 * from a page on this same site. Programs that aren't browsers send no Origin, and need a session
 * like everyone else.
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
    return reply
      .status(HTTP_STATUS.forbidden)
      .send({ code: "forbidden", message: "Only pages on this site may do that" } satisfies ApiError);
  }
}

/** A repeated query key arrives as a list; each value is one JSON document, so take the first. */
function firstValues(query: Record<string, string | string[] | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(query).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
}
