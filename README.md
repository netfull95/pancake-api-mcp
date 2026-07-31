# pancake-api-mcp

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that serves the **Pancake API documentation** to your AI assistant.

Point Claude Desktop, Cursor, or any MCP client at this server and your AI can **read the Pancake docs on its own** — search endpoints, pull a single endpoint's full contract (parameters, request body, response schema with every `$ref` expanded), inspect webhook payloads, and read the authentication / rate-limit / webhook-setup guides — without you copy-pasting anything.

The docs are bundled as a static snapshot of the official OpenAPI spec, so the server is self-contained and offline. It is **read-only**: it never calls the live Pancake API and never handles your access tokens.

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
      "args": ["/absolute/path/to/pancake-api-mcp/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop. You should see the `pancake-api` tools appear.

### Cursor

In **Settings → MCP → Add new global MCP server** (or edit `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "pancake-api": {
      "command": "node",
      "args": ["/absolute/path/to/pancake-api-mcp/dist/index.js"]
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
