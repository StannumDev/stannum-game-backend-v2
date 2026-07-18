import { z } from "zod";
import { client } from "../client.js";
import { ToolDef } from "../helpers.js";

/** Aggregated metrics + in-app feedback browsing (read-only). */
export const statsTools: ToolDef[] = [
  {
    name: "game_stats",
    title: "Game stats",
    description:
      "Aggregated STANNUM Game metrics: total users, active users (7d/30d), level distribution, average level/streak, streak retention, achievements, and per-program stats (users with access, avg lessons completed, avg instructions graded, completion rate). Cached ~5 min server-side.",
    inputSchema: {},
    handler: () => client.get("/admin/stats"),
  },
  {
    name: "game_list_feedback",
    title: "List in-app feedback",
    description:
      "List in-app feedback / crash reports from the Game. Filters: `type` (lesson|instruction|nps|onboarding|error), `resolved` (true/false), `from`/`to`/`cursor` (ISO dates), `limit` (max 200).",
    inputSchema: {
      type: z.enum(["lesson", "instruction", "nps", "onboarding", "error"]).optional(),
      resolved: z.boolean().optional(),
      from: z.string().optional().describe("ISO date lower bound."),
      to: z.string().optional().describe("ISO date upper bound."),
      cursor: z.string().optional().describe("ISO 8601 timestamp to page from (createdAt of last seen item)."),
      limit: z.number().int().min(1).max(200).optional(),
    },
    handler: (a) => client.get("/admin/feedback", a),
  },
  {
    name: "game_feedback_stats",
    title: "In-app feedback stats",
    description: "Aggregated stats for in-app Game feedback (total, resolved, by type).",
    inputSchema: {},
    handler: () => client.get("/admin/feedback/stats"),
  },
];
