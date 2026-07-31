#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {
  searchDocsSchema,
  searchDocsDescription,
  searchDocsTool,
} from "./tools/search-docs.js";
import {
  listEndpointsSchema,
  listEndpointsDescription,
  listEndpointsTool,
} from "./tools/list-endpoints.js";
import {
  getEndpointSchema,
  getEndpointDescription,
  getEndpointTool,
} from "./tools/get-endpoint.js";
import {
  listWebhooksSchema,
  listWebhooksDescription,
  listWebhooksTool,
} from "./tools/list-webhooks.js";
import {
  getWebhookSchema,
  getWebhookDescription,
  getWebhookTool,
} from "./tools/get-webhook.js";
import {
  listGuidesSchema,
  listGuidesDescription,
  listGuidesTool,
} from "./tools/list-guides.js";
import {
  getGuideSchema,
  getGuideDescription,
  getGuideTool,
} from "./tools/get-guide.js";
import {
  callEndpointSchema,
  callEndpointDescription,
  callEndpointTool,
} from "./tools/call-endpoint.js";
import { authStatusDescription, authStatusTool } from "./tools/auth-status.js";
import { registerResources } from "./resources.js";
import { getConfig, TOKEN_SPECS, tokenForScheme } from "./config.js";

const server = new McpServer({
  name: "pancake-api-mcp",
  version: "1.0.0",
});

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

server.registerTool(
  "search_docs",
  { description: searchDocsDescription, inputSchema: searchDocsSchema.shape },
  async (args) => text(searchDocsTool(args))
);

server.registerTool(
  "list_endpoints",
  { description: listEndpointsDescription, inputSchema: listEndpointsSchema.shape },
  async (args) => text(listEndpointsTool(args))
);

server.registerTool(
  "get_endpoint",
  { description: getEndpointDescription, inputSchema: getEndpointSchema.shape },
  async (args) => text(getEndpointTool(args))
);

server.registerTool(
  "list_webhooks",
  { description: listWebhooksDescription, inputSchema: listWebhooksSchema.shape },
  async () => text(listWebhooksTool())
);

server.registerTool(
  "get_webhook",
  { description: getWebhookDescription, inputSchema: getWebhookSchema.shape },
  async (args) => text(getWebhookTool(args))
);

server.registerTool(
  "list_guides",
  { description: listGuidesDescription, inputSchema: listGuidesSchema.shape },
  async () => text(listGuidesTool())
);

server.registerTool(
  "get_guide",
  { description: getGuideDescription, inputSchema: getGuideSchema.shape },
  async (args) => text(getGuideTool(args))
);

server.registerTool(
  "auth_status",
  { description: authStatusDescription, inputSchema: {} },
  async () => text(authStatusTool())
);

server.registerTool(
  "call_endpoint",
  { description: callEndpointDescription, inputSchema: callEndpointSchema.shape },
  async (args) => text(await callEndpointTool(args as any))
);

registerResources(server);

/** One stderr line summarising token config, so misconfiguration is obvious. */
function describeTokens(): string {
  const config = getConfig();
  const parts = Object.values(TOKEN_SPECS).map(
    (spec) => `${spec.param}: ${tokenForScheme(spec.scheme, config) ? "set" : "not set"}`
  );
  if (config.readOnly) parts.push("read-only");
  return parts.join(", ");
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr so we don't corrupt the stdio JSON-RPC stream.
  console.error(
    `pancake-api-mcp server running on stdio (${describeTokens()})`
  );
}

main().catch((error) => {
  console.error("Fatal error starting pancake-api-mcp:", error);
  process.exit(1);
});
