import { z } from "zod";
import { client } from "../client.js";
import { ToolDef, pagination, search } from "../helpers.js";

/**
 * Read-only user tools. These hit the existing `/api/admin/*` endpoints, which
 * already project a curated shape (progress derived via buildUserPrograms,
 * secrets like password/otp/refreshToken/magicLink never leave the backend).
 */
export const userTools: ToolDef[] = [
  {
    name: "game_get_user",
    title: "Get Game user",
    description:
      "Get a single STANNUM Game user by email OR username (provide exactly one). Returns profile, enterprise, level/XP, coins, daily streak, achievements count, and per-program progress (lessons completed, instructions submitted/graded, average score, last activity).",
    inputSchema: {
      email: z.string().email().optional(),
      username: z.string().optional(),
    },
    handler: ({ email, username }) => {
      if (!email && !username) throw new Error("Provide either `email` or `username`.");
      if (email && username) throw new Error("Provide only one of `email` or `username`, not both.");
      return client.get("/admin/user", { email, username });
    },
  },
  {
    name: "game_search_users",
    title: "Search / list Game users",
    description:
      "List STANNUM Game users, newest-XP first. Filters: `enterprise` (company name, partial match), `search` (email/name/username, partial match), `page`, `limit` (max 100). Returns a paginated summary of each user (level, coins, streak, active programs).",
    inputSchema: {
      enterprise: z.string().optional().describe("Filter by company name (partial match)."),
      ...search,
      ...pagination,
    },
    handler: (a) => client.get("/admin/users", a),
  },
  {
    name: "game_list_enterprises",
    title: "List enterprises",
    description: "List all company names registered in STANNUM Game (distinct, sorted).",
    inputSchema: {},
    handler: () => client.get("/admin/enterprises"),
  },
];
