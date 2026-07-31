import { z } from "zod";
import { findEndpoint, loadSpecIndex } from "../spec/loader.js";
import { callEndpoint, CallError } from "../http/client.js";
import { getConfig } from "../config.js";

export const callEndpointSchema = z.object({
  id: z
    .string()
    .min(1)
    .describe('Endpoint id from search_docs / list_endpoints, e.g. "GET /pages/{page_id}/conversations".'),
  params: z
    .record(z.any())
    .optional()
    .describe("Path, query and header parameter values keyed by parameter name, e.g. { page_id: \"123\", tags: [\"a\",\"b\"] }. The access token is added automatically from the server environment — do not pass it."),
  body: z
    .any()
    .optional()
    .describe("JSON request body for POST / PUT / PATCH / DELETE endpoints. Sent as application/json."),
});

export const callEndpointDescription = `Call a Pancake API endpoint for real and return the live response.

Unlike the other tools (which read a bundled offline doc snapshot), this one performs a real HTTP request to https://pages.fm using the access token configured in the MCP server's environment. The correct token — \`access_token\` or \`page_access_token\` — is chosen from the endpoint's OpenAPI security scheme and appended automatically; never pass a token yourself.

WRITE OPERATIONS ARE ENABLED: POST / PUT / DELETE endpoints will really send messages, change tags, and modify data on the live account. Confirm with the user before calling a non-GET endpoint. Run auth_status to see which tokens are configured, and get_endpoint first to learn the required parameters.`;

export type CallEndpointInput = z.infer<typeof callEndpointSchema>;

export async function callEndpointTool(input: CallEndpointInput): Promise<string> {
  const index = loadSpecIndex();
  const endpoint = findEndpoint(index, input.id);
  if (!endpoint) {
    return `No endpoint found for "${input.id}". Use list_endpoints or search_docs to find a valid id (e.g. "GET /pages/{page_id}/conversations").`;
  }

  let result;
  try {
    result = await callEndpoint(endpoint, { params: input.params, body: input.body });
  } catch (error) {
    if (error instanceof CallError) return `Request not sent — ${error.message}`;
    throw error;
  }

  const config = getConfig();
  const parts: string[] = [
    `# ${result.method} ${endpoint.path} → ${result.status} ${result.statusText}`,
    "",
    `**Request:** \`${result.method} ${result.url}\``,
    `**Status:** ${result.status} ${result.statusText} (${result.ok ? "success" : "error"}) in ${result.durationMs}ms`,
  ];

  if (result.status === 401 || result.status === 403) {
    parts.push(
      "",
      "_Authentication failed. The configured token may be expired, revoked, or scoped to a different page — check auth_status and re-read the `authentication` guide._"
    );
  }

  parts.push("", "## Response body", "");
  if (!result.bodyText.trim()) {
    parts.push("_(empty)_");
  } else {
    const fence = result.contentType?.includes("json") ? "json" : "";
    parts.push("```" + fence, result.bodyText, "```");
    if (result.truncated) {
      parts.push("", "_Response truncated. Narrow the query with parameters to see the rest._");
    }
  }

  if (config.readOnly) {
    parts.push("", "_PANCAKE_READ_ONLY is set: only GET endpoints can be called._");
  }

  return parts.join("\n");
}
