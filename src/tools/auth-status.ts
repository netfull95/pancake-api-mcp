import { getConfig, maskToken, tokenForScheme, TOKEN_SPECS } from "../config.js";
import { loadSpecIndex, operationSecuritySchemes } from "../spec/loader.js";

export const authStatusDescription = `Report which Pancake access tokens are configured in this MCP server's environment.

Shows, for each token type (\`access_token\` / \`page_access_token\`), the environment variable it comes from, whether it is set (the value itself is never revealed), and how many documented endpoints it unlocks. Use this before call_endpoint, or to diagnose a 401.`;

export function authStatusTool(): string {
  const config = getConfig();
  const index = loadSpecIndex();

  // Count endpoints per security scheme so the status shows real coverage.
  const counts = new Map<string, number>();
  for (const endpoint of index.endpoints) {
    for (const scheme of operationSecuritySchemes(endpoint.operation)) {
      counts.set(scheme, (counts.get(scheme) ?? 0) + 1);
    }
  }

  const rows = Object.values(TOKEN_SPECS).map((spec) => {
    const token = tokenForScheme(spec.scheme, config);
    const state = token ? `set — \`${maskToken(token)}\`` : "**not set**";
    return `| \`${spec.param}\` | \`${spec.env}\` | ${state} | ${counts.get(spec.scheme) ?? 0} |`;
  });

  const parts: string[] = [
    "# Pancake token configuration",
    "",
    "| Token | Environment variable | Status | Endpoints |",
    "|-------|----------------------|--------|-----------|",
    ...rows,
    "",
    "## Other settings",
    "",
    `- \`PANCAKE_PAGE_ID\` — ${config.defaultPageId ? `\`${config.defaultPageId}\` (used when \`page_id\` is omitted)` : "not set (pass `page_id` explicitly)"}`,
    `- \`PANCAKE_READ_ONLY\` — ${config.readOnly ? "**on** — call_endpoint accepts GET only" : "off — all methods allowed, including writes"}`,
    `- \`PANCAKE_TIMEOUT_MS\` — ${config.timeoutMs}ms`,
  ];

  const missing = Object.values(TOKEN_SPECS).filter(
    (spec) => !tokenForScheme(spec.scheme, config)
  );
  if (missing.length) {
    parts.push(
      "",
      "## Missing tokens",
      "",
      ...missing.map(
        (spec) => `- \`${spec.env}\` — needed for ${spec.covers}. Add it to the \`env\` block of this server in the MCP client config, then restart the client.`
      ),
      "",
      "See the `authentication` guide (get_guide) for how to obtain each token."
    );
  }

  if (!missing.length) {
    parts.push("", "Both tokens are configured — call_endpoint can reach every documented endpoint.");
  }

  return parts.join("\n");
}
