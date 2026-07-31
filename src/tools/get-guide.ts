import { z } from "zod";
import { findGuide, loadSpecIndex } from "../spec/loader.js";
import { renderGuide } from "../render/markdown.js";

export const getGuideSchema = z.object({
  id: z
    .string()
    .min(1)
    .describe("Guide id or title as returned by list_guides / search_docs, e.g. 'authentication', 'rate-limits', 'api-usage-flow'."),
});

export const getGuideDescription = `Get the full text of a single Pancake API guide section.

Returns narrative documentation such as authentication (how to obtain and use access tokens), rate limits, the recommended integration flow, or webhook setup. Pass an id from list_guides or search_docs.`;

export type GetGuideInput = z.infer<typeof getGuideSchema>;

export function getGuideTool(input: GetGuideInput): string {
  const index = loadSpecIndex();
  const guide = findGuide(index, input.id);
  if (!guide) {
    const known = index.guides.map((g) => g.id).join(", ");
    return `No guide "${input.id}". Available guides: ${known}. Use list_guides to browse.`;
  }
  return renderGuide(guide);
}
