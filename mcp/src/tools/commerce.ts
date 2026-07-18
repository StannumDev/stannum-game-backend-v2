import { z } from "zod";
import { client } from "../client.js";
import { ToolDef, pagination } from "../helpers.js";

/**
 * Commerce + community read tools. These hit the read-only admin endpoints
 * added to the backend (adminReadController.js): orders, coupons, subscription
 * payments/audit, and the community prompt/assistant libraries.
 */
export const commerceTools: ToolDef[] = [
  {
    name: "game_list_orders",
    title: "List orders",
    description:
      "List STANNUM Game orders (B2C purchases / gifts via MercadoPago), newest first. Filters: `status` (pending|approved|rejected|refunded|chargedback|cancelled|expired), `userId` (Mongo id), `programId`. Includes amounts, currency and MP ids.",
    inputSchema: {
      status: z.string().optional(),
      userId: z.string().optional().describe("Mongo ObjectId of the buyer."),
      programId: z.string().optional(),
      ...pagination,
    },
    handler: (a) => client.get("/admin/orders", a),
  },
  {
    name: "game_list_coupons",
    title: "List coupons",
    description:
      "List discount coupons. Filter: `isActive` (true/false). Includes discount type/value, applicable programs, usage limits and validity window.",
    inputSchema: {
      isActive: z.boolean().optional(),
      ...pagination,
    },
    handler: (a) => client.get("/admin/coupons", a),
  },
  {
    name: "game_list_subscription_payments",
    title: "List subscription payments",
    description:
      "List subscription payments (e.g. trenno_ia), newest first. Filters: `userId`, `status` (approved|rejected|pending|refunded), `programId`. Includes amount, currency and MercadoPago payment id.",
    inputSchema: {
      userId: z.string().optional(),
      status: z.string().optional(),
      programId: z.string().optional(),
      ...pagination,
    },
    handler: (a) => client.get("/admin/subscription-payments", a),
  },
  {
    name: "game_list_subscription_audit",
    title: "List subscription audit log",
    description:
      "List the subscription state-change audit log (status transitions), newest first. Filters: `userId`, `programId`, `trigger` (user|webhook|reconciliation|system|public_cancel).",
    inputSchema: {
      userId: z.string().optional(),
      programId: z.string().optional(),
      trigger: z.string().optional(),
      ...pagination,
    },
    handler: (a) => client.get("/admin/subscription-audit", a),
  },
  {
    name: "game_list_prompts",
    title: "List community prompts",
    description:
      "List the community prompt library. Filters: `category`, `visibility` (published|draft|hidden), `search` (title/description). Includes author, metrics and verification status. (Heavy engagement arrays are omitted.)",
    inputSchema: {
      category: z.string().optional(),
      visibility: z.string().optional(),
      search: z.string().optional(),
      ...pagination,
    },
    handler: (a) => client.get("/admin/community/prompts", a),
  },
  {
    name: "game_list_assistants",
    title: "List community assistants",
    description:
      "List the community assistant / custom-GPT library. Filters: `category`, `visibility` (published|draft|hidden), `search`. Includes author, metrics and verification status.",
    inputSchema: {
      category: z.string().optional(),
      visibility: z.string().optional(),
      search: z.string().optional(),
      ...pagination,
    },
    handler: (a) => client.get("/admin/community/assistants", a),
  },
];
