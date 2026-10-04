'use client';

import React, { useState, useCallback } from 'react';
import {
  Boxes,
  Building,
  Layers,
  ScanLine,
  ArrowRightLeft,
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Search,
  Filter,
  RefreshCw,
  X,
  ChevronRight,
  Shield,
  FileText,
  Sliders,
  History,
  Tag,
  PackageCheck,
  Truck,
  Archive,
} from 'lucide-react';
import type {
  InventoryWarehouseV1,
  InventoryLocationV1,
  StockBalanceV1,
  StockLedgerEntryV1,
  InventoryReceiptV1,
  InventoryReservationV1,
  InventoryKitV1,
  CountPlanV1,
  InventoryAdjustmentV1,
  BarcodeResolutionResultV1,
  CompiledDictionaryManifestV1,
} from '@gigalibs/contracts';
import {
  DictionaryRenderer,
  validateDictionaryRules,
} from '@gigalibs/configuration-react';

type WorkspaceTab =
  | 'overview'
  | 'warehouses'
  | 'locations'
  | 'balances'
  | 'ledger'
  | 'receipts'
  | 'transfers'
  | 'reservations'
  | 'kits'
  | 'counts'
  | 'scanner'
  | 'extensions';

const DEFAULT_INVENTORY_DICTIONARY_MANIFEST: CompiledDictionaryManifestV1 = {
  manifestVersion: 1,
  packageKey: 'pkg-universal-inventory',
  checksum: 'sha256:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
  compiledAt: '2026-10-04T00:00:00.000Z',
  entities: [
    {
      entityKey: 'inventory-lots',
      moduleKey: 'universal-inventory',
      label: 'Inventory Lots & Batches',
      description: 'Governed lot/batch tracking with quality specifications and custody.',
      ownership: 'MODULE_CORE',
      primaryKeyField: 'id',
      isVersioned: true,
      isAuditLogged: true,
      isSoftDeletable: false,
    },
  ],
  fields: [
    {
      fieldKey: 'cold_chain_min_celsius',
      entityKey: 'inventory-lots',
      label: 'Min Temperature (°C)',
      description: 'Minimum allowable storage temperature for cold-chain goods.',
      type: 'NUMBER',
      required: false,
      readOnly: false,
      isSystemLocked: false,
      classification: 'INTERNAL',
      helpText: 'e.g. -20.0 or 2.0',
      maskOnDisplay: false,
    },
    {
      fieldKey: 'cold_chain_max_celsius',
      entityKey: 'inventory-lots',
      label: 'Max Temperature (°C)',
      description: 'Maximum allowable storage temperature.',
      type: 'NUMBER',
      required: false,
      readOnly: false,
      isSystemLocked: false,
      classification: 'INTERNAL',
      helpText: 'e.g. -15.0 or 8.0',
      maskOnDisplay: false,
    },
    {
      fieldKey: 'hazardous_material_class',
      entityKey: 'inventory-lots',
      label: 'Hazmat Classification',
      description: 'UN / DOT Hazardous materials transport and storage class.',
      type: 'SELECT',
      required: false,
      readOnly: false,
      isSystemLocked: false,
      classification: 'RESTRICTED',
      referenceKey: 'ref-hazmat-classes',
      helpText: 'Select Class 1 through Class 9 or None.',
      maskOnDisplay: false,
    },
    {
      fieldKey: 'potency_percentage',
      entityKey: 'inventory-lots',
      label: 'Active Ingredient Potency (%)',
      description: 'Lab-tested assay potency concentration.',
      type: 'NUMBER',
      required: false,
      readOnly: false,
      isSystemLocked: false,
      classification: 'INTERNAL',
      helpText: 'e.g. 98.5',
      maskOnDisplay: false,
    },
    {
      fieldKey: 'qa_inspection_notes',
      entityKey: 'inventory-lots',
      label: 'QA Inspection Observations',
      description: 'Quality assurance checklist findings at receiving disposition.',
      type: 'TEXT',
      required: false,
      readOnly: false,
      isSystemLocked: false,
      classification: 'INTERNAL',
      helpText: 'Summary of certificate of analysis (CoA) checks.',
      maskOnDisplay: false,
    },
  ],
  references: [
    {
      referenceKey: 'ref-hazmat-classes',
      referenceType: 'VALUE_LIST',
      staticValues: [
        { value: 'NONE', label: 'Non-Hazardous / Standard' },
        { value: 'CLASS_2_GAS', label: 'Class 2: Compressed Gases' },
        { value: 'CLASS_3_FLAMMABLE_LIQUID', label: 'Class 3: Flammable Liquids' },
        { value: 'CLASS_4_FLAMMABLE_SOLID', label: 'Class 4: Flammable Solids' },
        { value: 'CLASS_5_OXIDIZER', label: 'Class 5: Oxidizing Agents' },
        { value: 'CLASS_6_TOXIC', label: 'Class 6: Toxic & Infectious' },
        { value: 'CLASS_8_CORROSIVE', label: 'Class 8: Corrosive Substances' },
        { value: 'CLASS_9_MISC', label: 'Class 9: Miscellaneous Hazardous' },
      ],
    },
  ],
  validationRules: [
    {
      ruleKey: 'rule-cold-chain-range',
      label: 'Cold Chain Range Invariant',
      errorMessage: 'Maximum temperature must be greater than or equal to minimum temperature.',
      severity: 'ERROR',
      condition: {
        operator: 'GTE',
        field: 'cold_chain_max_celsius',
        value: 0,
      },
    },
  ],
  relationships: [],
  views: [],
  navigation: [],
  actions: [],
  messages: [],
};

export function UniversalInventoryWorkspace() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [scanResult, setScanResult] = useState<BarcodeResolutionResultV1 | null>(null);

  // Dynamic Metadata state
  const [customLotExtensions, setCustomLotExtensions] = useState<Record<string, unknown>>({
    cold_chain_min_celsius: '-20.0',
    cold_chain_max_celsius: '-15.0',
    hazardous_material_class: 'NONE',
    potency_percentage: '99.2',
    qa_inspection_notes: 'Certificate of Analysis verified. Packaging intact.',
  });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const handleCustomFieldChange = useCallback((nextValues: Record<string, unknown>) => {
    setCustomLotExtensions(nextValues);
    const errs = validateDictionaryRules(DEFAULT_INVENTORY_DICTIONARY_MANIFEST.validationRules, nextValues);
    setValidationErrors(errs);
  }, []);

  const handleScanBarcode = useCallback(() => {
    if (!barcodeInput.trim()) return;
    const code = barcodeInput.trim();
    // Simulate resolution contract
    if (code.startsWith('LOC-') || code.startsWith('BIN-')) {
      setScanResult({
        rawCode: code,
        entityType: 'LOCATION',
        matchedEntityId: '00000000-0000-0000-0000-000000000001',
        matchedCode: code,
        metadata: { zone: 'Storage Zone A', aisle: '01', rack: '04' },
      });
    } else if (code.startsWith('LOT-')) {
      setScanResult({
        rawCode: code,
        entityType: 'LOT',
        matchedEntityId: '00000000-0000-0000-0000-000000000002',
        matchedCode: code,
        metadata: { status: 'AVAILABLE', potency: '99.2%' },
      });
    } else if (code.startsWith('KIT-')) {
      setScanResult({
        rawCode: code,
        entityType: 'KIT',
        matchedEntityId: '00000000-0000-0000-0000-000000000003',
        matchedCode: code,
        metadata: { workOrder: 'WO-2026-904', status: 'STAGED' },
      });
    } else {
      setScanResult({
        rawCode: code,
        entityType: 'PRODUCT',
        matchedEntityId: '00000000-0000-0000-0000-000000000004',
        matchedCode: code,
        metadata: { name: 'Standard Item' },
      });
    }
  }, [barcodeInput]);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Top Header */}
      <header className="border-b bg-card px-6 py-4">
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Boxes className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Universal Inventory &amp; Warehouses</h1>
              <p className="text-xs text-muted-foreground">
                Canonical multi-warehouse operations, double-entry stock ledger, and Application Dictionary metadata.
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 md:mt-0">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <Shield className="h-3 w-3" />
              Double-Entry Ledger Active
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
              <Sliders className="h-3 w-3" />
              Metadata Option A
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="mt-4 flex flex-wrap gap-1 border-t pt-2" aria-label="Inventory Workspaces">
          {[
            { id: 'overview', label: 'Control Center', icon: Boxes },
            { id: 'warehouses', label: 'Warehouses', icon: Building },
            { id: 'locations', label: 'Zones & Bins', icon: Layers },
            { id: 'balances', label: 'Stock Balances', icon: Archive },
            { id: 'ledger', label: 'Movement Ledger', icon: History },
            { id: 'receipts', label: 'Receiving & Inspection', icon: Truck },
            { id: 'transfers', label: 'Transfers', icon: ArrowRightLeft },
            { id: 'reservations', label: 'Reservations', icon: ClipboardList },
            { id: 'kits', label: 'Kits & Staging (CMMS)', icon: PackageCheck },
            { id: 'counts', label: 'Cycle Counts', icon: CheckCircle2 },
            { id: 'scanner', label: 'Barcode Scanner', icon: ScanLine },
            { id: 'extensions', label: 'Lot Metadata Studio', icon: Sliders },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as WorkspaceTab)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6">
        {/* Tab 1: Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border bg-card p-5 shadow-sm">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Warehouses</span>
                  <Building className="h-4 w-4" />
                </div>
                <div className="mt-2 text-2xl font-bold">2 Sites</div>
                <p className="mt-1 text-xs text-muted-foreground">Primary Logistics &amp; Spare Parts Storeroom</p>
              </div>
              <div className="rounded-xl border bg-card p-5 shadow-sm">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Total On-Hand Value</span>
                  <Archive className="h-4 w-4" />
                </div>
                <div className="mt-2 text-2xl font-bold">4,820 Units</div>
                <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">100% Ledger Reconciled</p>
              </div>
              <div className="rounded-xl border bg-card p-5 shadow-sm">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">CMMS Staging Kits</span>
                  <PackageCheck className="h-4 w-4" />
                </div>
                <div className="mt-2 text-2xl font-bold">3 Staged</div>
                <p className="mt-1 text-xs text-muted-foreground">Ready for technician dispatch</p>
              </div>
              <div className="rounded-xl border bg-card p-5 shadow-sm">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Count Variances</span>
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <div className="mt-2 text-2xl font-bold">0 Pending</div>
                <p className="mt-1 text-xs text-muted-foreground">Four-eyes maker-checker approved</p>
              </div>
            </div>

            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <h2 className="text-base font-semibold">Architecture &amp; Ledger Health</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border bg-muted/40 p-4">
                  <h3 className="text-sm font-medium text-foreground">Double-Entry Append-Only Ledger</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Quantity movements generate balanced Debit/Credit lines with zero JavaScript floating-point arithmetic.
                    Materialized balances in <code className="font-mono text-primary">gigalibs_inventory.stock_balances</code> are
                    reconstructable from inception.
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/40 p-4">
                  <h3 className="text-sm font-medium text-foreground">Application Dictionary Embedding</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Custom lot specifications (cold-chain, hazmat, potency) are managed via checksummed manifests and rendered
                    dynamically via <code className="font-mono text-primary">&lt;DictionaryRenderer /&gt;</code> with Safe AST validation.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Barcode Scanner */}
        {activeTab === 'scanner' && (
          <div className="max-w-2xl space-y-6">
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <h2 className="text-base font-semibold">Barcode &amp; QR Code Terminal</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Mobile and tablet scan resolution for Locations, Lots, Serials, Kits, and Products.
              </p>
              <div className="mt-4 flex gap-2">
                <div className="relative flex-1">
                  <ScanLine className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={barcodeInput}
                    onChange={(e) => setBarcodeInput(e.target.value)}
                    placeholder="Scan or type barcode (e.g. LOC-01-A, LOT-BATCH-99, KIT-001)..."
                    className="w-full rounded-md border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    onKeyDown={(e) => e.key === 'Enter' && handleScanBarcode()}
                  />
                </div>
                <button
                  onClick={handleScanBarcode}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Resolve
                </button>
              </div>

              {scanResult && (
                <div className="mt-6 rounded-lg border bg-muted/50 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Matched Entity: {scanResult.entityType}
                    </span>
                    <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-mono font-medium text-primary">
                      {scanResult.matchedCode}
                    </span>
                  </div>
                  <pre className="mt-3 overflow-x-auto rounded bg-background p-3 text-xs font-mono">
                    {JSON.stringify(scanResult, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Lot Metadata Studio (<DictionaryRenderer />) */}
        {activeTab === 'extensions' && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <h2 className="text-base font-semibold">Application Dictionary Lot Extensions</h2>
                  <p className="text-xs text-muted-foreground">
                    Rendered dynamically via <code className="font-mono text-primary">&lt;DictionaryRenderer /&gt;</code>.
                  </p>
                </div>
                <span className="rounded bg-muted px-2 py-1 text-xs font-mono text-muted-foreground">
                  slot: lot-attributes-slot
                </span>
              </div>

              <div className="mt-4">
                <DictionaryRenderer
                  manifest={DEFAULT_INVENTORY_DICTIONARY_MANIFEST}
                  values={customLotExtensions}
                  onChange={handleCustomFieldChange}
                  errors={validationErrors}
                />
              </div>

              {Object.keys(validationErrors).length > 0 && (
                <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                  <div className="flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="h-4 w-4" />
                    Validation Rules Triggered
                  </div>
                  <ul className="mt-1 list-disc pl-5">
                    {Object.entries(validationErrors).map(([key, msg]) => (
                      <li key={key}>{msg}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <h2 className="text-base font-semibold">Live Extension JSON Payload</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Persisted in <code className="font-mono text-primary">gigalibs_inventory.inventory_lots.custom_extensions</code>.
              </p>
              <pre className="mt-4 overflow-x-auto rounded-lg bg-muted p-4 text-xs font-mono text-foreground">
                {JSON.stringify(customLotExtensions, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* Tab 4: Other Operational Views */}
        {activeTab !== 'overview' && activeTab !== 'scanner' && activeTab !== 'extensions' && (
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between border-b pb-4">
              <div>
                <h2 className="text-base font-semibold capitalize">{activeTab} Operational Directory</h2>
                <p className="text-xs text-muted-foreground">
                  Active tenant context: <span className="font-mono text-foreground">app.current_tenant_id</span>.
                </p>
              </div>
              <button className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
                <Plus className="h-3.5 w-3.5" />
                New {activeTab.slice(0, -1)}
              </button>
            </div>
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Boxes className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-2 font-medium">Ready for real-time warehouse data</p>
              <p className="text-xs text-muted-foreground">Connected to schema gigalibs_inventory via NestJS service.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
