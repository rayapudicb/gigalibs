#!/usr/bin/env node
// WI-OI-120bq: one-shot bootstrap for legacy finance proof scripts (verify.mjs step).
import { bootstrapFinanceProofSchema } from './lib/bootstrap-finance-proof-schema.mjs';
import { isolatedProofDatabaseUrl } from './lib/isolated-proof-database.mjs';

const adminUrl = isolatedProofDatabaseUrl('WI-OI-120bq finance proof bootstrap');
const { migrationVersion, schema } = await bootstrapFinanceProofSchema(adminUrl);
console.log(`Finance proof database ready: ${schema} at migration ${migrationVersion}.`);
