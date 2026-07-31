import {
  EndpointInfo,
  GuideInfo,
  WebhookInfo,
  refName,
  resolveRef,
} from "../spec/loader.js";

// How deep to expand nested schema properties before summarising. Cycles are
// always cut by the `seen` set; this simply keeps very large payloads readable.
const MAX_DEPTH = 6;

interface Ctx {
  schemas: Record<string, any>;
  out: string[];
}

function push(ctx: Ctx, indent: number, text: string): void {
  ctx.out.push("  ".repeat(indent) + text);
}

/** Collapse a multi-line description into a single trimmed line. */
function clean(text?: string): string {
  if (!text) return "";
  return text.replace(/\s+/g, " ").trim();
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n+/g, " ");
}

/** Short human-readable type label for a schema node. */
function typeLabel(schema: any): string {
  if (!schema) return "any";
  if (schema.$ref) return refName(schema.$ref) ?? "object";
  if (schema.oneOf) return "oneOf";
  if (schema.anyOf) return "anyOf";
  if (schema.allOf) return "allOf";
  if (schema.type === "array") {
    return `array<${schema.items ? typeLabel(schema.items) : "any"}>`;
  }
  if (schema.type) {
    return schema.format ? `${schema.type}<${schema.format}>` : schema.type;
  }
  if (schema.properties || schema.additionalProperties) return "object";
  return "any";
}

function fieldFlags(schema: any, required: boolean): string {
  const flags: string[] = [];
  if (required) flags.push("required");
  if (schema?.nullable) flags.push("nullable");
  return flags.length ? ` _(${flags.join(", ")})_` : "";
}

function enumSuffix(schema: any): string {
  if (!schema?.enum) return "";
  return ` (enum: ${schema.enum.map((v: any) => `\`${v}\``).join(", ")})`;
}

function renderField(
  ctx: Ctx,
  name: string,
  schema: any,
  required: boolean,
  indent: number,
  seen: Set<string>,
  depth: number
): void {
  const desc = clean(schema?.description);
  push(
    ctx,
    indent,
    `- \`${name}\` \`${typeLabel(schema)}\`${fieldFlags(schema, required)}${enumSuffix(schema)}${desc ? ` — ${desc}` : ""}`
  );
  expandChildren(ctx, schema, indent + 1, seen, depth + 1);
}

function expandChildren(
  ctx: Ctx,
  schema: any,
  indent: number,
  seen: Set<string>,
  depth: number
): void {
  if (!schema) return;
  if (depth > MAX_DEPTH) {
    push(ctx, indent, "- _(nested fields omitted — max depth reached)_");
    return;
  }

  // $ref → resolve against the schema map, guarding against cycles.
  if (schema.$ref) {
    const name = refName(schema.$ref);
    if (name && seen.has(name)) {
      push(ctx, indent, `- _(recursive reference → ${name})_`);
      return;
    }
    const resolved = resolveRef(schema.$ref, ctx.schemas);
    if (!resolved) return;
    const nextSeen = new Set(seen);
    if (name) nextSeen.add(name);
    expandChildren(ctx, resolved, indent, nextSeen, depth + 1);
    return;
  }

  // Composed schemas.
  for (const key of ["oneOf", "anyOf", "allOf"] as const) {
    if (Array.isArray(schema[key])) {
      schema[key].forEach((variant: any, i: number) => {
        const label = variant.$ref
          ? refName(variant.$ref)
          : typeLabel(variant);
        const word = key === "allOf" ? "includes" : "option";
        push(ctx, indent, `- _${word}:_ \`${label}\``);
        expandChildren(ctx, variant, indent + 1, seen, depth + 1);
      });
      return;
    }
  }

  // Array → describe the item schema at the same indent.
  if (schema.type === "array" || schema.items) {
    if (schema.items) expandChildren(ctx, schema.items, indent, seen, depth);
    return;
  }

  // Object.
  const props = schema.properties ?? {};
  const required = new Set<string>(schema.required ?? []);
  for (const [propName, propSchema] of Object.entries<any>(props)) {
    renderField(ctx, propName, propSchema, required.has(propName), indent, seen, depth);
  }
  if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
    push(ctx, indent, "- `<key>` → map of:");
    expandChildren(ctx, schema.additionalProperties, indent + 1, seen, depth + 1);
  }
}

/** Render any schema (object, array, $ref or primitive) to a markdown list. */
export function renderSchema(schema: any, schemas: Record<string, any>): string {
  const ctx: Ctx = { schemas, out: [] };
  expandChildren(ctx, schema, 0, new Set(), 0);
  if (ctx.out.length === 0) {
    const desc = clean(schema?.description);
    return `Type: \`${typeLabel(schema)}\`${desc ? ` — ${desc}` : ""}`;
  }
  return ctx.out.join("\n");
}

// ---------------------------------------------------------------------------
// Endpoint
// ---------------------------------------------------------------------------

function securityNames(operation: any): string[] {
  const security = operation.security ?? [];
  const names = new Set<string>();
  for (const entry of security) {
    for (const key of Object.keys(entry ?? {})) names.add(key);
  }
  return [...names];
}

function renderParameters(operation: any): string {
  const params = operation.parameters ?? [];
  if (!params.length) return "";
  const rows = params.map((p: any) => {
    const type = p.schema ? typeLabel(p.schema) : "string";
    const req = p.required ? "yes" : "no";
    const desc = escapeCell(clean(p.description));
    return `| \`${p.name}\` | ${p.in} | \`${type}\` | ${req} | ${desc} |`;
  });
  return [
    "## Parameters",
    "",
    "| Name | In | Type | Required | Description |",
    "|------|----|------|----------|-------------|",
    ...rows,
  ].join("\n");
}

function renderRequestBody(
  operation: any,
  schemas: Record<string, any>
): string {
  const body = operation.requestBody;
  if (!body?.content) return "";
  const blocks: string[] = ["## Request body"];
  if (body.required) blocks.push("", "_Required._");
  for (const [mediaType, media] of Object.entries<any>(body.content)) {
    blocks.push("", `**Content-Type:** \`${mediaType}\``, "");
    blocks.push(media.schema ? renderSchema(media.schema, schemas) : "_(no schema)_");
    if (media.example !== undefined) {
      blocks.push("", "**Example:**", "```json", JSON.stringify(media.example, null, 2), "```");
    }
  }
  return blocks.join("\n");
}

function renderResponses(
  operation: any,
  schemas: Record<string, any>
): string {
  const responses = operation.responses ?? {};
  const blocks: string[] = ["## Responses"];
  for (const [status, response] of Object.entries<any>(responses)) {
    const desc = clean(response?.description);
    blocks.push("", `### \`${status}\`${desc ? ` — ${desc}` : ""}`);
    const json = response?.content?.["application/json"];
    if (json?.schema) {
      blocks.push("", renderSchema(json.schema, schemas));
    }
    if (json?.example !== undefined) {
      blocks.push("", "**Example:**", "```json", JSON.stringify(json.example, null, 2), "```");
    }
    const headers = response?.headers;
    if (headers && Object.keys(headers).length) {
      blocks.push("", "**Headers:**");
      for (const [h, def] of Object.entries<any>(headers)) {
        blocks.push(`- \`${h}\` — ${clean(def?.description)}`);
      }
    }
  }
  return blocks.join("\n");
}

export function renderEndpoint(
  endpoint: EndpointInfo,
  schemas: Record<string, any>
): string {
  const { operation } = endpoint;
  const parts: string[] = [`# ${endpoint.method} ${endpoint.path}`];

  if (endpoint.summary) parts.push("", `> ${endpoint.summary}`);

  // Full URLs (server base + path).
  if (endpoint.servers.length) {
    parts.push("", "**Base URL(s):**");
    for (const server of endpoint.servers) {
      const note = server.description ? ` — ${server.description}` : "";
      parts.push(`- \`${server.url}${endpoint.path}\`${note}`);
    }
  }

  const auth = securityNames(operation);
  parts.push(
    "",
    `**Authentication:** ${auth.length ? auth.map((a) => `\`${a}\``).join(", ") : "none"}`
  );

  if (endpoint.tag) parts.push(`**Tag:** ${endpoint.tag}`);

  if (endpoint.description) parts.push("", clean(endpoint.description));

  const params = renderParameters(operation);
  if (params) parts.push("", params);

  const requestBody = renderRequestBody(operation, schemas);
  if (requestBody) parts.push("", requestBody);

  parts.push("", renderResponses(operation, schemas));

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------

export function renderWebhook(
  webhook: WebhookInfo,
  schemas: Record<string, any>
): string {
  const parts: string[] = [`# Webhook: \`${webhook.event}\``];

  if (webhook.summary) parts.push("", `> ${webhook.summary}`);
  parts.push("", "Delivered as an HTTP `POST` to your registered endpoint. Return HTTP `200` to acknowledge receipt.");
  if (webhook.description) parts.push("", webhook.description.trim());

  parts.push("", "## Payload", "");
  parts.push(webhook.schema ? renderSchema(webhook.schema, schemas) : "_(no schema documented)_");

  if (webhook.example !== undefined) {
    parts.push("", "## Example payload", "```json", JSON.stringify(webhook.example, null, 2), "```");
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Guide
// ---------------------------------------------------------------------------

export function renderGuide(guide: GuideInfo): string {
  return `# ${guide.title}\n\n${guide.content}`;
}
