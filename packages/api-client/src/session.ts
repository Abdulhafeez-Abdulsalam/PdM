/**
 * Signing in and out of the PdM server (server mode only, ADR-0014). The session itself is a
 * cookie the browser keeps and sends by itself; this page's code never sees it.
 */
import { API_PREFIX, ApiError, SESSION_PATH, SessionInfo, SessionPeople, type SignInRequest, type User } from "@pdm/contracts";
import { ApiRequestError } from "./transport";

export interface SessionClient {
  /** Who is signed in, or null if nobody. */
  current(): Promise<User | null>;
  /** The demo people to choose from on the sign-in page. */
  people(): Promise<User[]>;
  signIn(userId: string): Promise<User>;
  signOut(): Promise<void>;
}

export function createSessionClient({ baseUrl = "", fetch: fetchImpl = globalThis.fetch.bind(globalThis) } = {}): SessionClient {
  const url = `${baseUrl}${API_PREFIX}${SESSION_PATH}`;
  const call = async (path: string, body?: unknown): Promise<{ status: number; data: unknown }> => {
    let response: Response;
    try {
      response = await fetchImpl(`${url}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiRequestError({ code: "unavailable", message: "Can't reach the server" });
    }
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok && response.status !== 401) {
      const error = ApiError.safeParse(data);
      throw new ApiRequestError(error.success ? error.data : { code: "internal", message: `Server answered ${response.status}` });
    }
    return { status: response.status, data };
  };

  return {
    async current() {
      return SessionInfo.parse((await call("")).data).user;
    },
    async people() {
      return SessionPeople.parse((await call("/people")).data);
    },
    async signIn(userId) {
      const body: SignInRequest = { userId };
      const user = SessionInfo.parse((await call("", body)).data).user;
      if (!user) throw new ApiRequestError({ code: "internal", message: "Signed in, but the server didn't say as whom" });
      return user;
    },
    async signOut() {
      await call("/end", {});
    },
  };
}
