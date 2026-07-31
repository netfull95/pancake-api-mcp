import { z } from "zod";
import { loadSpecIndex } from "../spec/loader.js";

export const listWebhooksSchema = z.object({});

export const listWebhooksDescription = `List all Pancake webhook events.

Returns each event's name and summary. Pass an event name to get_webhook for the full payload schema and an example. Webhooks are HTTP POST notifications Pancake sends to your registered endpoint in real time.`;

export type ListWebhooksInput = z.infer<typeof listWebhooksSchema>;

export function listWebhooksTool(): string {
  const index = loadSpecIndex();
  if (!index.webhooks.length) return "No webhook events are documented.";

  const lines: string[] = [`Pancake webhook events — ${index.webhooks.length}:`, ""];
  for (const w of index.webhooks) {
    lines.push(`- \`${w.event}\`${w.summary ? ` — ${w.summary}` : ""}`);
  }
  lines.push("", "Use get_webhook with an event name for the payload schema and example.");
  return lines.join("\n");
}
