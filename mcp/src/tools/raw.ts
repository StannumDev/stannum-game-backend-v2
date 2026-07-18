import { z } from "zod";
import { client, getApiUrl, GameApiError } from "../client.js";
import { ToolDef } from "../helpers.js";

/**
 * Resolve a user-supplied path against the API base and make sure it cannot
 * escape it. Defends against:
 *  - absolute URLs / protocol-relative ("//evil.com") → would send the api key off-host
 *  - path traversal ("../..") → would climb above the /api base
 * Returns the safe absolute URL string to hit.
 */
function resolveSafePath(rawPath: string): string {
  // Reject clearly off-host shapes early so they surface as an explicit refusal
  // rather than being normalized into a same-host 404. `//host` / `/\host` are
  // protocol-relative escapes; backslashes are treated as slashes by the URL
  // parser and would otherwise slip past the leading-slash strip below.
  if (/^[\\/]{2}/.test(rawPath) || rawPath.includes("\\")) {
    throw new GameApiError(
      `Refusing request: path '${rawPath}' looks like an absolute/host-relative URL. Provide a path under the API base, e.g. '/admin/stats'.`,
    );
  }
  const apiUrl = getApiUrl();
  const API_BASE = new URL(apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`);
  const rel = rawPath.replace(/^\/+/, "");
  const resolved = new URL(rel, API_BASE);

  if (resolved.origin !== API_BASE.origin) {
    throw new GameApiError(
      `Refusing request: path '${rawPath}' resolves to a different host (${resolved.origin}). Only the Game API is allowed.`,
    );
  }
  if (!resolved.pathname.startsWith(API_BASE.pathname)) {
    throw new GameApiError(`Refusing request: path '${rawPath}' escapes the API base (${API_BASE.pathname}).`);
  }
  return resolved.toString();
}

/**
 * Low-level READ-ONLY escape hatch. Any GET endpoint the curated tools don't
 * cover can still be reached here — sent with the same x-api-key session, but
 * only ever to the configured Game API host, and only ever as a GET. This is
 * deliberately restricted to GET: the whole server is read-only, so there is no
 * write escape hatch by design.
 */
export const rawTools: ToolDef[] = [
  {
    name: "game_request",
    title: "Raw Game API GET request",
    description:
      "Make an arbitrary authenticated GET request against the Game API. Use this for read endpoints not covered by a dedicated tool. " +
      "`path` is relative to the API base (e.g. '/admin/stats' or '/programs/tia'), do NOT include the host. " +
      "Requests are restricted to the configured Game API host and to the GET method. The x-api-key is added automatically. Returns the parsed JSON response.",
    inputSchema: {
      path: z.string().describe("Path relative to the API base, starting with '/'. E.g. '/admin/users'."),
      query: z.record(z.string(), z.any()).optional().describe("Query string parameters."),
    },
    handler: ({ path, query }) => {
      const url = resolveSafePath(path);
      return client.request({ method: "GET", url, params: query });
    },
  },
];
