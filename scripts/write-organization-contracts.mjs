#!/usr/bin/env node
// WI-OI-109c: writes the organization OpenAPI and AsyncAPI documents from @gigalibs/contracts (build it first).
// `--check` fails when the committed documents differ from the contracts.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOrganizationAsyncApi, buildOrganizationOpenApi } from '../packages/contracts/dist/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const documents = {
  'docs/contracts/organization/openapi.json': buildOrganizationOpenApi(),
  'docs/contracts/organization/asyncapi.json': buildOrganizationAsyncApi(),
};
const check = process.argv.includes('--check');
let stale = 0;
for (const [path, document] of Object.entries(documents)) {
  const text = `${JSON.stringify(document, null, 2)}\n`;
  if (!check) {
    writeFileSync(resolve(root, path), text);
    console.log(`wrote ${path}`);
  } else if (readFileSync(resolve(root, path), 'utf8') !== text) {
    console.error(`${path} is stale; run node scripts/write-organization-contracts.mjs`);
    stale += 1;
  }
}
process.exit(stale === 0 ? 0 : 1);
