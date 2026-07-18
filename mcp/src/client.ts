import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from "axios";

/**
 * Thin HTTP client around the STANNUM Game REST API.
 *
 * Unlike the Trenno MCP (which logs in with email/password and caches a JWT),
 * the Game backend already exposes a server-to-server service token: the
 * `x-api-key` header validated by `middlewares/validateAPIKey.js` against
 * `MAKE_API_KEY`. So auth here is a single static header — no login flow, no
 * token refresh. That key gates the read-only `/api/admin/*`, `/api/programs/*`
 * and `/api/product-key/*` endpoints this MCP consumes.
 *
 * Configuration is read LAZILY from the environment (not at module load) so the
 * server can be embedded in another process (e.g. mounted inside the Game
 * backend) that sets GAME_API_URL / GAME_API_KEY at runtime before the first call.
 */

const DEFAULT_API_URL = "https://stannum-game-backend-v2-production.up.railway.app/api";

/** Resolve the API base URL from the environment, memoized on first use. */
let _apiUrl: string | null = null;
export function getApiUrl(): string {
  if (_apiUrl === null) {
    _apiUrl = (process.env.GAME_API_URL || DEFAULT_API_URL).replace(/\/$/, "");
  }
  return _apiUrl;
}

function getApiKey(): string {
  const key = process.env.GAME_API_KEY;
  if (!key) {
    throw new GameApiError(
      "Missing credentials: set GAME_API_KEY (the backend's x-api-key / MAKE_API_KEY) in the MCP server environment.",
    );
  }
  return key;
}

export class GameApiError extends Error {
  status?: number;
  code?: string;
  details?: unknown;
  constructor(message: string, opts: { status?: number; code?: string; details?: unknown } = {}) {
    super(message);
    this.name = "GameApiError";
    this.status = opts.status;
    this.code = opts.code;
    this.details = opts.details;
  }
}

class GameClient {
  private _http: AxiosInstance | null = null;

  /** Lazily create the axios instance so getApiUrl() reads env at first use. */
  private http(): AxiosInstance {
    if (!this._http) {
      this._http = axios.create({
        baseURL: getApiUrl(),
        timeout: Number(process.env.GAME_TIMEOUT_MS || 30000),
      });
    }
    return this._http;
  }

  /**
   * Perform an authenticated request. The `x-api-key` header is attached to
   * every call; errors are normalized into GameApiError. This MCP is read-only,
   * so `request` is only ever invoked by GET tools (and the host-locked raw
   * tool, which itself restricts the method to GET).
   */
  async request<T = any>(config: AxiosRequestConfig): Promise<T> {
    const apiKey = getApiKey();
    try {
      const res = await this.http().request<T>({
        ...config,
        headers: { ...(config.headers || {}), "x-api-key": apiKey },
      });
      return res.data;
    } catch (err) {
      throw normalizeError(err, `${config.method?.toUpperCase() || "GET"} ${config.url}`);
    }
  }

  get<T = any>(url: string, params?: Record<string, unknown>) {
    return this.request<T>({ method: "GET", url, params: cleanParams(params) });
  }
}

/** Drop undefined/null/empty query params so the API doesn't choke on them. */
function cleanParams(params?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!params) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    out[k] = v;
  }
  return out;
}

function normalizeError(err: unknown, context: string): GameApiError {
  if (err instanceof GameApiError) return err;
  const axErr = err as AxiosError<any>;
  if (axErr?.isAxiosError) {
    const status = axErr.response?.status;
    const body = axErr.response?.data;
    const msg = body?.message || body?.error?.message || axErr.message || "Request failed";
    return new GameApiError(`${context}: ${msg}`, {
      status,
      code: body?.code || body?.error?.code,
      details: body,
    });
  }
  return new GameApiError(`${context}: ${(err as Error)?.message || String(err)}`);
}

export const client = new GameClient();
