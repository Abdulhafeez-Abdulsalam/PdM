/**
 * How a request travels over HTTP (Phase 5, ADR-0012). One copy, used by the browser's
 * HttpTransport to build requests and by the server to read them back, so the two can't drift.
 *
 *   - The path's `:params` are filled from the input: assets.get {assetId: "CBC-GT-101"} →
 *     GET /api/assets/CBC-GT-101.
 *   - GET: every other value goes in the query string as JSON, so numbers, lists and nested
 *     filters survive the trip unchanged: ?limit=50&status=["open"]&search="pump".
 *   - POST: the whole input travels as a JSON body.
 * The server then checks the input against the endpoint's schema, exactly as the mock does.
 */
import type { ApiError } from "./common";
import { endpoints, pathParams, type EndpointName, type HttpMethod } from "./endpoints";

/** Every API path starts here, so the app's own pages and the API never collide. */
export const API_PREFIX = "/api";

/** The HTTP status for each kind of failure. */
export const HTTP_STATUS: Record<ApiError["code"], number> = {
  bad_request: 400,
  not_found: 404,
  conflict: 409,
  too_many_tags: 422,
  unavailable: 503,
  internal: 500,
};

export interface HttpRequest {
  method: HttpMethod;
  /** Path and query, starting with API_PREFIX. */
  url: string;
  /** JSON body for POST; undefined for GET. */
  body: unknown;
}

export function toHttpRequest(name: EndpointName, input: unknown): HttpRequest {
  const def = endpoints[name];
  const values = { ...((input ?? {}) as Record<string, unknown>) };
  const path = def.path.replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_, key: string) => {
    const value = values[key];
    if (value === undefined || value === null) throw new Error(`${name}: missing path value "${key}"`);
    if (def.method === "GET") delete values[key];
    return encodeURIComponent(String(value));
  });
  if (def.method === "POST") return { method: "POST", url: `${API_PREFIX}${path}`, body: input ?? {} };
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined) query.set(key, JSON.stringify(value));
  const qs = query.toString();
  return { method: "GET", url: `${API_PREFIX}${path}${qs ? `?${qs}` : ""}`, body: undefined };
}

/**
 * The input object for an endpoint, from what arrived over HTTP. Throws on a query value that
 * isn't JSON; the server answers that with 400. Path values always win over anything else.
 */
export function fromHttpRequest(
  name: EndpointName,
  pathValues: Record<string, string>,
  query: Record<string, string | undefined>,
  body: unknown,
): unknown {
  const def = endpoints[name];
  const input: Record<string, unknown> = {};
  if (def.method === "GET") {
    for (const [key, raw] of Object.entries(query)) {
      if (raw === undefined) continue;
      try {
        input[key] = JSON.parse(raw);
      } catch {
        throw new Error(`Query value "${key}" isn't JSON`);
      }
    }
  } else if (body && typeof body === "object") Object.assign(input, body);
  for (const key of pathParams(def.path)) if (pathValues[key] !== undefined) input[key] = pathValues[key];
  return input;
}
