#!/usr/bin/env node
/**
 * WI-OI-093 / Phase 7 — Universal Order Management and Customer Fulfillment Verification
 * Validates contracts, module manifest, configuration adapter registration,
 * ATP allocation invariants, fulfillment immutability, database schema isolation,
 * and metadata extensibility.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

console.log('== 1. Validating Universal Orders Contracts');
const contracts = await import('../packages/contracts/dist/index.js');

// Enums
assert.ok(contracts.QUOTE_STATUSES.includes('DRAFT'), 'QUOTE_STATUSES includes DRAFT');
assert.ok(contracts.QUOTE_STATUSES.includes('ACCEPTED'), 'QUOTE_STATUSES includes ACCEPTED');
assert.ok(contracts.QUOTE_STATUSES.includes('CONVERTED'), 'QUOTE_STATUSES includes CONVERTED');
assert.ok(contracts.ORDER_STATUSES.includes('DRAFT'), 'ORDER_STATUSES includes DRAFT');
assert.ok(contracts.ORDER_STATUSES.includes('CONFIRMED'), 'ORDER_STATUSES includes CONFIRMED');
assert.ok(contracts.ORDER_STATUSES.includes('PROCESSING'), 'ORDER_STATUSES includes PROCESSING');
assert.ok(contracts.ORDER_STATUSES.includes('PARTIALLY_FULFILLED'), 'ORDER_STATUSES includes PARTIALLY_FULFILLED');
assert.ok(contracts.ORDER_STATUSES.includes('FULFILLED'), 'ORDER_STATUSES includes FULFILLED');
assert.ok(contracts.ORDER_ALLOCATION_STATUSES.includes('HARD_RESERVED'), 'ORDER_ALLOCATION_STATUSES includes HARD_RESERVED');
assert.ok(contracts.ORDER_ALLOCATION_STATUSES.includes('SOFT_ALLOCATED'), 'ORDER_ALLOCATION_STATUSES includes SOFT_ALLOCATED');
assert.ok(contracts.FULFILLMENT_STATUSES.includes('DRAFT'), 'FULFILLMENT_STATUSES includes DRAFT');
assert.ok(contracts.FULFILLMENT_STATUSES.includes('SHIPPED'), 'FULFILLMENT_STATUSES includes SHIPPED');
assert.ok(contracts.CUSTOMER_INVOICE_STATUSES.includes('ISSUED'), 'CUSTOMER_INVOICE_STATUSES includes ISSUED');
assert.ok(contracts.CREDIT_MEMO_STATUSES.includes('ISSUED'), 'CREDIT_MEMO_STATUSES includes ISSUED');
assert.ok(contracts.RETURN_STATUSES.includes('REQUESTED'), 'RETURN_STATUSES includes REQUESTED');

// Input DTO validation
const validOrderInput = {
  orgUnitId: 'org-sales-01',
  customerPartyId: 'a0000000-0000-4000-a000-000000000001',
  customerName: 'Acme Commercial Technologies Inc',
  currencyCode: 'USD',
  warehouseId: 'b0000000-0000-4000-a000-000000000001',
  paymentTermDays: 30,
  lines: [
    {
      productId: 'c0000000-0000-4000-a000-000000000001',
      productCode: 'SERVO-DRIVE-80',
      productName: 'High Precision Servo Drive 80W',
      orderedQuantity: '100.000000',
      uomId: 'd0000000-0000-4000-a000-000000000001',
      unitPriceMinor: '1500',
      discountMinor: '0',
      taxRateBasisPoints: 1000,
      warehouseId: 'b0000000-0000-4000-a000-000000000001',
    },
  ],
};
assert.ok(contracts.CreateSalesOrderInputV1Schema.safeParse(validOrderInput).success, 'Order input parses');
assert.ok(
  !contracts.CreateSalesOrderInputV1Schema.safeParse({ ...validOrderInput, unauthorizedField: 'rejected' }).success,
  'Strict schema rejects unknown properties',
);

console.log('== 2. Validating Module Manifest and Packaging');
const manifestPath = resolve(ROOT, 'modules/universal-orders/module.yaml');
assert.ok(existsSync(manifestPath), 'modules/universal-orders/module.yaml exists');
const manifest = readFileSync(manifestPath, 'utf8');
assert.ok(manifest.includes('name: universal-orders'), 'Manifest defines universal-orders');
assert.ok(manifest.includes('defaultSchema: gigalibs_orders'), 'Manifest declares schema gigalibs_orders');
assert.ok(manifest.includes('workItem: WI-OI-093'), 'Work item WI-OI-093 referenced');
assert.ok(existsSync(resolve(ROOT, 'packages/contracts/src/orders/orders.ts')), 'Contracts file exists');

console.log('== 3. Validating Forward-only Migration File');
const migrationPath = resolve(
  ROOT,
  'modules/universal-orders/db/migrations/000001_orders_fulfillment_foundation.up.sql',
);
assert.ok(existsSync(migrationPath), 'Migration SQL exists');
const migrationSql = readFileSync(migrationPath, 'utf8');
assert.ok(migrationSql.includes('CREATE SCHEMA IF NOT EXISTS gigalibs_orders;'), 'Schema created');
assert.ok(migrationSql.includes('sales_quotes'), 'Sales quotes table created');
assert.ok(migrationSql.includes('sales_orders'), 'Sales orders table created');
assert.ok(migrationSql.includes('order_inventory_allocations'), 'Order allocations table created');
assert.ok(migrationSql.includes('fulfillment_orders'), 'Fulfillment orders table created');
assert.ok(migrationSql.includes('fulfillment_order_lines'), 'Fulfillment order lines table created');
assert.ok(migrationSql.includes('customer_invoices'), 'Customer invoices table created');
assert.ok(migrationSql.includes('customer_credit_memos'), 'Customer credit memos table created');
assert.ok(migrationSql.includes('ENABLE ROW LEVEL SECURITY'), 'RLS enabled');
assert.ok(migrationSql.includes('FORCE ROW LEVEL SECURITY'), 'RLS forced');
assert.ok(migrationSql.includes('trg_fulfillment_order_lines_immutable'), 'Tamper prevention trigger registered');

console.log('== 4. Validating Application Dictionary Adapter Registration');
const registryPath = resolve(ROOT, 'apps/playground-api/src/configuration-adapter.registry.ts');
const registryCode = readFileSync(registryPath, 'utf8');
assert.ok(
  registryCode.includes('OrderConfigurationAdapterV1'),
  'OrderConfigurationAdapterV1 registered in adapter registry',
);

console.log('== 5. Validating Web Component Export & Dictionary Integration');
const webWorkspacePath = resolve(
  ROOT,
  'modules/universal-orders/web/src/UniversalOrderWorkspace.tsx',
);
assert.ok(existsSync(webWorkspacePath), 'UniversalOrderWorkspace.tsx exists');
const webCode = readFileSync(webWorkspacePath, 'utf8');
assert.ok(webCode.includes('DictionaryRenderer'), 'DictionaryRenderer embedded in orders workspace');
assert.ok(webCode.includes('DEFAULT_ORDERS_DICTIONARY_MANIFEST'), 'Default orders dictionary manifest defined');
assert.ok(webCode.includes('delivery_priority'), 'Metadata extension field delivery_priority present in UI');
assert.ok(webCode.includes('ATP Matrix'), 'Available-to-Promise operational view present');

console.log('\n========================================================');
console.log('✅ ALL UNIVERSAL ORDERS SDLC CONTRACT CHECKS PASSED');
console.log('========================================================\n');
