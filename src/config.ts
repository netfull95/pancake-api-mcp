/**
 * Runtime configuration read from the environment.
 *
 * The documentation half of this server is fully offline. Tokens are only
 * needed by `call_endpoint`, which talks to the live Pancake API. They are
 * read from the process environment (set them in your MCP client config) and
 * never accepted as tool input, so a model cannot exfiltrate them.
 */

export interface TokenSpec {
  /** securityScheme name in spec/openapi.yaml. */
  scheme: string;
  /** Query parameter the token is passed as. */
  param: string;
  /** Environment variable holding the token. */
  env: string;
  /** Short note used in status / error messages. */
  covers: string;
}

/** The two Pancake token types, keyed by their OpenAPI securityScheme name. */
export const TOKEN_SPECS: Record<string, TokenSpec> = {
  UserAccessToken: {
    scheme: "UserAccessToken",
    param: "access_token",
    env: "PANCAKE_USER_ACCESS_TOKEN",
    covers: "account-level APIs under https://pages.fm/api/v1",
  },
  PageAccessToken: {
    scheme: "PageAccessToken",
    param: "page_access_token",
    env: "PANCAKE_PAGE_ACCESS_TOKEN",
    covers: "page-level APIs under https://pages.fm/api/public_api/v1|v2",
  },
};

export interface Config {
  userAccessToken?: string;
  pageAccessToken?: string;
  /** Optional default for the `page_id` parameter. */
  defaultPageId?: string;
  /** When true, call_endpoint refuses anything other than GET. */
  readOnly: boolean;
  /** Request timeout for live API calls, in milliseconds. */
  timeoutMs: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

function trimmed(value: string | undefined): string | undefined {
  const result = value?.trim();
  return result ? result : undefined;
}

function boolEnv(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

/** Read the current environment. Not memoized — env can change per call. */
export function getConfig(): Config {
  const timeout = Number(process.env.PANCAKE_TIMEOUT_MS);
  return {
    userAccessToken: trimmed(process.env.PANCAKE_USER_ACCESS_TOKEN),
    pageAccessToken: trimmed(process.env.PANCAKE_PAGE_ACCESS_TOKEN),
    defaultPageId: trimmed(process.env.PANCAKE_PAGE_ID),
    readOnly: boolEnv(process.env.PANCAKE_READ_ONLY),
    timeoutMs:
      Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
  };
}

/** The configured token value for a securityScheme name, if any. */
export function tokenForScheme(
  scheme: string,
  config: Config = getConfig()
): string | undefined {
  if (scheme === "UserAccessToken") return config.userAccessToken;
  if (scheme === "PageAccessToken") return config.pageAccessToken;
  return undefined;
}

/** `abcd…wxyz` — enough to recognise a token without revealing it. */
export function maskToken(token: string): string {
  if (token.length <= 12) return "*".repeat(token.length);
  return `${token.slice(0, 4)}…${token.slice(-4)} (${token.length} chars)`;
}

/**
 * Replace every configured token value in `text` with its env-var name, so
 * tokens never leak into tool output, logs, or error messages.
 */
export function redact(text: string, config: Config = getConfig()): string {
  let result = text;
  for (const spec of Object.values(TOKEN_SPECS)) {
    const token = tokenForScheme(spec.scheme, config);
    if (token) result = result.split(token).join(`$${spec.env}`);
  }
  return result;
}
