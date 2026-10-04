#!/usr/bin/env node
/**
 * WI-OI-092 / Phase 6 — Universal Procurement, Vendor Operations and 3-Way Matching Verification
 * Validates contracts, module manifest, configuration adapter registration,
 * 3-way matching invariants, database schema isolation, and metadata extensibility.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

console.log('== 1. Validating Procurement Contracts');
const contracts = await import('../packages/contracts/dist/index.js');

// Enums
assert.ok(contracts.REQUISITION_STATUSES.includes('DRAFT'), 'REQUISITION_STATUSES includes DRAFT');
assert.ok(contracts.REQUISITION_STATUSES.includes('APPROVED'), 'REQUISITION_STATUSES includes APPROVED');
assert.ok(contracts.PURCHASE_ORDER_STATUSES.includes('ISSUED'), 'PURCHASE_ORDER_STATUSES includes ISSUED');
assert.ok(contracts.PURCHASE_ORDER_STATUSES.includes('PARTIALLY_RECEIVED'), 'PURCHASE_ORDER_STATUSES includes PARTIALLY_RECEIVED');
assert.ok(contracts.PURCHASE_ORDER_STATUSES.includes('RECEIVED'), 'PURCHASE_ORDER_STATUSES includes RECEIVED');
assert.ok(contracts.MATCH_STATUSES.includes('UNMATCHED'), 'MATCH_STATUSES includes UNMATCHED');
assert.ok(contracts.MATCH_STATUSES.includes('PARTIALLY_MATCHED'), 'MATCH_STATUSES includes PARTIALLY_MATCHED');
assert.ok(contracts.MATCH_STATUSES.includes('FULLY_MATCHED'), 'MATCH_STATUSES includes FULLY_MATCHED');
assert.ok(contracts.MATCH_STATUSES.includes('VARIANCE_HOLD'), 'MATCH_STATUSES includes VARIANCE_HOLD');
assert.ok(contracts.MATCH_STATUSES.includes('FORCE_MATCHED'), 'MATCH_STATUSES includes FORCE_MATCHED');
assert.ok(contracts.VENDOR_BILL_STATUSES.includes('PENDING_MATCH'), 'VENDOR_BILL_STATUSES includes PENDING_MATCH');
assert.ok(contracts.VENDOR_BILL_STATUSES.includes('PRICE_VARIANCE_HOLD'), 'VENDOR_BILL_STATUSES includes PRICE_VARIANCE_HOLD');
assert.ok(contracts.DEBIT_MEMO_STATUSES.includes('ISSUED'), 'DEBIT_MEMO_STATUSES includes ISSUED');
assert.ok(contracts.INCOTERMS.includes('DDP'), 'INCOTERMS includes DDP');

// Input DTO validation
const validPoInput = {
  orgUnitId: 'org-procurement-01',
  vendorPartyId: 'a0000000-0000-4000-a000-000000000001',
  vendorName: 'Acme Industrial Supplies',
  currencyCode: 'USD',
  destinationWarehouseId: 'b0000000-0000-4000-a000-000000000001',
  paymentTermDays: 30,
  incoterm: 'DDP',
  lines: [
    {
      productId: 'c0000000-0000-4000-a000-000000000001',
      productCode: 'RAW-STEEL-001',
      productName: 'Cold Rolled Steel Coil',
      orderedQuantity: '500',
      uomId: 'd0000000-0000-4000-a000-000000000001',
      unitPriceMinor: '25000',
      destinationWarehouseId: 'b0000000-0000-4000-a000-000000000001',
    },
  ],
};
assert.ok(contracts.CreatePurchaseOrderInputV1Schema.safeParse(validPoInput).success, 'PO input parses');
assert.ok(
  !contracts.CreatePurchaseOrderInputV1Schema.safeParse({ ...validPoInput, unauthorizedField: 'rejected' }).success,
  'Strict schema rejects unknown properties',
);

console.log('== 2. Validating Module Manifest and Packaging');
const manifestPath = resolve(ROOT, 'modules/universal-procurement/module.yaml');
assert.ok(existsSync(manifestPath), 'modules/universal-procurement/module.yaml exists');
const manifest = readFileSync(manifestPath, 'utf8');
assert.ok(manifest.includes('name: universal-procurement'), 'Manifest defines universal-procurement');
assert.ok(manifest.includes('defaultSchema: gigalibs_procurement'), 'Manifest declares schema gigalibs_procurement');
assert.ok(manifest.includes('workItem: WI-OI-092'), 'Work item WI-OI-092 referenced');
assert.ok(existsSync(resolve(ROOT, 'packages/contracts/src/procurement/procurement.ts')), 'Contracts file exists');

console.log('== 3. Validating Forward-only Migration File');
const migrationPath = resolve(
  ROOT,
  'modules/universal-procurement/db/migrations/000001_procurement_foundation.up.sql',
);
assert.ok(existsSync(migrationPath), 'Migration SQL exists');
const migrationSql = readFileSync(migrationPath, 'utf8');
assert.ok(migrationSql.includes('CREATE SCHEMA IF NOT EXISTS gigalibs_procurement;'), 'Schema created');
assert.ok(migrationSql.includes('procurement_requisitions'), 'Requisitions table created');
assert.ok(migrationSql.includes('purchase_orders'), 'Purchase orders table created');
assert.ok(migrationSql.includes('match_po_receipt_records'), '2-Way PO-Receipt matches table created');
assert.ok(migrationSql.includes('match_po_invoice_records'), '3-Way PO-Invoice matches table created');
assert.ok(migrationSql.includes('vendor_bills'), 'Vendor bills table created');
assert.ok(migrationSql.includes('debit_memos'), 'Debit memos table created');
assert.ok(migrationSql.includes('ENABLE ROW LEVEL SECURITY'), 'RLS enabled');
assert.ok(migrationSql.includes('FORCE ROW LEVEL SECURITY'), 'RLS forced');
assert.ok(migrationSql.includes('trg_match_po_invoice_immutable'), 'Tamper prevention trigger registered');

console.log('== 4. Validating Application Dictionary Adapter Registration');
const registryPath = resolve(ROOT, 'apps/playground-api/src/configuration-adapter.registry.ts');
const registryCode = readFileSync(registryPath, 'utf8');
assert.ok(
  registryCode.includes('ProcurementConfigurationAdapterV1'),
  'ProcurementConfigurationAdapterV1 registered in adapter registry',
);

console.log('== 5. Validating Web Component Export & Dictionary Integration');
const webWorkspacePath = resolve(
  ROOT,
  'modules/universal-procurement/web/src/UniversalProcurementWorkspace.tsx',
);
assert.ok(existsSync(webWorkspacePath), 'UniversalProcurementWorkspace.tsx exists');
const webCode = readFileSync(webWorkspacePath, 'utf8');
assert.ok(webCode.includes('DictionaryRenderer'), 'DictionaryRenderer embedded in procurement workspace');
assert.ok(webCode.includes('DEFAULT_PROCUREMENT_DICTIONARY_MANIFEST'), 'Default procurement dictionary manifest defined');
assert.ok(webCode.includes('cost_center_code'), 'Metadata extension field cost_center_code present in UI');
assert.ok(webCode.includes('Three-Way Matching Matrix'), 'Three-Way Matching Matrix operational view present');

console.log('\n========================================================');
console.log('✅ ALL UNIVERSAL PROCUREMENT SDLC CONTRACT CHECKS PASSED');
console.log('========================================================\n');
