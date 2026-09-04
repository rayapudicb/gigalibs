import assert from 'node:assert/strict';
import {
  DoubleEntryLedger,
  MemoryLedgerRepository,
} from '../dist/index.js';
import {
  InvoiceEngine,
  MemoryInvoiceRepository,
} from '../../invoices-core/dist/index.js';
import {
  MultiCurrencyEngine,
  SUPPORTED_CURRENCIES,
} from '../../multi-currency/dist/index.js';
import {
  ModuleRegistry,
  ModuleManifestSchema,
} from '../../module-registry/dist/index.js';

import tenancyManifest from '../../tenancy-core/module.manifest.json' with { type: 'json' };
import auditManifest from '../../audit-core/module.manifest.json' with { type: 'json' };
import rbacManifest from '../../rbac-core/module.manifest.json' with { type: 'json' };
import usersManifest from '../../users-core/module.manifest.json' with { type: 'json' };
import authManifest from '../../auth-core/module.manifest.json' with { type: 'json' };
import settingsManifest from '../../platform-settings/module.manifest.json' with { type: 'json' };
import ticketsManifest from '../../tickets-core/module.manifest.json' with { type: 'json' };
import slaManifest from '../../sla-engine/module.manifest.json' with { type: 'json' };
import invoicesManifest from '../../invoices-core/module.manifest.json' with { type: 'json' };
import ledgerManifest from '../module.manifest.json' with { type: 'json' };
import billingManifest from '../../billing-core/module.manifest.json' with { type: 'json' };
import currencyManifest from '../../multi-currency/module.manifest.json' with { type: 'json' };

console.log('💰 Running GigaLibs Financial & Monetization Suite Certification...\n');

// ─── GATE 1: MANIFESTS & FULL 12-MODULE REGISTRY RESOLUTION ─────────────────
console.log('▶ Gate 1: Module Manifests & 12-Module Topological Resolution...');
const all12Manifests = [
  tenancyManifest,
  auditManifest,
  rbacManifest,
  usersManifest,
  authManifest,
  settingsManifest,
  ticketsManifest,
  slaManifest,
  invoicesManifest,
  ledgerManifest,
  billingManifest,
  currencyManifest,
];

for (const m of all12Manifests) {
  assert.doesNotThrow(() => ModuleManifestSchema.parse(m), `Manifest ${m.id} must be valid`);
}

const registry = new ModuleRegistry(all12Manifests);
assert.doesNotThrow(() => registry.assertReady(), 'All 12 modules must resolve without cycles');

const list = registry.list();
assert.equal(list.length, 12, 'All 12 platform modules must be registered');
for (const mod of list) {
  assert.equal(mod.status, 'READY', `${mod.manifest.id} must be READY`);
}
console.log(`  ✓ All 12 platform modules verified in READY state (0 cycles, 0 missing dependencies).\n`);

// ─── GATE 2: DOUBLE-ENTRY ACCOUNTING INVARIANTS ──────────────────────────────
console.log('▶ Gate 2: Double-Entry General Ledger Invariants (Debits == Credits)...');

// 1. Balanced entry test: $500.00 cash debit, $500.00 revenue credit (50000 cents)
const validEntry = DoubleEntryLedger.postEntry(
  'tenant_acme',
  'SaaS Growth Plan Monthly Subscription',
  [
    { accountId: 'acc_1000', accountCode: '1000', debit: 50000, credit: 0, description: 'Cash' },
    { accountId: 'acc_4000', accountCode: '4000', debit: 0, credit: 50000, description: 'SaaS Revenue' },
  ],
  10001,
);
assert.equal(validEntry.totalAmount, 50000, 'Entry total must be 50000 cents');
assert.equal(validEntry.lines.length, 2, 'Entry must contain 2 lines');

// 2. Unbalanced entry test: Debits 50000 != Credits 45000 -> Must Throw
assert.throws(
  () =>
    DoubleEntryLedger.postEntry('tenant_acme', 'Unbalanced Entry', [
      { accountId: 'acc_1000', debit: 50000, credit: 0 },
      { accountId: 'acc_4000', debit: 0, credit: 45000 },
    ]),
  /Accounting invariant breached: Total Debits \(50000\) must equal Total Credits \(45000\)/,
  'Unbalanced journal entry must be rejected',
);

// 3. Floating-point non-integer test: 50.456 cents -> Must Throw
assert.throws(
  () =>
    DoubleEntryLedger.postEntry('tenant_acme', 'Float entry', [
      { accountId: 'acc_1000', debit: 50.45, credit: 0 },
      { accountId: 'acc_4000', debit: 0, credit: 50.45 },
    ]),
  /Line item amounts must be integer minor units/,
  'Floating-point fractions must be rejected',
);

// 4. Reversal entry test: Swaps Debits and Credits
const reversal = DoubleEntryLedger.createReversal(validEntry, 'Void invalid invoice payment', 10002);
assert.equal(reversal.lines[0].debit, 0, 'Reversed line 1 debit must be 0');
assert.equal(reversal.lines[0].credit, 50000, 'Reversed line 1 credit must be 50000');
assert.equal(reversal.lines[1].debit, 50000, 'Reversed line 2 debit must be 50000');
assert.equal(reversal.lines[1].credit, 0, 'Reversed line 2 credit must be 0');
assert.equal(reversal.reversalOfEntryId, validEntry.id, 'Reversal must point to original entry');

console.log('  ✓ Fundamental accounting equations strictly enforced. Floating-point errors eliminated.\n');

// ─── GATE 3: INVOICE LIFECYCLE & MULTI-JURISDICTION TAX ENGINE ────────────────
console.log('▶ Gate 3: Invoicing Engine & Payment Allocations...');

const invoice = InvoiceEngine.createInvoice({
  invoiceId: 'invoice-certification-001',
  tenantId: 'tenant_acme',
  workspaceId: 'workspace-certification',
  invoiceNumber: 'INV-2026-001',
  customer: {
    customerId: 'customer-certification',
    name: 'Certification Customer',
    email: 'billing@example.test',
    country: 'US',
  },
  currency: 'USD',
  status: 'SENT',
  issueDate: '2026-09-01',
  dueDate: '2026-10-01',
  paymentTerms: 'NET_30',
  recurringCadence: 'NONE',
  taxRule: {
    jurisdiction: 'US_STATE_SALES_TAX',
    regionCode: 'US',
    ratePercent: 8.25,
    isCompound: false,
    exemptionAllowed: false,
    description: 'Certification fixture supplied by the test',
  },
  discountPercent: 10,
  lineItems: [
    { id: '1', description: 'Enterprise Dedicated Cluster (32 vCPU)', quantity: 1, unitPrice: 300000, amount: 300000 },
    { id: '2', description: 'AI Copilot Token Ingestion Pack', quantity: 2, unitPrice: 50000, amount: 100000 },
  ],
});

// Subtotal = 400000 ($4,000.00)
// Discount 10% = 40000 ($400.00) -> Taxable = 360000 ($3,600.00)
// Tax 8.25% = 29700 ($297.00) -> Total = 389700 ($3,897.00)
assert.equal(invoice.subtotal, 400000, 'Subtotal must be 400000 cents');
assert.equal(invoice.discountAmount, 40000, 'Discount must be 40000 cents');
assert.equal(invoice.taxAmount, 29700, 'Tax must be 29700 cents');
assert.equal(invoice.totalAmount, 389700, 'Total amount must be 389700 cents');
assert.equal(invoice.status, 'SENT', 'Initial invoice status must be SENT');

// Partial Payment: $1,000.00 (100000 cents)
const partial = InvoiceEngine.recordPayment(invoice, 100000);
assert.equal(partial.status, 'PARTIALLY_PAID', 'Invoice must become PARTIALLY_PAID');
assert.equal(partial.amountPaid, 100000, 'Amount paid must be 100000 cents');

// Final Payment: Remainder $2,897.00 (289700 cents)
const fullyPaid = InvoiceEngine.recordPayment(partial, 289700);
assert.equal(fullyPaid.status, 'PAID', 'Invoice must become PAID');
assert.equal(fullyPaid.amountPaid, 389700, 'Invoice must be fully paid');
assert.ok(fullyPaid.paidAt, 'paidAt timestamp must be set');

// Immutability: Cannot record payment on PAID invoice
assert.throws(
  () => InvoiceEngine.recordPayment(fullyPaid, 1000),
  /Cannot record payment on invoice.*PAID/,
  'Paid invoice must reject additional payments',
);

console.log('  ✓ Invoice totals, multi-tier tax computations, and payment allocation transitions verified.\n');

// ─── GATE 4: MULTI-CURRENCY CONVERSION & FX RATE PRECISION ───────────────────
console.log('▶ Gate 4: Multi-Currency Converter & FX Rounding Rules...');

const testRates = { USD: 1.0, EUR: 0.92, GBP: 0.79, INR: 86.5, JPY: 154.0 };

// 1. USD to EUR: 10000 USD -> 9200 EUR
const eur = MultiCurrencyEngine.convert(10000, 'USD', 'EUR', testRates);
assert.equal(eur, 9200, '10000 USD must convert to 9200 EUR');

// 2. USD to JPY (0 decimals): 100 USD -> 15400 JPY
const jpy = MultiCurrencyEngine.convert(100, 'USD', 'JPY', testRates);
assert.equal(jpy, 15400, '100 USD must convert to 15400 JPY (0 decimals)');

// 3. Formatting
const formattedUsd = MultiCurrencyEngine.format(389700, 'USD', 'en-US');
assert.ok(formattedUsd.includes('3,897.00'), 'Formatted USD must be $3,897.00');

console.log('  ✓ Multi-currency exchange rate conversions and decimal precision verified.\n');

console.log('════════════════════════════════════════════════════════════════════════');
console.log('🏆 ALL FINANCIAL & MONETIZATION SUITE CERTIFICATION GATES PASSED!');
console.log('════════════════════════════════════════════════════════════════════════\n');
