#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, ALL_TOOLS } from "./server.js";

/**
 * Local (stdio) entry point. Mostly useful for internal/dev use — the primary
 * deployment is the remote HTTP transport (see http.ts / httpEntry.ts). Each
 * MCP client runs this as a subprocess with GAME_API_URL + GAME_API_KEY in its
 * environment.
 */
async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Note: never write to stdout — it carries the MCP protocol. Logs go to stderr.
  console.error(`STANNUM Game MCP ready (stdio) — ${ALL_TOOLS.length} read-only tools registered.`);
}

main().catch((err) => {
  console.error("Fatal error starting STANNUM Game MCP:", err);
  process.exit(1);
});
