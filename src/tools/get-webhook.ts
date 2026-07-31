import { z } from "zod";
import { findWebhook, loadSpecIndex } from "../spec/loader.js";
import { renderWebhook } from "../render/markdown.js";

export const getWebhookSchema = z.object({
  event: z
    .string()
    .min(1)
    .describe("Webhook event name, e.g. 'messaging', 'conversation', 'subscription', 'post', 'connect_status'."),
});

export const getWebhookDescription = `Get the full payload schema and an example for a single Pancake webhook event.

Returns the event's description, the payload structure ($ref schemas expanded into a readable field list), and a sample JSON body. Pass an event name from list_webhooks or search_docs.`;

export type GetWebhookInput = z.infer<typeof getWebhookSchema>;

export function getWebhookTool(input: GetWebhookInput): string {
  const index = loadSpecIndex();
  const webhook = findWebhook(index, input.event);
  if (!webhook) {
    const known = index.webhooks.map((w) => w.event).join(", ");
    return `No webhook event "${input.event}". Known events: ${known}. Use list_webhooks to browse.`;
  }
  return renderWebhook(webhook, index.webhookSchemas);
}
