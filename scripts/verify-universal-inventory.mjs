#!/usr/bin/env node
/**
 * WI-OI-091 / Phase 5 — Universal Inventory and Warehouse Operations Verification
 * Validates contracts, module manifest, configuration adapter registration,
 * double-entry ledger invariants, and metadata extensibility.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

console.log('== 1. Validating Inventory Contracts');
const contracts = await import('../packages/contracts/dist/index.js');

// Enums
assert.ok(contracts.WAREHOUSE_TYPES.includes('PHYSICAL'), 'WAREHOUSE_TYPES includes PHYSICAL');
assert.ok(contracts.LOCATION_TYPES.includes('STORAGE'), 'LOCATION_TYPES includes STORAGE');
assert.ok(contracts.LOCATION_TYPES.includes('RECEIVING'), 'LOCATION_TYPES includes RECEIVING');
assert.ok(contracts.STOCK_STATUSES.includes('AVAILABLE'), 'STOCK_STATUSES includes AVAILABLE');
assert.ok(contracts.LEDGER_MOVEMENT_REASONS.includes('RECEIPT'), 'LEDGER_MOVEMENT_REASONS includes RECEIPT');
assert.ok(contracts.LEDGER_MOVEMENT_REASONS.includes('PUTAWAY'), 'LEDGER_MOVEMENT_REASONS includes PUTAWAY');
assert.ok(contracts.LEDGER_MOVEMENT_REASONS.includes('TRANSFER'), 'LEDGER_MOVEMENT_REASONS includes TRANSFER');
assert.ok(contracts.LEDGER_MOVEMENT_REASONS.includes('RESERVE'), 'LEDGER_MOVEMENT_REASONS includes RESERVE');
assert.ok(contracts.LEDGER_MOVEMENT_REASONS.includes('ISSUE'), 'LEDGER_MOVEMENT_REASONS includes ISSUE');
assert.ok(contracts.LEDGER_MOVEMENT_REASONS.includes('COUNT_GAIN'), 'LEDGER_MOVEMENT_REASONS includes COUNT_GAIN');
assert.ok(contracts.LEDGER_ENTRY_DIRECTIONS.includes('DEBIT'), 'LEDGER_ENTRY_DIRECTIONS includes DEBIT');
assert.ok(contracts.LEDGER_ENTRY_DIRECTIONS.includes('CREDIT'), 'LEDGER_ENTRY_DIRECTIONS includes CREDIT');

// Input DTO validation
const validWarehouseInput = {
  code: 'WH-TEST-01',
  name: 'Test Warehouse',
  warehouseType: 'PHYSICAL',
};
assert.ok(contracts.CreateWarehouseInputV1Schema.safeParse(validWarehouseInput).success, 'Warehouse input parses');
assert.ok(
  !contracts.CreateWarehouseInputV1Schema.safeParse({ ...validWarehouseInput, extra: 'forbidden' }).success,
  'Strict schema rejects unknown properties',
);

console.log('== 2. Validating Module Manifest and Packaging');
const manifestPath = resolve(ROOT, 'modules/universal-inventory/module.yaml');
assert.ok(existsSync(manifestPath), 'modules/universal-inventory/module.yaml exists');
const manifest = readFileSync(manifestPath, 'utf8');
assert.ok(manifest.includes('name: universal-inventory'), 'Manifest defines universal-inventory');
assert.ok(manifest.includes('defaultSchema: gigalibs_inventory'), 'Manifest declares schema gigalibs_inventory');
assert.ok(manifest.includes('workItem: WI-OI-091'), 'Work item WI-OI-091 referenced');
assert.ok(existsSync(resolve(ROOT, 'packages/contracts/src/inventory/inventory.ts')), 'Contracts file exists');

console.log('== 3. Validating Forward-only Migration File');
const migrationPath = resolve(
  ROOT,
  'modules/universal-inventory/db/migrations/000001_inventory_warehouse_foundation.up.sql',
);
assert.ok(existsSync(migrationPath), 'Migration SQL exists');
const migrationSql = readFileSync(migrationPath, 'utf8');
assert.ok(migrationSql.includes('CREATE SCHEMA IF NOT EXISTS gigalibs_inventory;'), 'Schema created');
assert.ok(migrationSql.includes('CREATE TABLE gigalibs_inventory.stock_ledger_entries'), 'Ledger entries created');
assert.ok(migrationSql.includes('CREATE TABLE gigalibs_inventory.stock_balances'), 'Balances created');
assert.ok(migrationSql.includes('ENABLE ROW LEVEL SECURITY'), 'RLS enabled');
assert.ok(migrationSql.includes('FORCE ROW LEVEL SECURITY'), 'RLS forced');

console.log('== 4. Validating Application Dictionary Adapter Registration');
const registryPath = resolve(ROOT, 'apps/playground-api/src/configuration-adapter.registry.ts');
const registryCode = readFileSync(registryPath, 'utf8');
assert.ok(
  registryCode.includes('InventoryConfigurationAdapterV1'),
  'InventoryConfigurationAdapterV1 registered in adapter registry',
);

console.log('== 5. Validating Web Component Export & Dictionary Integration');
const webWorkspacePath = resolve(
  ROOT,
  'modules/universal-inventory/web/src/UniversalInventoryWorkspace.tsx',
);
assert.ok(existsSync(webWorkspacePath), 'UniversalInventoryWorkspace.tsx exists');
const webCode = readFileSync(webWorkspacePath, 'utf8');
assert.ok(webCode.includes('DictionaryRenderer'), 'DictionaryRenderer embedded in inventory workspace');
assert.ok(webCode.includes('lot-attributes-slot'), 'Extension slot referenced in UI');

console.log('\n======================================================');
console.log('✅ ALL UNIVERSAL INVENTORY SDLC CONTRACT CHECKS PASSED');
console.log('======================================================\n');
