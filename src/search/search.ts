import { SpecIndex } from "../spec/loader.js";

export type SearchArea = "endpoint" | "webhook" | "guide" | "schema" | "all";

export interface SearchResult {
  type: "endpoint" | "webhook" | "guide" | "schema";
  id: string;
  title: string;
  snippet: string;
  score: number;
}

interface Document {
  type: SearchResult["type"];
  id: string;
  title: string;
  /** Weighted searchable text (title/id repeated for higher weight). */
  haystack: string;
  /** Longer text used to build the result snippet. */
  body: string;
}

function collectSchemaText(schema: any, depth = 0): string {
  if (!schema || depth > 4) return "";
  const parts: string[] = [];
  if (schema.description) parts.push(String(schema.description));
  if (schema.properties) {
    for (const [name, prop] of Object.entries<any>(schema.properties)) {
      parts.push(name);
      parts.push(collectSchemaText(prop, depth + 1));
    }
  }
  if (schema.items) parts.push(collectSchemaText(schema.items, depth + 1));
  return parts.join(" ");
}

function buildDocuments(index: SpecIndex, area: SearchArea): Document[] {
  const docs: Document[] = [];

  if (area === "endpoint" || area === "all") {
    for (const e of index.endpoints) {
      const paramText = (e.operation.parameters ?? [])
        .map((p: any) => `${p.name} ${p.description ?? ""}`)
        .join(" ");
      const title = e.summary ? `${e.summary} (${e.id})` : e.id;
      docs.push({
        type: "endpoint",
        id: e.id,
        title,
        haystack: `${e.id} ${e.id} ${e.summary ?? ""} ${e.tag} ${paramText} ${e.description ?? ""}`,
        body: e.description || e.summary || e.id,
      });
    }
  }

  if (area === "webhook" || area === "all") {
    for (const w of index.webhooks) {
      docs.push({
        type: "webhook",
        id: w.event,
        title: `${w.summary ?? w.event} (webhook: ${w.event})`,
        haystack: `${w.event} ${w.event} ${w.summary ?? ""} ${w.description ?? ""}`,
        body: w.description || w.summary || w.event,
      });
    }
  }

  if (area === "guide" || area === "all") {
    for (const g of index.guides) {
      docs.push({
        type: "guide",
        id: g.id,
        title: g.title,
        haystack: `${g.id} ${g.title} ${g.title} ${g.content}`,
        body: g.content,
      });
    }
  }

  if (area === "schema" || area === "all") {
    const maps: [string, Record<string, any>][] = [
      ["rest", index.restSchemas],
      ["webhook", index.webhookSchemas],
    ];
    for (const [source, schemas] of maps) {
      for (const [name, schema] of Object.entries(schemas)) {
        docs.push({
          type: "schema",
          id: name,
          title: `${name} (schema, ${source})`,
          haystack: `${name} ${name} ${collectSchemaText(schema)}`,
          body: schema?.description || collectSchemaText(schema),
        });
      }
    }
  }

  return docs;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length > 1);
}

function makeSnippet(body: string, tokens: string[]): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  const lower = flat.toLowerCase();
  let at = -1;
  for (const token of tokens) {
    const found = lower.indexOf(token);
    if (found !== -1) {
      at = found;
      break;
    }
  }
  const start = at === -1 ? 0 : Math.max(0, at - 40);
  const snippet = flat.slice(start, start + 200);
  return (start > 0 ? "…" : "") + snippet + (flat.length > start + 200 ? "…" : "");
}

export function searchDocs(
  index: SpecIndex,
  query: string,
  area: SearchArea = "all",
  limit = 10
): SearchResult[] {
  const tokens = tokenize(query);
  if (!tokens.length) return [];
  const docs = buildDocuments(index, area);

  const results: SearchResult[] = [];
  for (const doc of docs) {
    const haystack = doc.haystack.toLowerCase();
    let score = 0;
    let matchedTokens = 0;
    for (const token of tokens) {
      // Count occurrences of this token in the haystack.
      let count = 0;
      let from = 0;
      for (;;) {
        const found = haystack.indexOf(token, from);
        if (found === -1) break;
        count++;
        from = found + token.length;
      }
      if (count > 0) matchedTokens++;
      score += count;
    }
    // Require at least one matched token; reward documents matching more tokens.
    if (matchedTokens === 0) continue;
    score += matchedTokens * 5;
    // Exact phrase bonus.
    if (haystack.includes(query.toLowerCase())) score += 10;
    results.push({
      type: doc.type,
      id: doc.id,
      title: doc.title,
      snippet: makeSnippet(doc.body, tokens),
      score,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
