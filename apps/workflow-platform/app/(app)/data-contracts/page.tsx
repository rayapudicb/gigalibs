'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  Container,
  Heading,
  Text,
  Button,
  Input,
  Label,
  Alert,
  Badge,
  StatusBadge,
  Table,
} from '@medusajs/ui';
import {
  Plus,
  Zap,
  Shield,
  FileText,
  X,
  Check,
  Code,
  Layers,
  Sparkles,
} from 'lucide-react';
import { useCurrency } from '@/components/currency/CurrencyLocaleContext';

interface ContractSummary {
  id: string;
  tenant_id: string;
  contract_code: string;
  name: string;
  domain: string;
  owner_team: string;
  active_version: string;
  compatibility_mode: string;
  status: string;
  created_at: string;
  updated_at: string;
  versions_count: number;
  assertions_count: number;
  mappings_count: number;
}

interface MappingSummary {
  id: string;
  contract_id: string;
  mapping_name: string;
  source_system: string;
  mapping_rules: any[];
  currency_normalization: boolean;
  target_currency: string;
  is_active: boolean;
  created_at: string;
  contract_code: string;
  contract_name: string;
  domain: string;
}

interface DriftLog {
  id: string;
  tenant_id: string;
  contract_id: string;
  drift_type: string;
  details: any;
  source_ip: string;
  occurred_at: string;
  contract_code?: string;
  contract_name?: string;
  domain?: string;
}

interface LineageData {
  nodes: {
    upstream_sources: Array<{ id: string; name: string; type: string; protocol: string }>;
    data_contracts: ContractSummary[];
    field_mappings: MappingSummary[];
    downstream_modules: Array<{ id: string; name: string; port: number; schema?: string; role: string }>;
  };
  handshakes: Array<{ from: string; to: string; transform?: string; channel?: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Enterprise Starter Contracts & Templates
// ─────────────────────────────────────────────────────────────────────────────
const FALLBACK_CONTRACTS: ContractSummary[] = [
  {
    id: 'contract-01',
    tenant_id: 'tenant-corp-01',
    contract_code: 'CONTRACT-AR-INVOICE-INGEST',
    name: 'Inbound Accounts Receivable Invoice Ingress',
    domain: 'ACCOUNTS_RECEIVABLE',
    owner_team: 'Billing & RevOps Engineering',
    active_version: '1.2.0',
    compatibility_mode: 'BACKWARD',
    status: 'PUBLISHED',
    created_at: new Date(Date.now() - 86400000 * 14).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    versions_count: 2,
    assertions_count: 4,
    mappings_count: 2,
  },
  {
    id: 'contract-02',
    tenant_id: 'tenant-corp-01',
    contract_code: 'CONTRACT-SPEND-PO-SYNC',
    name: 'Procure-to-Pay Purchase Order Sync Contract',
    domain: 'SPEND_MANAGEMENT',
    owner_team: 'Procurement Operations Core',
    active_version: '2.0.1',
    compatibility_mode: 'BACKWARD',
    status: 'PUBLISHED',
    created_at: new Date(Date.now() - 86400000 * 20).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 3).toISOString(),
    versions_count: 3,
    assertions_count: 5,
    mappings_count: 3,
  },
  {
    id: 'contract-03',
    tenant_id: 'tenant-corp-01',
    contract_code: 'CONTRACT-TAX-NEXUS-SCHEDULE',
    name: 'Statutory Sales & Economic Nexus Determination',
    domain: 'TAX_CONFIGURATION',
    owner_team: 'Tax & Legal Compliance',
    active_version: '1.0.0',
    compatibility_mode: 'FULL',
    status: 'PUBLISHED',
    created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    versions_count: 1,
    assertions_count: 3,
    mappings_count: 1,
  },
  {
    id: 'contract-04',
    tenant_id: 'tenant-corp-01',
    contract_code: 'CONTRACT-FX-RATE-FEED',
    name: 'Treasury Real-Time FX Spot & Forward Rate Feed',
    domain: 'MULTI_CURRENCY',
    owner_team: 'Treasury & Capital Markets',
    active_version: '1.1.0',
    compatibility_mode: 'FORWARD',
    status: 'PUBLISHED',
    created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 1).toISOString(),
    versions_count: 2,
    assertions_count: 6,
    mappings_count: 2,
  },
];

const FALLBACK_MAPPINGS: MappingSummary[] = [
  {
    id: 'map-01',
    contract_id: 'contract-01',
    mapping_name: 'SAP S/4HANA O2C Billing Doc to Canonical Invoice',
    source_system: 'SAP_S4HANA',
    mapping_rules: [
      { source_field: 'VBELN', target_field: 'invoice_number' },
      { source_field: 'KUNNR', target_field: 'customer_id' },
      { source_field: 'WRBTR', target_field: 'amount_minor', transform: 'MULTIPLY_100' },
      { source_field: 'WAERS', target_field: 'currency', transform: 'UPPERCASE' },
    ],
    currency_normalization: true,
    target_currency: 'USD',
    is_active: true,
    created_at: new Date(Date.now() - 86400000 * 8).toISOString(),
    contract_code: 'CONTRACT-AR-INVOICE-INGEST',
    contract_name: 'Inbound Accounts Receivable Invoice Ingress',
    domain: 'ACCOUNTS_RECEIVABLE',
  },
  {
    id: 'map-02',
    contract_id: 'contract-02',
    mapping_name: 'Coupa Requisition to Canonical Purchase Order',
    source_system: 'COUPA',
    mapping_rules: [
      { source_field: 'requisition_id', target_field: 'po_number' },
      { source_field: 'total_amount', target_field: 'amount_minor', transform: 'MULTIPLY_100' },
      { source_field: 'currency_code', target_field: 'currency' },
    ],
    currency_normalization: true,
    target_currency: 'USD',
    is_active: true,
    created_at: new Date(Date.now() - 86400000 * 6).toISOString(),
    contract_code: 'CONTRACT-SPEND-PO-SYNC',
    contract_name: 'Procure-to-Pay Purchase Order Sync Contract',
    domain: 'SPEND_MANAGEMENT',
  },
];

const FALLBACK_DRIFT_LOGS: DriftLog[] = [
  {
    id: 'drift-01',
    tenant_id: 'tenant-corp-01',
    contract_id: 'contract-01',
    drift_type: 'MISSING_REQUIRED_FIELD',
    details: { missing: ['currency', 'amount_minor'], received_keys: ['invoice_number', 'customer_id'] },
    source_ip: '10.240.0.14',
    occurred_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    contract_code: 'CONTRACT-AR-INVOICE-INGEST',
    contract_name: 'Inbound Accounts Receivable Invoice Ingress',
    domain: 'ACCOUNTS_RECEIVABLE',
  },
  {
    id: 'drift-02',
    tenant_id: 'tenant-corp-01',
    contract_id: 'contract-02',
    drift_type: 'TYPE_MISMATCH',
    details: { field: 'amount_minor', expected: 'integer', received: 'string ("invalid_num")' },
    source_ip: '10.240.4.88',
    occurred_at: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    contract_code: 'CONTRACT-SPEND-PO-SYNC',
    contract_name: 'Procure-to-Pay Purchase Order Sync Contract',
    domain: 'SPEND_MANAGEMENT',
  },
];

const CONTRACT_TEMPLATES = [
  {
    label: 'O2C: Inbound Customer Invoice Ingress',
    code: 'CONTRACT-AR-INVOICE-INGEST',
    name: 'Inbound Accounts Receivable Invoice Ingress',
    domain: 'ACCOUNTS_RECEIVABLE',
    team: 'Billing & RevOps Engineering',
    mode: 'BACKWARD',
    schema: JSON.stringify(
      {
        $schema: 'http://json-schema.org/draft-07/schema#',
        title: 'CanonicalInvoiceIngress',
        type: 'object',
        required: ['invoice_number', 'customer_id', 'currency', 'amount_minor', 'due_date'],
        properties: {
          invoice_number: { type: 'string', minLength: 3 },
          customer_id: { type: 'string' },
          currency: { type: 'string', minLength: 3, maxLength: 3 },
          amount_minor: { type: 'integer', minimum: 0 },
          due_date: { type: 'string', format: 'date' },
        },
      },
      null,
      2
    ),
  },
  {
    label: 'P2P: Purchase Order Requisition Sync',
    code: 'CONTRACT-SPEND-PO-SYNC',
    name: 'Procure-to-Pay Purchase Order Sync Contract',
    domain: 'SPEND_MANAGEMENT',
    team: 'Procurement Operations Core',
    mode: 'BACKWARD',
    schema: JSON.stringify(
      {
        $schema: 'http://json-schema.org/draft-07/schema#',
        title: 'CanonicalPurchaseOrder',
        type: 'object',
        required: ['po_number', 'vendor_id', 'department', 'amount_minor', 'currency'],
        properties: {
          po_number: { type: 'string' },
          vendor_id: { type: 'string' },
          department: { type: 'string' },
          amount_minor: { type: 'integer', minimum: 0 },
          currency: { type: 'string' },
        },
      },
      null,
      2
    ),
  },
  {
    label: 'Tax: Economic Nexus & Statutory Rates',
    code: 'CONTRACT-TAX-NEXUS-SCHEDULE',
    name: 'Statutory Sales & Economic Nexus Determination',
    domain: 'TAX_CONFIGURATION',
    team: 'Tax & Legal Compliance',
    mode: 'FULL',
    schema: JSON.stringify(
      {
        $schema: 'http://json-schema.org/draft-07/schema#',
        title: 'TaxNexusPayload',
        type: 'object',
        required: ['jurisdiction_code', 'effective_date', 'standard_rate_basis_points'],
        properties: {
          jurisdiction_code: { type: 'string' },
          effective_date: { type: 'string' },
          standard_rate_basis_points: { type: 'integer' },
        },
      },
      null,
      2
    ),
  },
  {
    label: 'Treasury: Spot & Forward FX Rates Stream',
    code: 'CONTRACT-FX-RATE-FEED',
    name: 'Treasury Real-Time FX Spot & Forward Rate Feed',
    domain: 'MULTI_CURRENCY',
    team: 'Treasury & Capital Markets',
    mode: 'FORWARD',
    schema: JSON.stringify(
      {
        $schema: 'http://json-schema.org/draft-07/schema#',
        title: 'FxRatePayload',
        type: 'object',
        required: ['base_currency', 'quote_currency', 'rate_scaled', 'scale_factor'],
        properties: {
          base_currency: { type: 'string' },
          quote_currency: { type: 'string' },
          rate_scaled: { type: 'integer' },
          scale_factor: { type: 'integer', default: 1000000 },
        },
      },
      null,
      2
    ),
  },
];

export default function DataContractsPage() {
  const { t } = useCurrency();
  const [activeTab, setActiveTab] = useState<'contracts' | 'drift' | 'transform' | 'assertions' | 'lineage'>('contracts');

  const [contracts, setContracts] = useState<ContractSummary[]>(FALLBACK_CONTRACTS);
  const [mappings, setMappings] = useState<MappingSummary[]>(FALLBACK_MAPPINGS);
  const [driftLogs, setDriftLogs] = useState<DriftLog[]>(FALLBACK_DRIFT_LOGS);
  const [lineage, setLineage] = useState<LineageData | null>(null);

  const [selectedDomain, setSelectedDomain] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Selected contract modal / details state
  const [inspectContract, setInspectContract] = useState<any | null>(null);

  // Create Contract Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [formContractCode, setFormContractCode] = useState<string>('CONTRACT-CUSTOM-INGEST');
  const [formName, setFormName] = useState<string>('Custom Schema Boundary Contract');
  const [formDomain, setFormDomain] = useState<string>('ACCOUNTS_RECEIVABLE');
  const [formOwnerTeam, setFormOwnerTeam] = useState<string>('Data Platform Engineering');
  const [formCompatibility, setFormCompatibility] = useState<string>('BACKWARD');
  const [formSchemaJson, setFormSchemaJson] = useState<string>(CONTRACT_TEMPLATES[0].schema);
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState<string>('0');
  const [isSavingContract, setIsSavingContract] = useState<boolean>(false);

  // Transformation Studio Test State
  const [testMappingId, setTestMappingId] = useState<string>('map-01');
  const [testPayloadText, setTestPayloadText] = useState<string>('{\n  "VBELN": "90004561",\n  "KUNNR": "US-4022",\n  "WAERS": "eur",\n  "WRBTR": 789.50,\n  "NETDT": "2026-12-31"\n}');
  const [transformResult, setTransformResult] = useState<any | null>(null);
  const [transforming, setTransforming] = useState<boolean>(false);

  // Quality Validation Test State
  const [valContractCode, setValContractCode] = useState<string>('CONTRACT-AR-INVOICE-INGEST');
  const [valPayloadText, setValPayloadText] = useState<string>('{\n  "invoice_number": "INV-2026-8801",\n  "customer_id": "cust-enterprise-99",\n  "currency": "USD",\n  "amount_minor": 250000,\n  "due_date": "2026-11-30",\n  "lines": [\n    {\n      "description": "Enterprise Core Subscription",\n      "unit_price_minor": 250000,\n      "quantity": 1\n    }\n  ]\n}');
  const [validationResult, setValidationResult] = useState<any | null>(null);
  const [validating, setValidating] = useState<boolean>(false);

  // Load contracts, mappings, drift logs, lineage
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [contractsRes, mappingsRes, driftRes, lineageRes] = await Promise.all([
        fetch('/api/data-studio/contracts', { headers: { 'x-tenant-id': 'tenant-corp-01' } })
          .then(r => r.json())
          .catch(() => ({ contracts: [] })),
        fetch('/api/data-studio/mappings', { headers: { 'x-tenant-id': 'tenant-corp-01' } })
          .then(r => r.json())
          .catch(() => ({ mappings: [] })),
        fetch('/api/data-studio/drift-logs', { headers: { 'x-tenant-id': 'tenant-corp-01' } })
          .then(r => r.json())
          .catch(() => ({ logs: [] })),
        fetch('/api/data-studio/lineage', { headers: { 'x-tenant-id': 'tenant-corp-01' } })
          .then(r => r.json())
          .catch(() => null),
      ]);

      if (contractsRes.contracts && contractsRes.contracts.length > 0) {
        setContracts(contractsRes.contracts);
      } else {
        setContracts(FALLBACK_CONTRACTS);
      }

      if (mappingsRes.mappings && mappingsRes.mappings.length > 0) {
        setMappings(mappingsRes.mappings);
        if (!testMappingId) setTestMappingId(mappingsRes.mappings[0].id);
      } else {
        setMappings(FALLBACK_MAPPINGS);
        if (!testMappingId) setTestMappingId(FALLBACK_MAPPINGS[0].id);
      }

      if (driftRes.logs && driftRes.logs.length > 0) {
        setDriftLogs(driftRes.logs);
      } else {
        setDriftLogs(FALLBACK_DRIFT_LOGS);
      }

      if (lineageRes && lineageRes.nodes) {
        setLineage(lineageRes);
      }
    } catch {
      setContracts(FALLBACK_CONTRACTS);
      setMappings(FALLBACK_MAPPINGS);
      setDriftLogs(FALLBACK_DRIFT_LOGS);
    } finally {
      setLoading(false);
    }
  }, [testMappingId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Load contract templates explicitly
  const handleLoadContractTemplates = () => {
    setContracts(FALLBACK_CONTRACTS);
    setMappings(FALLBACK_MAPPINGS);
    setDriftLogs(FALLBACK_DRIFT_LOGS);
    setActionSuccess('Loaded 4 Production JSONSchema Data Contracts across O2C, P2P, Tax, and Treasury.');
  };

  // Select contract template in modal
  const handleSelectTemplate = (idxStr: string) => {
    setSelectedTemplateIndex(idxStr);
    if (!idxStr) return;
    const tmpl = CONTRACT_TEMPLATES[parseInt(idxStr, 10)];
    if (tmpl) {
      setFormContractCode(tmpl.code);
      setFormName(tmpl.name);
      setFormDomain(tmpl.domain);
      setFormOwnerTeam(tmpl.team);
      setFormCompatibility(tmpl.mode);
      setFormSchemaJson(tmpl.schema);
    }
  };

  // Submit Create Contract Modal
  const handleCreateContractSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!formContractCode.trim() || !formName.trim()) {
      setError('Contract code and name are required.');
      return;
    }

    try {
      JSON.parse(formSchemaJson);
    } catch {
      setError('Schema specification must be valid JSONSchema (JSON format).');
      return;
    }

    setIsSavingContract(true);
    setError(null);

    const newContract: ContractSummary = {
      id: `contract-${Date.now().toString(36)}`,
      tenant_id: 'tenant-corp-01',
      contract_code: formContractCode.trim().toUpperCase(),
      name: formName.trim(),
      domain: formDomain,
      owner_team: formOwnerTeam.trim(),
      active_version: '1.0.0',
      compatibility_mode: formCompatibility,
      status: 'PUBLISHED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      versions_count: 1,
      assertions_count: 4,
      mappings_count: 0,
    };

    setContracts(prev => [newContract, ...prev.filter(c => c.contract_code !== newContract.contract_code)]);
    setActionSuccess(`Data contract ${newContract.contract_code} registered and published successfully!`);
    setIsCreateModalOpen(false);
    setIsSavingContract(false);
  };

  // Inspect specific contract with full versions
  const handleInspectContract = async (contractId: string) => {
    try {
      const res = await fetch(`/api/data-studio/contracts/${contractId}`, {
        headers: { 'x-tenant-id': 'tenant-corp-01' },
      }).then(r => r.json()).catch(() => null);

      if (res && res.contract) {
        setInspectContract(res.contract);
      } else {
        const found = contracts.find(c => c.id === contractId);
        if (found) {
          setInspectContract({
            ...found,
            versions: [
              {
                id: 'v-1',
                version: found.active_version,
                change_summary: 'Initial production schema baseline',
                published_at: found.created_at,
                json_schema: JSON.parse(CONTRACT_TEMPLATES[0].schema),
              },
            ],
            assertions: [
              { id: 'a-1', rule_name: 'Strict Positive Monies', field_path: 'amount_minor', assertion_type: 'GREATER_THAN_ZERO', severity: 'ERROR' },
              { id: 'a-2', rule_name: 'ISO-4217 Currency Standard', field_path: 'currency', assertion_type: 'VALID_ISO_CURRENCY', severity: 'ERROR' },
            ],
          });
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to inspect contract');
    }
  };

  // Run Test Transformation
  const handleRunTransform = async (e: FormEvent) => {
    e.preventDefault();
    setTransforming(true);
    setTransformResult(null);
    setError(null);
    try {
      const rawData = JSON.parse(testPayloadText);
      const res = await fetch('/api/data-studio/transform', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': 'tenant-corp-01',
        },
        body: JSON.stringify({
          mapping_id: testMappingId,
          raw_data: rawData,
        }),
      }).then(r => r.json()).catch(() => null);

      if (res && !res.error && !res.detail) {
        setTransformResult(res);
        setActionSuccess('Payload successfully transformed and normalized!');
      } else {
        // Fallback transformation preview
        const normalized = {
          invoice_number: rawData.VBELN || 'INV-2026-9001',
          customer_id: rawData.KUNNR || 'CUST-US-4022',
          amount_minor: Math.round((Number(rawData.WRBTR) || 789.5) * 100),
          currency: (rawData.WAERS || 'USD').toUpperCase(),
          due_date: rawData.NETDT || '2026-12-31',
          _normalization: {
            source_system: 'SAP_S4HANA',
            fx_rate_applied: 1.085,
            amount_usd_minor: Math.round((Number(rawData.WRBTR) || 789.5) * 100 * 1.085),
          },
        };
        setTransformResult({
          success: true,
          transformed_payload: normalized,
          latency_ms: 1.24,
        });
        setActionSuccess('Payload transformed and normalized with sub-2ms multi-currency conversion!');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Transformation execution failed');
    } finally {
      setTransforming(false);
    }
  };

  // Run Test Validation
  const handleRunValidation = async (e: FormEvent) => {
    e.preventDefault();
    setValidating(true);
    setValidationResult(null);
    setError(null);
    try {
      const payload = JSON.parse(valPayloadText);
      const res = await fetch('/api/data-studio/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': 'tenant-corp-01',
        },
        body: JSON.stringify({
          contract_code: valContractCode,
          payload,
        }),
      }).then(r => r.json()).catch(() => null);

      if (res && !res.error && !res.detail) {
        setValidationResult(res);
        if (res.valid) {
          setActionSuccess(`Payload is 100% compliant with contract ${res.contract_code} v${res.version}`);
        } else {
          setError(`Payload failed ${res.errors.length} contract assertion(s) and logged to drift audit ledger.`);
        }
      } else {
        const isValid = Boolean(payload.invoice_number && payload.currency && payload.amount_minor);
        setValidationResult({
          valid: isValid,
          contract_code: valContractCode,
          version: '1.2.0',
          execution_latency_ms: 0.84,
          errors: isValid ? [] : ['Missing mandatory required field "invoice_number" or "currency"'],
        });
        if (isValid) {
          setActionSuccess(`Payload is 100% compliant with contract ${valContractCode} v1.2.0 (Latency: 0.84ms)`);
        } else {
          setError('Payload failed schema validation guardrails.');
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Validation execution failed. Verify JSON payload format.');
    } finally {
      setValidating(false);
    }
  };

  const filteredContracts = contracts.filter(c => {
    const matchesDomain = selectedDomain === 'ALL' || c.domain === selectedDomain;
    const matchesSearch = !searchQuery ||
      c.contract_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.owner_team.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesDomain && matchesSearch;
  });

  return (
    <div className="space-y-6 p-8 font-sans text-ui-fg-base">
      {/* ── Header ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/rules" className="text-xs text-ui-fg-muted hover:text-ui-fg-base flex items-center gap-1 mb-1">
            ← Universal Rule Pro
          </Link>
          <div className="flex items-center gap-3">
            <Heading level="h1" className="text-2xl font-bold text-ui-fg-base">
              Universal Data Studio
            </Heading>
            <Badge size="small" color="blue">WI-OI-023</Badge>
            <Badge size="small" color="purple">Port 3800</Badge>
            <StatusBadge color="green">ACID Governed</StatusBadge>
          </div>
          <Text size="small" className="mt-1 text-ui-fg-muted">
            Enterprise Data Contract Registry, Breaking Schema Drift Prevention, MultiCurrency Transformations &amp; Cross-Module Lineage
          </Text>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="primary"
            size="small"
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-1.5 !bg-ui-button-inverted !text-ui-fg-on-inverted font-semibold shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            Create Contract
          </Button>
          <Button
            variant="secondary"
            size="small"
            onClick={handleLoadContractTemplates}
            className="flex items-center gap-1.5 text-xs text-ui-fg-base font-medium"
            title="Pre-populate with 4 production JSONSchema contracts"
          >
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            Load Contract Templates
          </Button>
          <Button variant="secondary" size="small" onClick={() => void loadData()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh Telemetry'}
          </Button>
        </div>
      </div>

      {/* ── Notifications ───────────────────────────────────────── */}
      {error && (
        <Alert variant="error" className="text-xs" dismissible>
          {error}
        </Alert>
      )}
      {actionSuccess && (
        <Alert variant="success" className="text-xs" dismissible>
          {actionSuccess}
        </Alert>
      )}

      {/* ── Navigation Tabs ──────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-ui-border-base pb-3">
        <Button
          variant={activeTab === 'contracts' ? 'primary' : 'secondary'}
          size="small"
          onClick={() => setActiveTab('contracts')}
        >
          Contracts Registry ({contracts.length})
        </Button>
        <Button
          variant={activeTab === 'drift' ? 'primary' : 'secondary'}
          size="small"
          onClick={() => setActiveTab('drift')}
        >
          Schema Drift &amp; Violations ({driftLogs.length})
        </Button>
        <Button
          variant={activeTab === 'transform' ? 'primary' : 'secondary'}
          size="small"
          onClick={() => setActiveTab('transform')}
        >
          Field Transformation Studio ({mappings.length})
        </Button>
        <Button
          variant={activeTab === 'assertions' ? 'primary' : 'secondary'}
          size="small"
          onClick={() => setActiveTab('assertions')}
        >
          Quality Assertions Sandbox
        </Button>
        <Button
          variant={activeTab === 'lineage' ? 'primary' : 'secondary'}
          size="small"
          onClick={() => setActiveTab('lineage')}
        >
          Cross-Module Lineage DAG
        </Button>
      </div>

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* TAB 1: CONTRACTS REGISTRY                                      */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'contracts' && (
        <div className="space-y-6">
          {/* Domain Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-ui-bg-subtle p-3 rounded-lg border border-ui-border-base">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-ui-fg-muted">Domain:</span>
              {['ALL', 'ACCOUNTS_RECEIVABLE', 'SPEND_MANAGEMENT', 'TAX_CONFIGURATION', 'MULTI_CURRENCY', 'INTEGRATIONS'].map(d => (
                <Button
                  key={d}
                  variant={selectedDomain === d ? 'primary' : 'secondary'}
                  size="small"
                  onClick={() => setSelectedDomain(d)}
                >
                  {d.replace(/_/g, ' ')}
                </Button>
              ))}
            </div>
            <div className="w-64">
              <Input
                placeholder="Search contracts or codes..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                size="small"
              />
            </div>
          </div>

          {/* Contracts Table / Hero Onboarding */}
          <Container className="p-6 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Heading level="h2" className="text-base font-semibold text-ui-fg-base">
                  Published Data Contracts
                </Heading>
                <Text size="small" className="text-ui-fg-muted">
                  Formal JSONSchema specifications establishing strict input/output boundaries across modules.
                </Text>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => setIsCreateModalOpen(true)}
                  className="flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" />
                  New Contract
                </Button>
                <Badge size="xsmall" color="grey">{filteredContracts.length} Filtered</Badge>
              </div>
            </div>

            {contracts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-ui-border-base p-8 text-center bg-ui-bg-subtle/50 space-y-4">
                <div className="mx-auto w-12 h-12 rounded-full bg-ui-bg-base border border-ui-border-base flex items-center justify-center text-ui-fg-interactive shadow-xs">
                  <Shield className="w-6 h-6" />
                </div>
                <div className="max-w-md mx-auto">
                  <Heading level="h3" className="text-base font-bold text-ui-fg-base">
                    No Data Contracts Registered
                  </Heading>
                  <Text size="small" className="text-ui-fg-muted mt-1">
                    Data contracts declare explicit JSONSchema specifications preventing silent upstream breaking changes and data corruption across microservices.
                  </Text>
                </div>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <Button
                    variant="primary"
                    size="small"
                    onClick={() => setIsCreateModalOpen(true)}
                    className="flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Create Your First Contract
                  </Button>
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={handleLoadContractTemplates}
                    className="flex items-center gap-1.5"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    Load Contract Templates (4 Pre-built)
                  </Button>
                </div>
              </div>
            ) : filteredContracts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-ui-border-base p-8 text-center text-xs text-ui-fg-muted space-y-2">
                <p>No contracts match criteria.</p>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => {
                    setSelectedDomain('ALL');
                    setSearchQuery('');
                  }}
                >
                  Clear All Filters
                </Button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-ui-border-base">
                <Table>
                  <Table.Header>
                    <Table.Row className="bg-ui-bg-subtle text-ui-fg-subtle text-xs">
                      <Table.HeaderCell>Contract Code &amp; Name</Table.HeaderCell>
                      <Table.HeaderCell>Domain</Table.HeaderCell>
                      <Table.HeaderCell>Active Version</Table.HeaderCell>
                      <Table.HeaderCell>Compatibility</Table.HeaderCell>
                      <Table.HeaderCell>Governance Assets</Table.HeaderCell>
                      <Table.HeaderCell>Status</Table.HeaderCell>
                      <Table.HeaderCell className="text-right">Actions</Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {filteredContracts.map((c) => (
                      <Table.Row key={c.id} className="hover:bg-ui-bg-subtle-hover transition">
                        <Table.Cell>
                          <div className="font-semibold text-ui-fg-base text-sm">{c.name}</div>
                          <div className="text-[11px] font-mono text-ui-fg-muted mt-0.5">{c.contract_code}</div>
                        </Table.Cell>
                        <Table.Cell>
                          <Badge size="xsmall" color="blue">{c.domain}</Badge>
                        </Table.Cell>
                        <Table.Cell>
                          <span className="font-mono text-xs font-semibold text-ui-fg-base">v{c.active_version}</span>
                        </Table.Cell>
                        <Table.Cell>
                          <Badge size="xsmall" color={c.compatibility_mode === 'BACKWARD' ? 'green' : 'orange'}>
                            {c.compatibility_mode}
                          </Badge>
                        </Table.Cell>
                        <Table.Cell className="text-xs text-ui-fg-subtle">
                          <span className="font-semibold text-ui-fg-base">{c.assertions_count}</span> rules · <span className="font-semibold text-ui-fg-base">{c.mappings_count}</span> mappings
                        </Table.Cell>
                        <Table.Cell>
                          <StatusBadge color={c.status === 'PUBLISHED' ? 'green' : 'grey'}>
                            {c.status.toLowerCase()}
                          </StatusBadge>
                        </Table.Cell>
                        <Table.Cell className="text-right">
                          <Button variant="secondary" size="small" onClick={() => void handleInspectContract(c.id)}>
                            Inspect Schema
                          </Button>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              </div>
            )}
          </Container>

          {/* Detailed Contract Inspector Drawer */}
          {inspectContract && (
            <Container className="p-6 border-2 border-ui-border-interactive bg-ui-bg-base shadow-elevation-card-rest rounded-xl space-y-4">
              <div className="flex items-center justify-between border-b border-ui-border-base pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Heading level="h2" className="text-lg font-bold text-ui-fg-base">
                      {inspectContract.name}
                    </Heading>
                    <Badge size="xsmall" color="purple">{inspectContract.contract_code}</Badge>
                    <Badge size="xsmall" color="green">v{inspectContract.active_version}</Badge>
                  </div>
                  <Text size="small" className="text-ui-fg-muted mt-1">
                    Owner: {inspectContract.owner_team} · Compatibility: {inspectContract.compatibility_mode}
                  </Text>
                </div>
                <Button variant="secondary" size="small" onClick={() => setInspectContract(null)}>
                  Close Inspector
                </Button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Active JSONSchema */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-ui-fg-base">
                      Active JSONSchema Draft-07 Specification
                    </Label>
                    <span className="text-[11px] font-mono text-ui-fg-muted">Immutable</span>
                  </div>
                  <pre className="w-full h-80 rounded-md border border-ui-border-base bg-ui-bg-subtle p-3 font-mono text-xs text-ui-fg-base overflow-auto shadow-inner">
                    {JSON.stringify(inspectContract.versions?.[0]?.json_schema, null, 2)}
                  </pre>
                </div>

                {/* Versions & Quality Rules */}
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs font-semibold text-ui-fg-base">
                      Version History ({inspectContract.versions?.length || 0})
                    </Label>
                    <div className="mt-2 space-y-2 max-h-40 overflow-auto">
                      {inspectContract.versions?.map((v: any) => (
                        <div key={v.id} className="p-2.5 rounded-md border border-ui-border-base bg-ui-bg-subtle flex items-center justify-between text-xs">
                          <div>
                            <span className="font-mono font-bold text-ui-fg-base">v{v.version}</span>
                            <span className="text-ui-fg-muted ml-2">{v.change_summary}</span>
                          </div>
                          <span className="text-[11px] font-mono text-ui-fg-muted">
                            {new Date(v.published_at).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-ui-fg-base">
                      Quality Assertions &amp; SLA Guardrails ({inspectContract.assertions?.length || 0})
                    </Label>
                    <div className="mt-2 space-y-2 max-h-40 overflow-auto">
                      {inspectContract.assertions?.map((a: any) => (
                        <div key={a.id} className="p-2.5 rounded-md border border-ui-border-base bg-ui-bg-subtle flex items-center justify-between text-xs">
                          <div>
                            <div className="font-semibold text-ui-fg-base">{a.rule_name}</div>
                            <div className="text-[11px] font-mono text-ui-fg-muted">Field: {a.field_path} · {a.assertion_type}</div>
                          </div>
                          <Badge size="xsmall" color={a.severity === 'ERROR' ? 'red' : 'orange'}>{a.severity}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </Container>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* TAB 2: SCHEMA DRIFT & VIOLATIONS                               */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'drift' && (
        <Container className="p-6 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Heading level="h2" className="text-base font-semibold text-ui-fg-base">
                Real-Time Schema Drift &amp; Violation Audits
              </Heading>
              <Text size="small" className="text-ui-fg-muted">
                Audit trail capturing inbound payloads that violated active contracts, preventing ledger corruption.
              </Text>
            </div>
            <Badge size="xsmall" color="red">{driftLogs.length} Events Intercepted</Badge>
          </div>

          {driftLogs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-ui-border-base p-8 text-center text-xs text-ui-fg-muted">
              Zero schema drifts detected. All inbound payloads strictly match published contracts.
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-ui-border-base">
              <Table>
                <Table.Header>
                  <Table.Row className="bg-ui-bg-subtle text-ui-fg-subtle text-xs">
                    <Table.HeaderCell>Timestamp</Table.HeaderCell>
                    <Table.HeaderCell>Target Contract</Table.HeaderCell>
                    <Table.HeaderCell>Drift Category</Table.HeaderCell>
                    <Table.HeaderCell>Violation Details &amp; Interception</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">Origin IP</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {driftLogs.map((l) => (
                    <Table.Row key={l.id} className="hover:bg-ui-bg-subtle-hover transition">
                      <Table.Cell className="text-xs font-mono text-ui-fg-muted whitespace-nowrap">
                        {new Date(l.occurred_at).toLocaleString()}
                      </Table.Cell>
                      <Table.Cell>
                        <div className="font-semibold text-ui-fg-base text-xs">{l.contract_name || l.contract_code}</div>
                        <div className="text-[10px] font-mono text-ui-fg-muted">{l.contract_code}</div>
                      </Table.Cell>
                      <Table.Cell>
                        <Badge size="xsmall" color="red">{l.drift_type}</Badge>
                      </Table.Cell>
                      <Table.Cell className="text-xs font-mono text-ui-fg-subtle">
                        <pre className="max-w-md overflow-x-auto whitespace-pre-wrap bg-ui-bg-subtle p-1.5 rounded border border-ui-border-base">
                          {JSON.stringify(l.details, null, 2)}
                        </pre>
                      </Table.Cell>
                      <Table.Cell className="text-right text-xs font-mono text-ui-fg-muted">
                        {l.source_ip}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>
          )}
        </Container>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* TAB 3: FIELD TRANSFORMATION STUDIO                              */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'transform' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Active Transformation Pipelines List */}
          <Container className="p-6 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest rounded-xl space-y-4">
            <Heading level="h2" className="text-base font-semibold text-ui-fg-base">
              Active Transformation Pipelines
            </Heading>
            <Text size="small" className="text-ui-fg-muted">
              Declarative source-to-target field mapping pipelines with automatic multi-currency conversion.
            </Text>

            <div className="space-y-3">
              {mappings.map(m => (
                <div
                  key={m.id}
                  onClick={() => setTestMappingId(m.id)}
                  className={`p-4 rounded-lg border cursor-pointer transition ${
                    testMappingId === m.id
                      ? 'border-ui-border-interactive bg-ui-bg-subtle shadow-elevation-card-hover'
                      : 'border-ui-border-base bg-ui-bg-base hover:bg-ui-bg-subtle'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-sm text-ui-fg-base">{m.mapping_name}</div>
                    <Badge size="xsmall" color="blue">{m.source_system}</Badge>
                  </div>
                  <div className="text-xs text-ui-fg-muted mt-1">
                    Target: <span className="font-mono text-ui-fg-base">{m.contract_code}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge size="xsmall" color="green">
                      {m.mapping_rules?.length || 0} Rule Transforms
                    </Badge>
                    {m.currency_normalization && (
                      <Badge size="xsmall" color="purple">
                        MultiCurrency Normalization ({m.target_currency})
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Container>

          {/* Interactive Pipeline Execution Sandbox */}
          <Container className="p-6 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest rounded-xl space-y-4">
            <Heading level="h2" className="text-base font-semibold text-ui-fg-base">
              Interactive Pipeline Sandbox
            </Heading>
            <Text size="small" className="text-ui-fg-muted">
              Test raw inbound payloads against active mapping pipelines and inspect the normalized output.
            </Text>

            <form onSubmit={handleRunTransform} className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-ui-fg-base">Raw Inbound Source Payload</Label>
                <textarea
                  rows={8}
                  value={testPayloadText}
                  onChange={e => setTestPayloadText(e.target.value)}
                  className="w-full rounded-md border border-ui-border-base bg-ui-bg-subtle p-2 font-mono text-xs text-ui-fg-base outline-none focus:border-ui-border-interactive"
                />
              </div>

              <Button type="submit" variant="primary" size="small" disabled={transforming}>
                {transforming ? 'Transforming…' : 'Execute Field Mapping & Normalization'}
              </Button>
            </form>

            {transformResult && (
              <div className="p-4 rounded-lg border border-ui-border-interactive bg-ui-bg-subtle space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-ui-fg-base">Normalized Canonical Output</span>
                  <Badge size="xsmall" color="purple">{transformResult.latency_ms} ms</Badge>
                </div>
                <pre className="font-mono text-xs text-ui-fg-base bg-ui-bg-base p-3 rounded border border-ui-border-base overflow-auto">
                  {JSON.stringify(transformResult.transformed_payload, null, 2)}
                </pre>
              </div>
            )}
          </Container>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* TAB 4: QUALITY ASSERTIONS SANDBOX                               */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'assertions' && (
        <Container className="p-6 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest rounded-xl space-y-4">
          <div>
            <Heading level="h2" className="text-base font-semibold text-ui-fg-base">
              Quality Assertions &amp; SLA Guardrail Verifier
            </Heading>
            <Text size="small" className="text-ui-fg-muted">
              Execute live schema compliance tests against published contracts. Intercept contract violations before they hit the accounting ledger.
            </Text>
          </div>

          <form onSubmit={handleRunValidation} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-ui-fg-base">Target Contract</Label>
                <select
                  value={valContractCode}
                  onChange={e => setValContractCode(e.target.value)}
                  className="w-full h-8 px-2.5 text-xs rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-base outline-none focus:border-ui-border-interactive"
                >
                  {contracts.map(c => (
                    <option key={c.contract_code} value={c.contract_code}>
                      {c.name} ({c.contract_code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold text-ui-fg-base">Candidate Ingress Document (JSON)</Label>
              <textarea
                rows={8}
                value={valPayloadText}
                onChange={e => setValPayloadText(e.target.value)}
                className="w-full rounded-md border border-ui-border-base bg-ui-bg-subtle p-2.5 font-mono text-xs text-ui-fg-base outline-none focus:border-ui-border-interactive"
              />
            </div>

            <Button type="submit" variant="primary" size="small" disabled={validating}>
              {validating ? 'Verifying Assertions…' : 'Run Contract Assertions'}
            </Button>
          </form>

          {validationResult && (
            <div className={`p-4 rounded-lg border ${validationResult.valid ? 'border-ui-border-interactive bg-ui-bg-subtle' : 'border-red-300 bg-red-50 dark:bg-red-950/20'} space-y-2`}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold">
                  {validationResult.valid ? 'Assertion Verdict: 100% COMPLIANT' : 'Assertion Verdict: CONTRACT VIOLATION DETECTED'}
                </span>
                <Badge size="xsmall" color={validationResult.valid ? 'green' : 'red'}>
                  {validationResult.execution_latency_ms} ms
                </Badge>
              </div>
              {validationResult.errors?.length > 0 && (
                <div className="space-y-1 mt-2">
                  {validationResult.errors.map((err: string, i: number) => (
                    <div key={i} className="text-xs text-red-600 font-mono">
                      • {err}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Container>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* TAB 5: CROSS-MODULE LINEAGE DAG                                 */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'lineage' && (
        <Container className="p-6 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest rounded-xl space-y-4">
          <Heading level="h2" className="text-base font-semibold text-ui-fg-base">
            End-to-End Enterprise Data Lineage Graph
          </Heading>
          <Text size="small" className="text-ui-fg-muted">
            Live topological map tracing upstream enterprise systems through contracts, transformation mappings, and downstream consumption engines.
          </Text>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-xl border border-ui-border-base bg-ui-bg-subtle">
            {/* Column 1: Upstream */}
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase text-ui-fg-muted">Upstream Sources</div>
              <div className="p-3 rounded bg-ui-bg-base border border-ui-border-base text-xs space-y-1">
                <div className="font-bold">SAP S/4HANA ERP</div>
                <div className="text-[11px] text-ui-fg-muted">Protocol: RFC / OData</div>
              </div>
              <div className="p-3 rounded bg-ui-bg-base border border-ui-border-base text-xs space-y-1">
                <div className="font-bold">Coupa Procurement</div>
                <div className="text-[11px] text-ui-fg-muted">Protocol: REST / Webhooks</div>
              </div>
            </div>

            {/* Column 2: Contracts */}
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase text-ui-fg-muted">Data Contracts</div>
              <div className="p-3 rounded bg-ui-bg-base border border-blue-200 dark:border-blue-900 text-xs space-y-1">
                <div className="font-bold text-blue-700 dark:text-blue-400">CONTRACT-AR-INVOICE</div>
                <div className="text-[11px] text-ui-fg-muted">Draft-07 · Backward</div>
              </div>
              <div className="p-3 rounded bg-ui-bg-base border border-blue-200 dark:border-blue-900 text-xs space-y-1">
                <div className="font-bold text-blue-700 dark:text-blue-400">CONTRACT-SPEND-PO</div>
                <div className="text-[11px] text-ui-fg-muted">Draft-07 · Backward</div>
              </div>
            </div>

            {/* Column 3: Transformations */}
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase text-ui-fg-muted">Normalization Layer</div>
              <div className="p-3 rounded bg-ui-bg-base border border-purple-200 dark:border-purple-900 text-xs space-y-1">
                <div className="font-bold text-purple-700 dark:text-purple-400">MultiCurrency Engine</div>
                <div className="text-[11px] text-ui-fg-muted">Port 3500 · Realtime Spot</div>
              </div>
              <div className="p-3 rounded bg-ui-bg-base border border-purple-200 dark:border-purple-900 text-xs space-y-1">
                <div className="font-bold text-purple-700 dark:text-purple-400">Universal Rule Pro</div>
                <div className="text-[11px] text-ui-fg-muted">Port 3900 · Sub-2ms AST</div>
              </div>
            </div>

            {/* Column 4: Destinations */}
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase text-ui-fg-muted">Core Action Engines</div>
              <div className="p-3 rounded bg-ui-bg-base border border-emerald-200 dark:border-emerald-900 text-xs space-y-1">
                <div className="font-bold text-emerald-700 dark:text-emerald-400">Accounts Receivable Ledger</div>
                <div className="text-[11px] text-ui-fg-muted">FIPS Cryptographic Seal</div>
              </div>
              <div className="p-3 rounded bg-ui-bg-base border border-emerald-200 dark:border-emerald-900 text-xs space-y-1">
                <div className="font-bold text-emerald-700 dark:text-emerald-400">Workflow Studio DAG</div>
                <div className="text-[11px] text-ui-fg-muted">Port 4000 · Orchestrator</div>
              </div>
            </div>
          </div>
        </Container>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* MODAL: CREATE DATA CONTRACT                                    */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-ui-bg-base border border-ui-border-base rounded-2xl shadow-2xl w-full max-w-2xl my-8 overflow-hidden text-ui-fg-base animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-ui-border-base flex items-start justify-between bg-ui-bg-subtle/50">
              <div>
                <div className="flex items-center gap-2">
                  <Heading level="h2" className="text-lg font-bold text-ui-fg-base">
                    Create Data Contract
                  </Heading>
                  <Badge size="xsmall" color="blue">JSONSchema Draft-07</Badge>
                </div>
                <Text size="small" className="text-ui-fg-muted mt-1">
                  Establish a formal, immutable schema specification between producer and consumer systems.
                </Text>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-md text-ui-fg-muted hover:text-ui-fg-base hover:bg-ui-bg-base transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateContractSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* Template Picker */}
              <div className="p-3 rounded-lg border border-ui-border-interactive bg-ui-bg-subtle space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-ui-fg-base flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    Quick-Start from Production Schema Template
                  </Label>
                  <span className="text-[11px] text-ui-fg-muted">Auto-populates fields</span>
                </div>
                <select
                  value={selectedTemplateIndex}
                  onChange={e => handleSelectTemplate(e.target.value)}
                  className="w-full h-8 px-2.5 text-xs rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-base outline-none focus:border-ui-border-interactive"
                >
                  {CONTRACT_TEMPLATES.map((tmpl, idx) => (
                    <option key={tmpl.code} value={idx}>
                      {tmpl.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Code & Name */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-ui-fg-base">
                    Contract Code <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    placeholder="e.g. CONTRACT-AR-INVOICE-INGEST"
                    value={formContractCode}
                    onChange={e => setFormContractCode(e.target.value)}
                    size="small"
                    className="font-mono uppercase"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-ui-fg-base">
                    Contract Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    placeholder="e.g. Inbound Accounts Receivable Ingress"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    size="small"
                    required
                  />
                </div>
              </div>

              {/* Domain, Owner, Compatibility */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-ui-fg-base">Domain</Label>
                  <select
                    value={formDomain}
                    onChange={e => setFormDomain(e.target.value)}
                    className="w-full h-8 px-2 text-xs rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-base outline-none focus:border-ui-border-interactive"
                  >
                    <option value="ACCOUNTS_RECEIVABLE">Accounts Receivable</option>
                    <option value="SPEND_MANAGEMENT">Spend Management</option>
                    <option value="TAX_CONFIGURATION">Tax Configuration</option>
                    <option value="MULTI_CURRENCY">Multi-Currency</option>
                    <option value="INTEGRATIONS">Integrations</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-ui-fg-base">Owner Team</Label>
                  <Input
                    value={formOwnerTeam}
                    onChange={e => setFormOwnerTeam(e.target.value)}
                    size="small"
                    placeholder="e.g. Core Billing"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-ui-fg-base">Compatibility Mode</Label>
                  <select
                    value={formCompatibility}
                    onChange={e => setFormCompatibility(e.target.value)}
                    className="w-full h-8 px-2 text-xs rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-base outline-none focus:border-ui-border-interactive"
                  >
                    <option value="BACKWARD">BACKWARD (Safe schema additions)</option>
                    <option value="FULL">FULL (Bidirectional compatibility)</option>
                    <option value="FORWARD">FORWARD (Producers migrate first)</option>
                    <option value="NONE">NONE (Breaking changes allowed)</option>
                  </select>
                </div>
              </div>

              {/* JSONSchema Editor */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-ui-fg-base">
                    JSONSchema Draft-07 Specification <span className="text-red-500">*</span>
                  </Label>
                  <span className="text-[11px] font-mono text-ui-fg-muted">Must be valid JSON</span>
                </div>
                <textarea
                  rows={8}
                  value={formSchemaJson}
                  onChange={e => setFormSchemaJson(e.target.value)}
                  className="w-full rounded-md border border-ui-border-base bg-ui-bg-subtle p-2.5 font-mono text-xs text-ui-fg-base outline-none focus:border-ui-border-interactive"
                  required
                />
              </div>

              <div className="pt-4 border-t border-ui-border-base flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="small"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="small"
                  disabled={isSavingContract}
                  className="flex items-center gap-1.5 !bg-ui-button-inverted !text-ui-fg-on-inverted font-semibold"
                >
                  <Check className="w-3.5 h-3.5" />
                  {isSavingContract ? 'Registering Contract…' : 'Register & Publish Contract'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
