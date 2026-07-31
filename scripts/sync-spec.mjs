#!/usr/bin/env node
// Maintainer utility: refresh the bundled OpenAPI snapshots from the source
// `pancake_api_doc` repository. This keeps the public MCP server self-contained
// (it never fetches the spec at runtime) while making updates a one-command step.
//
// Usage:
//   npm run sync-spec                 # assumes ../pancake_api_doc alongside this repo
//   npm run sync-spec -- /path/to/pancake_api_doc
//
import { copyFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");

const sourceRepo = resolve(
  process.argv[2] || join(projectRoot, "..", "pancake_api_doc")
);

const files = ["openapi.yaml", "webhook.yaml"];

const sourceDir = join(sourceRepo, "openapi");
if (!existsSync(sourceDir)) {
  console.error(`Source spec directory not found: ${sourceDir}`);
  console.error("Pass the path to the pancake_api_doc repo as an argument.");
  process.exit(1);
}

for (const file of files) {
  const src = join(sourceDir, file);
  const dest = join(projectRoot, "spec", file);
  if (!existsSync(src)) {
    console.error(`Missing source file: ${src}`);
    process.exit(1);
  }
  copyFileSync(src, dest);
  console.log(`Synced ${file}`);
}

console.log("Spec snapshots updated. Run `npm run build` and commit the changes.");
