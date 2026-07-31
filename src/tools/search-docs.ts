import { z } from "zod";
import { loadSpecIndex } from "../spec/loader.js";
import { searchDocs, type SearchArea } from "../search/search.js";

export const searchDocsSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe("Keywords to search for, e.g. 'send message', 'conversation tags', 'webhook messaging', 'rate limit'."),
  area: z
    .enum(["endpoint", "webhook", "guide", "schema", "all"])
    .optional()
    .describe("Restrict the search to one area. Defaults to 'all'."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Maximum number of results to return (default 10)."),
});

export const searchDocsDescription = `Search the entire Pancake API documentation and return ranked matches.

This is the entry point for exploring the docs: search first, then fetch full detail with get_endpoint, get_webhook, or get_guide using the returned id.

Searches across REST endpoints, webhook events, guide sections (authentication, rate limits, setup...), and component schemas. Each result includes its type, the id to pass to the matching get_* tool, and a short snippet.`;

export type SearchDocsInput = z.infer<typeof searchDocsSchema>;

export function searchDocsTool(input: SearchDocsInput): string {
  const index = loadSpecIndex();
  const results = searchDocs(
    index,
    input.query,
    (input.area ?? "all") as SearchArea,
    input.limit ?? 10
  );

  if (!results.length) {
    return `No documentation found for "${input.query}". Try broader keywords, or call list_endpoints / list_webhooks / list_guides to browse.`;
  }

  const lines = [`Found ${results.length} result(s) for "${input.query}":`, ""];
  for (const r of results) {
    const tool =
      r.type === "endpoint"
        ? "get_endpoint"
        : r.type === "webhook"
          ? "get_webhook"
          : r.type === "guide"
            ? "get_guide"
            : "search_docs";
    lines.push(`- [${r.type}] ${r.title}`);
    lines.push(`  id: \`${r.id}\`  → fetch with ${tool}`);
    if (r.snippet) lines.push(`  ${r.snippet}`);
    lines.push("");
  }
  return lines.join("\n").trim();
}
