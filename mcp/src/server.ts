import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { ToolDef, toContent, toError } from "./helpers.js";
import { userTools } from "./tools/users.js";
import { programTools } from "./tools/programs.js";
import { statsTools } from "./tools/stats.js";
import { commerceTools } from "./tools/commerce.js";
import { rawTools } from "./tools/raw.js";

export const ALL_TOOLS: ToolDef[] = [
  ...userTools,
  ...programTools,
  ...statsTools,
  ...commerceTools,
  ...rawTools,
];

/**
 * Build a fully-configured read-only MCP server (all tools).
 * A fresh instance is created per stdio process and per HTTP session.
 */
export function createServer(): McpServer {
  const server = new McpServer({ name: "stannum-game", version: "1.0.0" });

  for (const tool of ALL_TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: { readOnlyHint: true },
      },
      async (args: unknown) => {
        try {
          const result = await tool.handler(args ?? {});
          return toContent(result);
        } catch (err) {
          return toError(err);
        }
      },
    );
  }

  return server;
}
