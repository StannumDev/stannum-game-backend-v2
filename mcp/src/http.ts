import express, { Router, Request, Response } from "express";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "./server.js";

/**
 * Streamable-HTTP transport for the STANNUM Game MCP, packaged as an Express
 * Router so it can be mounted inside the existing Game backend
 * (`app.use("/mcp", ...)`) or served standalone (see httpEntry.ts).
 *
 * Auth model: the endpoint talks to the Game API with a single shared service
 * key (GAME_API_KEY / x-api-key), which grants read access to admin/programs
 * endpoints. Because the endpoint therefore reads with elevated rights, it is
 * gated by a SEPARATE shared secret header `x-mcp-key` (env MCP_GATE_KEY) — a
 * key of its own, NOT the same as GAME_API_KEY, so it can be rotated / revoked
 * for the MCP consumer without touching server-to-server integrations. We FAIL
 * CLOSED: without MCP_GATE_KEY the router refuses to mount.
 *
 * Unlike the Trenno MCP, we DO NOT accept the key via a `?key=` query param.
 * That form only existed for ChatGPT (which can't send custom headers) and it
 * leaks the secret into access logs. Claude Code sends custom headers, so the
 * header is the only accepted channel here.
 *
 * Sessions are stateful: an `initialize` request mints a session id (returned
 * in the `mcp-session-id` header) and a dedicated McpServer instance; later
 * requests reuse it via that header. GET opens the SSE stream; DELETE tears it
 * down. Idle sessions are swept on a timer and the total is capped, so a client
 * that disconnects without DELETE (the normal case) can't leak memory and OOM
 * the shared backend process.
 */

const IDLE_TTL_MS = Number(process.env.MCP_SESSION_TTL_MS || 30 * 60 * 1000); // 30 min
const MAX_SESSIONS = Number(process.env.MCP_MAX_SESSIONS || 50);
const SWEEP_MS = 60 * 1000;

interface Session {
  transport: StreamableHTTPServerTransport;
  lastSeen: number;
}

export function createMcpRouter(): Router {
  const gateKey = process.env.MCP_GATE_KEY;
  if (!gateKey || gateKey.length < 16) {
    throw new Error(
      "Refusing to mount the HTTP MCP endpoint: set MCP_GATE_KEY to a strong shared secret (>=16 chars). " +
        "Without it the endpoint would read the Game backend with elevated rights unauthenticated.",
    );
  }
  const gateKeyBuf = Buffer.from(gateKey);

  const router: Router = express.Router();
  const sessions = new Map<string, Session>();

  const dropSession = (id: string) => {
    const s = sessions.get(id);
    if (!s) return;
    sessions.delete(id);
    try {
      s.transport.close();
    } catch {
      /* already closing */
    }
  };

  // Evict idle sessions so dropped/unclosed connections don't leak forever.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [id, s] of sessions) {
      if (now - s.lastSeen > IDLE_TTL_MS) dropSession(id);
    }
  }, SWEEP_MS);
  sweep.unref?.();

  const touch = (id?: string): StreamableHTTPServerTransport | undefined => {
    if (!id) return undefined;
    const s = sessions.get(id);
    if (s) s.lastSeen = Date.now();
    return s?.transport;
  };

  // --- Shared-secret gate (constant-time compare, length-safe) -------------
  // Header-only: `x-mcp-key`. No query-param fallback (see file header).
  router.use((req: Request, res: Response, next) => {
    const provided = Buffer.from(req.header("x-mcp-key") || "");
    const ok = provided.length === gateKeyBuf.length && timingSafeEqual(provided, gateKeyBuf);
    if (!ok) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Unauthorized: missing or invalid x-mcp-key." },
        id: null,
      });
      return;
    }
    next();
  });

  // Ensure a JSON body is available when served standalone. When mounted inside
  // the backend, its global express.json() has already parsed the body (and its
  // limit applies); this second parser then no-ops on the finished stream.
  router.use(express.json({ limit: "4mb" }));

  // --- POST: client → server messages --------------------------------------
  router.post("/", async (req: Request, res: Response) => {
    try {
      const sessionId = req.header("mcp-session-id");
      let transport = touch(sessionId);

      if (!transport) {
        if (!isInitializeRequest(req.body)) {
          res.status(400).json({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Bad Request: no valid session id; send an initialize request first." },
            id: null,
          });
          return;
        }
        if (sessions.size >= MAX_SESSIONS) {
          res.status(503).json({
            jsonrpc: "2.0",
            error: { code: -32000, message: "Server busy: too many active MCP sessions, try again later." },
            id: null,
          });
          return;
        }
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => {
            sessions.set(sid, { transport: transport!, lastSeen: Date.now() });
          },
        });
        transport.onclose = () => {
          if (transport!.sessionId) sessions.delete(transport!.sessionId);
        };
        const server = createServer();
        await server.connect(transport);
      }

      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("[game-mcp] POST handler error:", (err as Error)?.message);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error." },
          id: null,
        });
      }
    }
  });

  // --- GET (SSE stream) / DELETE (close) -----------------------------------
  const sessionScoped = async (req: Request, res: Response) => {
    const transport = touch(req.header("mcp-session-id"));
    if (!transport) {
      res.status(400).send("Invalid or missing mcp-session-id.");
      return;
    }
    await transport.handleRequest(req, res);
  };

  router.get("/", sessionScoped);
  router.delete("/", sessionScoped);

  return router;
}
