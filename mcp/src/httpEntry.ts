#!/usr/bin/env node
import express from "express";
import { createMcpRouter } from "./http.js";

/**
 * Standalone HTTP entry point — useful for local testing of the remote mode, or
 * to run the MCP as its own service. In production the router is normally
 * mounted inside the Game backend instead (see backend src/index.js).
 *
 * Required env: MCP_GATE_KEY (shared secret for the MCP consumer), plus the
 * service key GAME_API_KEY and GAME_API_URL to reach the Game REST API.
 */
const app = express();
app.disable("x-powered-by");

try {
  app.use("/mcp", createMcpRouter());
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

app.get("/healthz", (_req, res) => res.json({ ok: true }));

const port = Number(process.env.MCP_HTTP_PORT || 8788);
app.listen(port, () => {
  console.error(`STANNUM Game MCP (HTTP) listening on :${port}/mcp`);
});
