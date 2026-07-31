import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServerInfo {
  url: string;
  description?: string;
}

export interface EndpointInfo {
  /** Stable identifier, e.g. "GET /pages/{page_id}/conversations". */
  id: string;
  method: string; // upper-case HTTP verb
  path: string;
  tag: string;
  summary?: string;
  description?: string;
  servers: ServerInfo[];
  /** Raw OpenAPI operation object. */
  operation: any;
}

export interface WebhookInfo {
  /** Event name, e.g. "messaging". */
  event: string;
  summary?: string;
  description?: string;
  /** Payload schema (possibly a $ref) from requestBody. */
  schema?: any;
  /** Example payload, if present. */
  example?: any;
  operation: any;
}

export interface GuideInfo {
  id: string;
  title: string;
  content: string;
  source: "rest" | "webhook";
}

export interface SpecIndex {
  endpoints: EndpointInfo[];
  webhooks: WebhookInfo[];
  guides: GuideInfo[];
  /** component schemas from the REST spec. */
  restSchemas: Record<string, any>;
  /** component schemas from the webhook spec. */
  webhookSchemas: Record<string, any>;
  servers: ServerInfo[];
  restInfo: any;
  webhookInfo: any;
}

const HTTP_METHODS = ["get", "post", "put", "delete", "patch"] as const;

// ---------------------------------------------------------------------------
// Spec file location
// ---------------------------------------------------------------------------

/**
 * Locate the bundled `spec/` directory by walking up from this module. Works
 * both when running compiled code (dist/spec/loader.js) and the TS source,
 * because `spec/` always lives at the package root next to `dist/`.
 */
function findSpecDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, "spec", "openapi.yaml");
    if (existsSync(candidate)) return join(dir, "spec");
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    "Could not locate the bundled spec/ directory (spec/openapi.yaml not found)."
  );
}

function loadYaml(specDir: string, file: string): any {
  const raw = readFileSync(join(specDir, file), "utf8");
  return yaml.load(raw) as any;
}

// ---------------------------------------------------------------------------
// Guide extraction (split the `info.description` markdown on level-2 headings)
// ---------------------------------------------------------------------------

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function splitGuides(markdown: string, source: "rest" | "webhook"): GuideInfo[] {
  if (!markdown) return [];
  const lines = markdown.split("\n");
  const sections: { title: string; lines: string[] }[] = [];
  let current = { title: "Overview", lines: [] as string[] };

  for (const line of lines) {
    // Level-2 heading only: "## Title" but not "### Title".
    const match = /^##\s+(.+?)\s*$/.exec(line);
    if (match) {
      if (current.lines.join("").trim()) sections.push(current);
      current = { title: match[1].trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.join("").trim()) sections.push(current);

  const seen = new Map<string, number>();
  return sections.map((section) => {
    let id = slugify(section.title) || "section";
    const count = seen.get(id) ?? 0;
    seen.set(id, count + 1);
    if (count > 0) id = `${id}-${count + 1}`;
    return {
      id,
      title: section.title,
      content: section.lines.join("\n").trim(),
      source,
    };
  });
}

/** Ensure guide ids are unique across specs; collisions get a source/number suffix. */
function dedupeGuideIds(guides: GuideInfo[]): GuideInfo[] {
  const seen = new Map<string, number>();
  return guides.map((guide) => {
    const count = seen.get(guide.id) ?? 0;
    seen.set(guide.id, count + 1);
    if (count === 0) return guide;
    const suffix = guide.source === "webhook" ? "webhook" : "rest";
    let id = `${guide.id}-${suffix}`;
    if (seen.has(id)) id = `${guide.id}-${count + 1}`;
    seen.set(id, 1);
    return { ...guide, id };
  });
}

// ---------------------------------------------------------------------------
// Index build (memoized)
// ---------------------------------------------------------------------------

let cached: SpecIndex | null = null;

export function loadSpecIndex(): SpecIndex {
  if (cached) return cached;

  const specDir = findSpecDir();
  const rest = loadYaml(specDir, "openapi.yaml");
  const webhook = loadYaml(specDir, "webhook.yaml");

  const servers: ServerInfo[] = rest.servers ?? [];

  // --- Endpoints ---
  const endpoints: EndpointInfo[] = [];
  const paths = rest.paths ?? {};
  for (const [path, pathItem] of Object.entries<any>(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;
      endpoints.push({
        id: `${method.toUpperCase()} ${path}`,
        method: method.toUpperCase(),
        path,
        tag: operation.tags?.[0] ?? "General",
        summary: operation.summary,
        description: operation.description,
        servers: operation.servers ?? servers,
        operation,
      });
    }
  }

  // --- Webhooks ---
  const webhooks: WebhookInfo[] = [];
  const webhookDefs = webhook.webhooks ?? webhook.paths ?? {};
  for (const [event, def] of Object.entries<any>(webhookDefs)) {
    if (!def || typeof def !== "object") continue;
    const operation = def.post ?? def[HTTP_METHODS.find((m) => def[m]) ?? "post"];
    if (!operation) continue;
    const jsonBody =
      operation.requestBody?.content?.["application/json"] ?? undefined;
    webhooks.push({
      event,
      summary: operation.summary,
      description: operation.description,
      schema: jsonBody?.schema,
      example: jsonBody?.example,
      operation,
    });
  }

  // --- Guides --- (ids must be globally unique across both specs)
  const guides = dedupeGuideIds([
    ...splitGuides(rest.info?.description ?? "", "rest"),
    ...splitGuides(webhook.info?.description ?? "", "webhook"),
  ]);

  cached = {
    endpoints,
    webhooks,
    guides,
    restSchemas: rest.components?.schemas ?? {},
    webhookSchemas: webhook.components?.schemas ?? {},
    servers,
    restInfo: rest.info ?? {},
    webhookInfo: webhook.info ?? {},
  };
  return cached;
}

// ---------------------------------------------------------------------------
// $ref resolution
// ---------------------------------------------------------------------------

/** Resolve a local component ref like "#/components/schemas/Conversation". */
export function resolveRef(
  ref: string,
  schemas: Record<string, any>
): any | undefined {
  const match = /^#\/components\/schemas\/(.+)$/.exec(ref);
  if (!match) return undefined;
  return schemas[match[1]];
}

/** Name of the schema a $ref points at, for display. */
export function refName(ref: string): string | undefined {
  const match = /^#\/components\/schemas\/(.+)$/.exec(ref);
  return match?.[1];
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function findEndpoint(
  index: SpecIndex,
  id: string
): EndpointInfo | undefined {
  const target = normalize(id);
  // Exact "METHOD /path" match first.
  let hit = index.endpoints.find((e) => normalize(e.id) === target);
  if (hit) return hit;
  // Fall back to path-only match (ignoring the verb).
  const pathOnly = target.replace(/^(get|post|put|delete|patch)\s+/, "");
  hit = index.endpoints.find((e) => normalize(e.path) === pathOnly);
  if (hit) return hit;
  // Last resort: summary match.
  return index.endpoints.find(
    (e) => e.summary && normalize(e.summary) === target
  );
}

/** securityScheme names referenced by an operation, e.g. ["PageAccessToken"]. */
export function operationSecuritySchemes(operation: any): string[] {
  const names = new Set<string>();
  for (const entry of operation?.security ?? []) {
    for (const key of Object.keys(entry ?? {})) names.add(key);
  }
  return [...names];
}

export function findWebhook(
  index: SpecIndex,
  event: string
): WebhookInfo | undefined {
  const target = normalize(event);
  return index.webhooks.find((w) => normalize(w.event) === target);
}

export function findGuide(index: SpecIndex, id: string): GuideInfo | undefined {
  const target = normalize(id);
  return (
    index.guides.find((g) => normalize(g.id) === target) ??
    index.guides.find((g) => normalize(g.title) === target)
  );
}
