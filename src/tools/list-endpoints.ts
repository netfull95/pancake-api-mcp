import { z } from "zod";
import { loadSpecIndex } from "../spec/loader.js";

export const listEndpointsSchema = z.object({
  tag: z
    .string()
    .optional()
    .describe("Filter to a single tag/category, e.g. 'Conversations', 'Statistics', 'Customers'."),
  keyword: z
    .string()
    .optional()
    .describe("Filter to endpoints whose path or summary contains this keyword."),
});

export const listEndpointsDescription = `List all Pancake REST API endpoints, grouped by tag.

Returns each endpoint's id (e.g. "GET /pages/{page_id}/conversations"), method, path, and summary. Pass the id to get_endpoint for the full contract (parameters, request body, response schema, examples). Optionally filter by tag or keyword.`;

export type ListEndpointsInput = z.infer<typeof listEndpointsSchema>;

export function listEndpointsTool(input: ListEndpointsInput): string {
  const index = loadSpecIndex();
  let endpoints = index.endpoints;

  if (input.tag) {
    const t = input.tag.toLowerCase();
    endpoints = endpoints.filter((e) => e.tag.toLowerCase() === t);
  }
  if (input.keyword) {
    const k = input.keyword.toLowerCase();
    endpoints = endpoints.filter(
      (e) =>
        e.path.toLowerCase().includes(k) ||
        (e.summary ?? "").toLowerCase().includes(k)
    );
  }

  if (!endpoints.length) {
    return "No endpoints matched the given filters. Call list_endpoints with no arguments to see everything.";
  }

  const byTag = new Map<string, typeof endpoints>();
  for (const e of endpoints) {
    if (!byTag.has(e.tag)) byTag.set(e.tag, []);
    byTag.get(e.tag)!.push(e);
  }

  const lines: string[] = [`Pancake REST API — ${endpoints.length} endpoint(s):`, ""];
  for (const [tag, list] of byTag) {
    lines.push(`## ${tag}`);
    for (const e of list) {
      lines.push(`- \`${e.id}\`${e.summary ? ` — ${e.summary}` : ""}`);
    }
    lines.push("");
  }
  lines.push("Use get_endpoint with an id above for full details.");
  return lines.join("\n");
}
