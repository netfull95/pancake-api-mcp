import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadSpecIndex } from "./spec/loader.js";
import {
  renderEndpoint,
  renderGuide,
  renderWebhook,
} from "./render/markdown.js";

/**
 * Register every documentation page as a fixed MCP resource so browsing
 * clients can list and read them directly. Each resource closes over its
 * rendered content, so no URI parsing is needed on read.
 */
export function registerResources(server: McpServer): void {
  const index = loadSpecIndex();

  for (const endpoint of index.endpoints) {
    const uri = `pancake-api://endpoint/${encodeURIComponent(endpoint.id)}`;
    server.registerResource(
      `Endpoint: ${endpoint.id}`,
      uri,
      {
        description: endpoint.summary ?? endpoint.id,
        mimeType: "text/markdown",
      },
      async () => ({
        contents: [
          {
            uri,
            mimeType: "text/markdown",
            text: renderEndpoint(endpoint, index.restSchemas),
          },
        ],
      })
    );
  }

  for (const webhook of index.webhooks) {
    const uri = `pancake-api://webhook/${encodeURIComponent(webhook.event)}`;
    server.registerResource(
      `Webhook: ${webhook.event}`,
      uri,
      {
        description: webhook.summary ?? `Webhook event: ${webhook.event}`,
        mimeType: "text/markdown",
      },
      async () => ({
        contents: [
          {
            uri,
            mimeType: "text/markdown",
            text: renderWebhook(webhook, index.webhookSchemas),
          },
        ],
      })
    );
  }

  for (const guide of index.guides) {
    const uri = `pancake-api://guide/${encodeURIComponent(guide.id)}`;
    server.registerResource(
      `Guide: ${guide.title}`,
      uri,
      {
        description: guide.title,
        mimeType: "text/markdown",
      },
      async () => ({
        contents: [
          {
            uri,
            mimeType: "text/markdown",
            text: renderGuide(guide),
          },
        ],
      })
    );
  }
}
