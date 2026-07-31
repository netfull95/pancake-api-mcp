/**
 * Live Pancake API client used by the `call_endpoint` tool.
 *
 * Everything is driven by the bundled OpenAPI spec: the base URL, which
 * parameters go in the path / query / headers, and which token the endpoint
 * authenticates with. Tokens come from the environment only (see config.ts)
 * and are redacted from every string this module returns.
 */

import {
  getConfig,
  redact,
  tokenForScheme,
  TOKEN_SPECS,
  type Config,
} from "../config.js";
import { operationSecuritySchemes, type EndpointInfo } from "../spec/loader.js";

export interface CallOptions {
  /** Path / query / header parameter values, keyed by parameter name. */
  params?: Record<string, unknown>;
  /** JSON request body for POST / PUT / PATCH / DELETE. */
  body?: unknown;
}

export interface CallResult {
  method: string;
  /** Request URL with token values replaced by their env-var names. */
  url: string;
  status: number;
  statusText: string;
  ok: boolean;
  contentType?: string;
  /** Response body, pretty-printed if JSON. Redacted. */
  bodyText: string;
  /** True when the body was cut to MAX_BODY_CHARS. */
  truncated: boolean;
  durationMs: number;
}

/** Thrown for problems we can explain before any network call happens. */
export class CallError extends Error {}

const MAX_BODY_CHARS = 20_000;

function stringifyParam(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Split caller-supplied params by their declared `in` location. Parameters the
 * spec doesn't declare are sent as query params — the spec is a snapshot and
 * may lag behind the live API.
 */
function buildRequestParts(
  endpoint: EndpointInfo,
  params: Record<string, unknown>,
  config: Config
): { path: Record<string, string>; query: [string, string][]; headers: Record<string, string> } {
  const declared: Record<string, string> = {};
  for (const p of endpoint.operation.parameters ?? []) {
    if (p?.name) declared[p.name] = p.in ?? "query";
  }

  const path: Record<string, string> = {};
  const query: [string, string][] = [];
  const headers: Record<string, string> = {};

  for (const [name, raw] of Object.entries(params)) {
    if (raw === undefined || raw === null) continue;
    const location = declared[name] ?? "query";
    if (location === "path") {
      path[name] = stringifyParam(raw);
    } else if (location === "header") {
      headers[name] = stringifyParam(raw);
    } else if (Array.isArray(raw)) {
      // Repeat the key for array values (e.g. ?tags=a&tags=b).
      for (const item of raw) query.push([name, stringifyParam(item)]);
    } else {
      query.push([name, stringifyParam(raw)]);
    }
  }

  // `page_id` appears in nearly every path; allow a default from the env.
  if (config.defaultPageId) {
    const needsPathPageId =
      endpoint.path.includes("{page_id}") && !path.page_id;
    if (needsPathPageId) path.page_id = config.defaultPageId;
    const declaresQueryPageId = declared.page_id === "query";
    if (
      declaresQueryPageId &&
      !query.some(([key]) => key === "page_id")
    ) {
      query.push(["page_id", config.defaultPageId]);
    }
  }

  return { path, query, headers };
}

/** Substitute `{name}` placeholders, failing loudly on anything left over. */
function fillPath(template: string, values: Record<string, string>): string {
  const missing: string[] = [];
  const filled = template.replace(/\{([^}]+)\}/g, (_match, name: string) => {
    const value = values[name];
    if (value === undefined || value === "") {
      missing.push(name);
      return `{${name}}`;
    }
    return encodeURIComponent(value);
  });
  if (missing.length) {
    throw new CallError(
      `Missing required path parameter(s): ${missing.join(", ")}. Pass them in "params"${
        missing.includes("page_id") ? ', or set PANCAKE_PAGE_ID in the server env' : ""
      }.`
    );
  }
  return filled;
}

/**
 * Add the token this endpoint authenticates with. An explicit value in
 * `params` wins, so a caller can override the env token per request.
 */
function applyAuth(
  endpoint: EndpointInfo,
  query: [string, string][],
  config: Config
): void {
  const schemes = operationSecuritySchemes(endpoint.operation);
  if (!schemes.length) return;

  const alreadySet = (param: string) => query.some(([key]) => key === param);
  const tried: string[] = [];

  for (const scheme of schemes) {
    const spec = TOKEN_SPECS[scheme];
    if (!spec) continue;
    if (alreadySet(spec.param)) return;
    const token = tokenForScheme(scheme, config);
    if (token) {
      query.push([spec.param, token]);
      return;
    }
    tried.push(`${spec.env} (for ${spec.param})`);
  }

  if (tried.length) {
    throw new CallError(
      `No token configured for this endpoint. Set ${tried.join(" or ")} in the MCP server environment, or pass the token explicitly in "params". Run auth_status to see what is configured.`
    );
  }
}

/** Full request URL, tokens included. Never return this to the model unredacted. */
export function buildUrl(
  endpoint: EndpointInfo,
  options: CallOptions = {},
  config: Config = getConfig()
): { url: string; headers: Record<string, string> } {
  const server = endpoint.servers[0];
  if (!server?.url) {
    throw new CallError(
      `No base URL is documented for ${endpoint.id}, so it cannot be called.`
    );
  }

  const { path, query, headers } = buildRequestParts(
    endpoint,
    options.params ?? {},
    config
  );
  applyAuth(endpoint, query, config);

  const filledPath = fillPath(endpoint.path, path);
  const url = new URL(server.url.replace(/\/+$/, "") + filledPath);
  for (const [key, value] of query) url.searchParams.append(key, value);

  return { url: url.toString(), headers };
}

function bodyAccepted(method: string): boolean {
  return method !== "GET" && method !== "HEAD";
}

/** Execute a documented endpoint against the live Pancake API. */
export async function callEndpoint(
  endpoint: EndpointInfo,
  options: CallOptions = {}
): Promise<CallResult> {
  const config = getConfig();
  const method = endpoint.method;

  if (config.readOnly && method !== "GET") {
    throw new CallError(
      `PANCAKE_READ_ONLY is set, so only GET endpoints may be called. ${endpoint.id} is a ${method}. Unset PANCAKE_READ_ONLY to allow write calls.`
    );
  }

  const { url, headers } = buildUrl(endpoint, options, config);
  const requestHeaders: Record<string, string> = { accept: "application/json", ...headers };

  let payload: string | undefined;
  if (options.body !== undefined) {
    if (!bodyAccepted(method)) {
      throw new CallError(`${method} ${endpoint.path} does not take a request body.`);
    }
    payload = JSON.stringify(options.body);
    requestHeaders["content-type"] = "application/json";
  }

  const started = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: payload,
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch (error: any) {
    const reason =
      error?.name === "TimeoutError" || error?.name === "AbortError"
        ? `Request timed out after ${config.timeoutMs}ms (raise PANCAKE_TIMEOUT_MS to allow longer).`
        : redact(String(error?.message ?? error), config);
    throw new CallError(`Request to ${redact(url, config)} failed: ${reason}`);
  }
  const durationMs = Date.now() - started;

  const contentType = response.headers.get("content-type") ?? undefined;
  const raw = await response.text();
  let bodyText = raw;
  if (contentType?.includes("json")) {
    try {
      bodyText = JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      // Not valid JSON despite the header — keep the raw text.
    }
  }

  const truncated = bodyText.length > MAX_BODY_CHARS;
  if (truncated) bodyText = bodyText.slice(0, MAX_BODY_CHARS);

  return {
    method,
    url: redact(url, config),
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    contentType,
    bodyText: redact(bodyText, config),
    truncated,
    durationMs,
  };
}
