import { z, ZodRawShape } from "zod";
import { GameApiError } from "./client.js";

/** A single MCP tool definition. Modules export arrays of these. */
export interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: ZodRawShape;
  handler: (args: any) => Promise<unknown>;
  /** All tools in this server are read-only; surfaced as an MCP annotation. */
  readOnly?: boolean;
}

/** Serialize any handler return value into the MCP text-content envelope. */
export function toContent(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text" as const, text }] };
}

export function toError(err: unknown) {
  let text: string;
  if (err instanceof GameApiError) {
    text = `Game API error${err.status ? ` (HTTP ${err.status})` : ""}${
      err.code ? ` [${err.code}]` : ""
    }: ${err.message}`;
    if (err.details && typeof err.details === "object") {
      text += `\n${JSON.stringify(err.details, null, 2)}`;
    }
  } else {
    text = `Error: ${(err as Error)?.message || String(err)}`;
  }
  return { content: [{ type: "text" as const, text }], isError: true };
}

// ---- Reusable zod fragments -------------------------------------------------

export const pagination = {
  page: z.number().int().min(1).optional().describe("Page number (1-based)."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Items per page (default depends on the resource; capped server-side)."),
};

export const search = {
  search: z.string().optional().describe("Free-text search filter (email, name or username)."),
};
