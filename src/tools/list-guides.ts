import { z } from "zod";
import { loadSpecIndex } from "../spec/loader.js";

export const listGuidesSchema = z.object({});

export const listGuidesDescription = `List the Pancake API guide sections (narrative documentation).

These cover concepts rather than a single endpoint: authentication and tokens, rate limits, the recommended API usage flow, webhook setup, event types, suspension rules, and best practices. Pass a guide id to get_guide for the full text.`;

export type ListGuidesInput = z.infer<typeof listGuidesSchema>;

export function listGuidesTool(): string {
  const index = loadSpecIndex();
  if (!index.guides.length) return "No guide sections are available.";

  const lines: string[] = ["Pancake API guides:", ""];
  for (const g of index.guides) {
    const scope = g.source === "webhook" ? "webhooks" : "REST API";
    lines.push(`- \`${g.id}\` — ${g.title} _(${scope})_`);
  }
  lines.push("", "Use get_guide with an id above for the full text.");
  return lines.join("\n");
}
