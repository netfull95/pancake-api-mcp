# pancake-api-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that serves the **Pancake API documentation** to your AI assistant.

Point Claude Desktop, Cursor, or any MCP client at this server and your AI can **read the Pancake docs on its own** — search endpoints, pull a single endpoint's full contract (parameters, request body, response schema with every `$ref` expanded), inspect webhook payloads, and read the authentication / rate-limit / webhook-setup guides — without you copy-pasting anything.

The docs are bundled as a static snapshot of the official OpenAPI spec, so documentation lookups are self-contained and offline.

Optionally, [configure your access tokens](#configure-your-access-tokens-optional) in the server's environment and the `call_endpoint` tool can also **call the live Pancake API** for you — the right token (`access_token` or `page_access_token`) is picked from each endpoint's OpenAPI security scheme and attached automatically. Without tokens the server stays fully offline and documentation-only.

## What's inside

- **31 REST endpoints** across Pages, Conversations, Messages, Statistics, Customers, Posts, Tags, Users, Call logs, Export Data, Page's Contents, and Chat Plugin.
- **5 webhook events**: `messaging`, `conversation`, `post`, `subscription`, `connect_status` — each with its full payload schema and an example.
- **11 guides**: authentication & tokens, rate limits, the recommended API usage flow, webhook setup, event types, suspension rules, and best practices.

## Tools

| Tool | Input | Returns |
|---|---|---|
| `search_docs` | `query`, `area?` (`endpoint` \| `webhook` \| `guide` \| `schema` \| `all`), `limit?` | Ranked matches with type, id, and a snippet — start here to discover things |
| `list_endpoints` | `tag?`, `keyword?` | REST endpoints grouped by tag (id, method, path, summary) |
| `get_endpoint` | `id` (e.g. `"GET /pages/{page_id}/conversations"`) | Full endpoint contract as markdown |
| `list_webhooks` | — | All webhook events with summaries |
| `get_webhook` | `event` (e.g. `messaging`) | Webhook payload schema + example |
| `list_guides` | — | Guide section ids + titles |
| `get_guide` | `id` (e.g. `authentication`) | Full guide section |
| `auth_status` | — | Which tokens are configured (masked), plus the other env settings |
| `call_endpoint` | `id`, `params?`, `body?` | **Live call** to the Pancake API — status + response body |

Every endpoint, webhook, and guide is also exposed as an MCP **resource** (`pancake-api://endpoint/...`, `pancake-api://webhook/...`, `pancake-api://guide/...`) for clients that browse resources.

## Install

Requires Node.js 18+.

```bash
git clone https://github.com/<your-org>/pancake-api-mcp.git
cd pancake-api-mcp
npm install
npm run build
```

This produces `dist/index.js`, the server entry point.

## Configure your access tokens (optional)

Pancake uses two token types, both passed as a query parameter. Set them as environment variables of the MCP server and `call_endpoint` will attach the right one per endpoint — you never paste a token into a chat, and tokens are never accepted as tool input.

| Variable | Query param | Needed for | How to get it |
|---|---|---|---|
| `PANCAKE_USER_ACCESS_TOKEN` | `access_token` | 2 account-level endpoints under `https://pages.fm/api/v1` (list pages, generate a page token) | Pancake → **Account → Personal settings → API Access Token**. Valid up to 90 days. |
| `PANCAKE_PAGE_ACCESS_TOKEN` | `page_access_token` | 24 page-level endpoints under `https://pages.fm/api/public_api/v1\|v2` (conversations, messages, statistics, customers…) | Page → **Settings → Tools**, or `POST /pages/{page_id}/generate_page_access_token`. Does not expire. |

Optional extras:

| Variable | Default | Effect |
|---|---|---|
| `PANCAKE_PAGE_ID` | — | Default value for `page_id`, so you don't repeat it on every call |
| `PANCAKE_READ_ONLY` | `false` | When `true`, `call_endpoint` accepts **GET only** and refuses every write |
| `PANCAKE_TIMEOUT_MS` | `30000` | Timeout for live API calls |

Ask your assistant to run **`auth_status`** to verify the setup — it reports which variables are set without revealing their values.

> **Writes are enabled by default.** With a page token configured, `call_endpoint` can really send messages to customers, change tags, and delete data. Set `PANCAKE_READ_ONLY=true` if you only want the assistant to read. Tokens are read from the environment only, redacted from every tool response and error message, and never written to logs.

## Connect it to your AI client

### Claude Desktop

Edit your `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "pancake-api": {
      "command": "node",
      "args": ["/absolute/path/to/pancake-api-mcp/dist/index.js"],
      "env": {
        "PANCAKE_USER_ACCESS_TOKEN": "your-user-access-token",
        "PANCAKE_PAGE_ACCESS_TOKEN": "your-page-access-token",
        "PANCAKE_PAGE_ID": "optional-default-page-id"
      }
    }
  }
}
```

Drop the `env` block entirely to run in offline documentation-only mode.

Restart Claude Desktop. You should see the `pancake-api` tools appear.

### Cursor

In **Settings → MCP → Add new global MCP server** (or edit `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "pancake-api": {
      "command": "node",
      "args": ["/absolute/path/to/pancake-api-mcp/dist/index.js"],
      "env": {
        "PANCAKE_PAGE_ACCESS_TOKEN": "your-page-access-token"
      }
    }
  }
}
```

Replace `/absolute/path/to/pancake-api-mcp` with the real path where you cloned this repo.

## Try it

Once connected, ask your AI things like:

- *"Using the Pancake docs, how do I authenticate?"*
- *"What endpoint lists conversations for a page, and what parameters does it take?"*
- *"Show me the payload of the `messaging` webhook."*
- *"Search the Pancake docs for anything about tags."*

And, with tokens configured:

- *"Check my Pancake token setup."* (`auth_status`)
- *"List the last 60 conversations of page 12345."* (`call_endpoint`)
- *"Send 'thanks for your order' to conversation X."* (a write — confirm before you say yes)

## Development

```bash
npm run build     # compile TypeScript to dist/
npm run dev       # tsc --watch
npm run inspect   # open the MCP Inspector against the built server
npm run sync-spec # (maintainer) refresh spec/ from ../pancake_api_doc/openapi
```

### Updating the bundled docs

The OpenAPI snapshot lives in `spec/openapi.yaml` and `spec/webhook.yaml`. A maintainer refreshes them from the source docs project with:

```bash
npm run sync-spec                        # assumes ../pancake_api_doc alongside this repo
npm run sync-spec -- /path/to/pancake_api_doc   # or pass the docs repo explicitly
npm run build
```

## License

MIT — see [LICENSE](LICENSE).
