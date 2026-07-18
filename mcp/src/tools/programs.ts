import { z } from "zod";
import { client } from "../client.js";
import { ToolDef } from "../helpers.js";

/** Program catalog tools (content: sections / modules / lessons / instructions / resources). */
export const programTools: ToolDef[] = [
  {
    name: "game_list_programs",
    title: "List programs",
    description:
      "List the STANNUM Game program catalog (tia, tia_summer, tia_pool, tmd, trenno_ia): id, name, type, pricing and metadata. Use `full=true` for the entire nested content tree (sections, modules, lessons, instructions, resources).",
    inputSchema: {
      full: z
        .boolean()
        .optional()
        .describe("If true, returns the full nested content tree instead of the summary list."),
    },
    handler: ({ full }) => client.get(full ? "/programs/full" : "/programs"),
  },
  {
    name: "game_get_program",
    title: "Get program",
    description:
      "Get a single program by id (e.g. 'tia', 'tia_pool', 'trenno_ia') with its full content tree: sections, modules, lessons and instructions.",
    inputSchema: {
      programId: z.string().describe("Program id, e.g. 'tia' | 'tia_summer' | 'tia_pool' | 'tmd' | 'trenno_ia'."),
    },
    handler: ({ programId }) => client.get(`/programs/${encodeURIComponent(programId)}`),
  },
];
