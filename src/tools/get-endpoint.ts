import { z } from "zod";
import { findEndpoint, loadSpecIndex } from "../spec/loader.js";
import { renderEndpoint } from "../render/markdown.js";

export const getEndpointSchema = z.object({
  id: z
    .string()
    .min(1)
    .describe('Endpoint id as returned by search_docs / list_endpoints, e.g. "GET /pages/{page_id}/conversations". The path alone also works.'),
});

export const getEndpointDescription = `Get the full contract of a single Pancake REST API endpoint as markdown.

Includes the base URL(s), authentication, all parameters, the request body schema, and the response schema — with $ref schemas expanded into a readable field list — plus any examples. Pass an id from search_docs or list_endpoints.`;

export type GetEndpointInput = z.infer<typeof getEndpointSchema>;

export function getEndpointTool(input: GetEndpointInput): string {
  const index = loadSpecIndex();
  const endpoint = findEndpoint(index, input.id);
  if (!endpoint) {
    return `No endpoint found for "${input.id}". Use list_endpoints or search_docs to find a valid id (e.g. "GET /pages/{page_id}/conversations").`;
  }
  return renderEndpoint(endpoint, index.restSchemas);
}
