import { getLatestPhotoAnalysisSummary, getPhotoProgressSummary } from "../../services/photo-analysis.js";
import { emptyToolInputSchema } from "../schemas.js";
import { ToolCategory, type AgentToolDefinition } from "../types.js";

export const photoTools: AgentToolDefinition[] = [
  {
    name: "get_latest_photo_analysis",
    description: "Read only existing textual analysis fields from the authenticated user's latest completed photo analysis. No images or storage references are returned.",
    category: ToolCategory.READ,
    schema: emptyToolInputSchema,
    handler: async (_input, { actor }) => {
      const analysis = await getLatestPhotoAnalysisSummary(actor.userId);
      return analysis ? { status: "found", analysis } : { status: "not_found" };
    },
  },
  {
    name: "get_photo_progress_summary",
    description: "Read only the latest stored textual photo comparison summary for the authenticated user. Never estimates exact body fat.",
    category: ToolCategory.READ,
    schema: emptyToolInputSchema,
    handler: async (_input, { actor }) => {
      const summary = await getPhotoProgressSummary(actor.userId);
      return summary ? { status: "found", summary } : { status: "not_found" };
    },
  },
];
