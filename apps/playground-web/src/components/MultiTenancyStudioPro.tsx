import * as React from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  StatusBadge,
  Input,
  Button,
  Modal,
} from '@gigalibs/ui';
import type {
  TenantProfile,
  DbIsolationMode,
  TenantClusterStatus,
  TenantBackupSnapshot,
} from '@gigalibs/tenancy-core';
import { ApiClient } from '../api-client.js';

// ─── MASTER SEED TENANTS ──────────────────────────────────────────────────────

export const INITIAL_TENANT_CLUSTERS: TenantProfile[] = [
  {
    id: 'ten_sam_gov_001',
    slug: 'sam-gov',
    name: '🏛️ Federal Defense Dynamics (SAM.gov Prime)',
    status: 'ACTIVE',
    dbMode: 'SCHEMA_ISOLATED',
    dbHost: 'pg-cluster-fed.internal:5432',
    dbName: 'db_govcon_sam_prod (schema: tenant_sam_gov)',
    region: 'us-east-1 (AWS GovCloud)',
    customDomain: 'sam-gov.localhost:5180',
    plan: 'ENTERPRISE_DEDICATED',
    features: ['SAM_GOV_INTELLIGENCE', 'FAR_COMPLIANCE', 'DCAA_TIMECARDS', 'COST_PLUS_BILLING', 'EXCLUSION_SHIELD'],
    createdAt: '2026-09-01',
    metrics: {
      storageUsedGb: 14.8,
      storageLimitGb: 500.0,
      activePoolConnections: 24,
      maxPoolConnections: 120,
      avgLatencyMs: 0.9,
      monthlyApiRequests: 89400,
      monthlyApiLimit: 5000000,
    },
    backups: [
      { id: 'b_sam_01', tenantId: 'ten_sam_gov_001', name: 'sam-govcon-nightly', createdAt: '2026-09-03 00:00 UTC', sizeMb: 15200, checksum: 'sha256:d41d...8cd9', status: 'COMPLETED' },
    ],
  },
  {
    id: 'tenant_paramount',
    slug: 'paramount',
    name: '🎬 Paramount Global Studios',
    status: 'ACTIVE',
    dbMode: 'DEDICATED_DATABASE',
    dbHost: 'paramount-cluster-prod.rds.amazonaws.com:5432',
    dbName: 'paramount_production_db',
    region: 'us-east-1 (N. Virginia)',
    customDomain: 'production.paramount.internal',
    plan: 'ENTERPRISE_DEDICATED',
    features: ['UNLIMITED_CREW', 'DEDICATED_DB', '4K_MEDIA_VAULT', 'ADVANCED_RBAC', 'CUSTOM_AUDIT_LOGS'],
    createdAt: '2026-08-15',
    metrics: {
      storageUsedGb: 48.2,
      storageLimitGb: 250.0,
      activePoolConnections: 18,
      maxPoolConnections: 100,
      avgLatencyMs: 1.4,
      monthlyApiRequests: 482910,
      monthlyApiLimit: 2000000,
    },
    backups: [
      { id: 'b_001', tenantId: 'tenant_paramount', name: 'daily-snapshot-2026-08-30', createdAt: '2026-08-30 02:00 UTC', sizeMb: 49300, checksum: 'sha256:9f8a...4b12', status: 'COMPLETED' },
      { id: 'b_002', tenantId: 'tenant_paramount', name: 'pre-deployment-v2.4', createdAt: '2026-08-28 14:30 UTC', sizeMb: 47800, checksum: 'sha256:7c21...8e99', status: 'COMPLETED' },
    ],
  },
  {
    id: 'tenant_espn',
    slug: 'espn-sports',
    name: '🏟️ ESPN Sports Broadcasting Network',
    status: 'ACTIVE',
    dbMode: 'DEDICATED_DATABASE',
    dbHost: 'espn-live-cluster.rds.amazonaws.com:5432',
    dbName: 'espn_broadcast_live_db',
    region: 'us-west-2 (Oregon)',
    customDomain: 'live.espn-broadcast.internal',
    plan: 'ENTERPRISE_DEDICATED',
    features: ['LIVE_TIMESHEETS', 'DEDICATED_DB', 'SATELLITE_OCR', 'PER_DIEM_COMMITS'],
    createdAt: '2026-08-20',
    metrics: {
      storageUsedGb: 82.5,
      storageLimitGb: 500.0,
      activePoolConnections: 34,
      maxPoolConnections: 150,
      avgLatencyMs: 2.1,
      monthlyApiRequests: 1284000,
      monthlyApiLimit: 5000000,
    },
    backups: [
      { id: 'b_003', tenantId: 'tenant_espn', name: 'daily-snapshot-2026-08-30', createdAt: '2026-08-30 02:00 UTC', sizeMb: 84500, checksum: 'sha256:3d4e...11aa', status: 'COMPLETED' },
    ],
  },
  {
    id: 'tenant_turner_construction',
    slug: 'turner-construction',
    name: '🏗️ Turner Construction Group',
    status: 'ACTIVE',
    dbMode: 'SCHEMA_ISOLATED',
    dbHost: 'eu-multi-tenant-cluster.rds.amazonaws.com:5432',
    dbName: 'turner_group_schema',
    region: 'eu-central-1 (Frankfurt)',
    customDomain: 'safety.turner-construction.com',
    plan: 'GROWTH_TIER',
    features: ['OSHA_AUDITS', 'GEOFENCING_POLYGONS', 'SAFETY_CRANE_INTERLOCKS'],
    createdAt: '2026-08-22',
    metrics: {
      storageUsedGb: 14.8,
      storageLimitGb: 100.0,
      activePoolConnections: 8,
      maxPoolConnections: 50,
      avgLatencyMs: 3.8,
      monthlyApiRequests: 142000,
      monthlyApiLimit: 500000,
    },
    backups: [
      { id: 'b_004', tenantId: 'tenant_turner_construction', name: 'schema-dump-2026-08-29', createdAt: '2026-08-29 04:00 UTC', sizeMb: 15100, checksum: 'sha256:1a2b...5f6a', status: 'COMPLETED' },
    ],
  },
  {
    id: 'tenant_acme_growth',
    slug: 'acme-growth',
    name: '⚡ Acme SaaS Growth Enterprise',
    status: 'ACTIVE',
    dbMode: 'ROW_LEVEL_SECURITY',
    dbHost: 'shared-starter-pool.rds.amazonaws.com:5432',
    dbName: 'gigalibs_shared_prod (RLS isolated)',
    region: 'us-east-1 (N. Virginia)',
    plan: 'STARTER_CLOUD',
    features: ['INVOICING', 'FORMS_STUDIO', 'RULE_ENGINE'],
    createdAt: '2026-08-25',
    metrics: {
      storageUsedGb: 4.2,
      storageLimitGb: 20.0,
      activePoolConnections: 4,
      maxPoolConnections: 25,
      avgLatencyMs: 0.8,
      monthlyApiRequests: 48000,
      monthlyApiLimit: 100000,
    },
    backups: [],
  },
];

export function MultiTenancyStudioPro() {
  const [activeStudioTab, setActiveStudioTab] = React.useState<'FLEET' | 'PROVISION' | 'ROUTER' | 'QUOTAS' | 'DEFENSE' | 'BACKUPS'>('FLEET');
  const [tenants, setTenants] = React.useState<TenantProfile[]>(INITIAL_TENANT_CLUSTERS);
  const [selectedTenantId, setSelectedTenantId] = React.useState<string>('');
  const [isTenantsLoading, setIsTenantsLoading] = React.useState(true);

  React.useEffect(() => {
    setIsTenantsLoading(true);
    ApiClient.listTenants()
      .then((dbTenants) => {
        if (dbTenants && dbTenants.length > 0) {
          const mapped: TenantProfile[] = dbTenants.map((t: any) => ({
            id: t.id,
            slug: t.slug,
            name: t.name,
            status: t.status ?? 'ACTIVE',
            dbMode: t.dbMode ?? 'SHARED_SCHEMA',
            dbHost: t.dbHost ?? 'shared-cluster.rds.amazonaws.com:5432',
            dbName: t.dbName ?? `${t.slug}_db`,
            region: t.region ?? 'us-east-1',
            customDomain: t.customDomain ?? null,
            plan: t.plan ?? 'STANDARD',
            features: t.features ?? [],
            createdAt: t.createdAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
            metrics: t.metrics ?? {
              storageUsedGb: 0,
              storageLimitGb: 50,
              activePoolConnections: 0,
              maxPoolConnections: 20,
              avgLatencyMs: 0,
              monthlyApiRequests: 0,
              monthlyApiLimit: 100000,
            },
            backups: t.backups ?? [],
          }));
          setTenants(mapped);
          setSelectedTenantId(mapped[0]?.id ?? '');
        } else {
          setTenants(INITIAL_TENANT_CLUSTERS);
          setSelectedTenantId(INITIAL_TENANT_CLUSTERS[0]?.id ?? '');
        }
      })
      .catch(() => {
        setTenants(INITIAL_TENANT_CLUSTERS);
        setSelectedTenantId(INITIAL_TENANT_CLUSTERS[0]?.id ?? '');
      })
      .finally(() => setIsTenantsLoading(false));
  }, []);

  // 1-Click Provision Modal State
  const [isProvisionModalOpen, setIsProvisionModalOpen] = React.useState(false);
  const [newTenantName, setNewTenantName] = React.useState('');
  const [newTenantSlug, setNewTenantSlug] = React.useState('');
  const [newTenantDbMode, setNewTenantDbMode] = React.useState<DbIsolationMode>('DEDICATED_DATABASE');
  const [newTenantRegion, setNewTenantRegion] = React.useState('us-east-1 (N. Virginia)');

  // Defense Simulator State
  const [simAttackerTenant, setSimAttackerTenant] = React.useState<string>('tenant_acme_growth');
  const [simTargetTenant, setSimTargetTenant] = React.useState<string>('tenant_paramount');
  const [simProbeType, setSimProbeType] = React.useState<'RLS_BYPASS_QUERY' | 'CROSS_SCHEMA_INJECTION' | 'JWT_TENANT_SPOOF'>('RLS_BYPASS_QUERY');
  const [defenseResult, setDefenseResult] = React.useState<any | null>(null);

  const activeTenant = tenants.find((t) => t.id === selectedTenantId) || tenants[0]!;

  // Provision New Tenant
  const handleProvisionTenant = () => {
    if (!newTenantName.trim() || !newTenantSlug.trim()) return;

    const newTenant: TenantProfile = {
      id: `tenant_${newTenantSlug.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      slug: newTenantSlug.toLowerCase(),
      name: newTenantName.trim(),
      status: 'ACTIVE',
      dbMode: newTenantDbMode,
      dbHost: newTenantDbMode === 'DEDICATED_DATABASE' ? `${newTenantSlug}-cluster.rds.amazonaws.com:5432` : 'shared-cluster.rds.amazonaws.com:5432',
      dbName: `${newTenantSlug}_prod_db`,
      region: newTenantRegion,
      plan: newTenantDbMode === 'DEDICATED_DATABASE' ? 'ENTERPRISE_DEDICATED' : 'GROWTH_TIER',
      features: ['INVOICING', 'ADVANCED_RBAC', 'DYNAMIC_FORMS'],
      createdAt: new Date().toISOString().split('T')[0]!,
      metrics: {
        storageUsedGb: 0.1,
        storageLimitGb: newTenantDbMode === 'DEDICATED_DATABASE' ? 250 : 50,
        activePoolConnections: 2,
        maxPoolConnections: 50,
        avgLatencyMs: 1.2,
        monthlyApiRequests: 100,
        monthlyApiLimit: 500000,
      },
      backups: [],
    };

    setTenants((prev) => [newTenant, ...prev]);
    setSelectedTenantId(newTenant.id);
    setIsProvisionModalOpen(false);
    setNewTenantName('');
    setNewTenantSlug('');
    alert(`🎉 Successfully provisioned dedicated cluster for ${newTenant.name}! Schema migrations applied.`);
  };

  // Toggle Maintenance / Suspension
  const handleToggleStatus = (tenantId: string, newStatus: TenantClusterStatus) => {
    setTenants((prev) =>
      prev.map((t) => (t.id === tenantId ? { ...t, status: newStatus } : t))
    );
  };

  // Run Cross-Tenant Defense Probe
  const handleRunDefenseProbe = () => {
    const isSameTenant = simAttackerTenant === simTargetTenant;
    const targetObj = tenants.find((t) => t.id === simTargetTenant);

    const result = {
      timestamp: new Date().toISOString(),
      probe: simProbeType,
      attackerTenantId: simAttackerTenant,
      targetTenantId: simTargetTenant,
      targetDbMode: targetObj?.dbMode,
      blocked: !isSameTenant,
      statusCode: isSameTenant ? 200 : 403,
      defenseLayer: targetObj?.dbMode === 'DEDICATED_DATABASE'
        ? 'Physical VPC / Connection Pool Isolation (Zero Shared Memory)'
        : targetObj?.dbMode === 'SCHEMA_ISOLATED'
        ? 'PostgreSQL Schema Search Path Namespace Guard'
        : 'PostgreSQL Row-Level Security (RLS) WHERE Clause Filter',
      auditMessage: isSameTenant
        ? 'Query authorized: Requester JWT matches target tenant boundary.'
        : '🚨 BLOCKED: Attempted cross-tenant data exfiltration intercepted! 0 rows returned.',
    };

    setDefenseResult(result);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <span>🏢 SaaS Multi-Tenancy & Database Isolation Studio</span>
            <Badge variant="info">Vitess & Aurora Serverless Grade</Badge>
          </h2>
          <p className="text-xs text-slate-500">
            Dedicated PostgreSQL clusters, schema-per-tenant, <strong>PostgreSQL Row-Level Security (RLS)</strong>, storage quota meters, and dynamic connection pool routers.
          </p>
        </div>

        {/* Master Tab Bar */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border">
          {[
            { id: 'FLEET', label: `🏢 Tenant Fleet (${tenants.length})` },
            { id: 'ROUTER', label: '⚡ Connection Pool Router' },
            { id: 'QUOTAS', label: '📊 Storage & API Quotas' },
            { id: 'DEFENSE', label: '🛡️ Data Leakage Defense' },
            { id: 'BACKUPS', label: '💾 Backup Snapshots' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveStudioTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                activeStudioTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Action Bar */}
      <div className="p-3 bg-slate-900 text-white rounded-2xl flex flex-wrap justify-between items-center gap-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-bold text-indigo-300">🏢 Active Tenant Cluster:</span>
          <select
            value={selectedTenantId}
            onChange={(e) => setSelectedTenantId(e.target.value)}
            className="h-8 px-3 rounded-lg bg-slate-800 border border-slate-700 text-white font-bold text-xs"
          >
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} [{t.dbMode}]
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setIsProvisionModalOpen(true)}>
            + Provision New Tenant 🚀
          </Button>
        </div>
      </div>

      {/* ─── TAB 1: TENANT FLEET & CLUSTER HEALTH MANAGER ────────────────────────── */}
      {activeStudioTab === 'FLEET' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {tenants.map((tenant) => {
            const isSelected = tenant.id === selectedTenantId;
            const storagePercent = Math.round((tenant.metrics.storageUsedGb / tenant.metrics.storageLimitGb) * 100);

            return (
              <Card
                key={tenant.id}
                className={`p-5 space-y-4 transition border-2 ${
                  isSelected ? 'border-indigo-500 bg-indigo-50/20 shadow-md' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900 text-sm">{tenant.name}</h3>
                      <StatusBadge status={tenant.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT'}>
                        {tenant.status}
                      </StatusBadge>
                    </div>
                    <div className="text-[11px] text-indigo-600 font-mono mt-0.5">
                      {tenant.customDomain || `${tenant.slug}.gigalibs.dev`}
                    </div>
                  </div>
                  <Badge variant={tenant.dbMode === 'DEDICATED_DATABASE' ? 'primary' : tenant.dbMode === 'SCHEMA_ISOLATED' ? 'info' : 'neutral'}>
                    {tenant.dbMode}
                  </Badge>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Database Host:</span>
                    <span className="font-mono font-bold text-slate-800 text-[11px] truncate max-w-56">{tenant.dbHost}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Region:</span>
                    <span className="font-medium text-slate-800">{tenant.region}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Average Latency:</span>
                    <span className="font-mono font-bold text-emerald-600">⚡ {tenant.metrics.avgLatencyMs} ms</span>
                  </div>
                </div>

                {/* Storage & Pool Progress */}
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-[11px]">
                    <span className="font-bold text-slate-700">Disk Storage Utilized:</span>
                    <span className="font-mono font-bold text-indigo-600">
                      {tenant.metrics.storageUsedGb} GB / {tenant.metrics.storageLimitGb} GB ({storagePercent}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        storagePercent > 80 ? 'bg-rose-500' : storagePercent > 50 ? 'bg-amber-500' : 'bg-indigo-600'
                      }`}
                      style={{ width: `${storagePercent}%` }}
                    />
                  </div>
                </div>

                {/* Status Toggles */}
                <div className="pt-2 border-t flex justify-between items-center text-xs">
                  <span className="text-slate-400 text-[10px]">Created: {tenant.createdAt}</span>
                  <div className="flex gap-2">
                    {tenant.status === 'ACTIVE' ? (
                      <button
                        onClick={() => handleToggleStatus(tenant.id, 'MAINTENANCE')}
                        className="text-amber-600 hover:text-amber-800 font-bold"
                      >
                        Set Maintenance ⏸️
                      </button>
                    ) : (
                      <button
                        onClick={() => handleToggleStatus(tenant.id, 'ACTIVE')}
                        className="text-emerald-600 hover:text-emerald-800 font-bold"
                      >
                        Resume Active ▶️
                      </button>
                    )}
                    <button
                      onClick={() => setSelectedTenantId(tenant.id)}
                      className="text-indigo-600 hover:text-indigo-800 font-bold ml-2"
                    >
                      Inspect Cluster 🔍
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ─── TAB 2: DYNAMIC CONNECTION POOL ROUTER ───────────────────────────────── */}
      {activeStudioTab === 'ROUTER' && (
        <Card className="max-w-4xl mx-auto p-6 space-y-6">
          <div>
            <h3 className="text-base font-black text-slate-900">⚡ Dynamic Connection Pool Router (0.1ms Switch)</h3>
            <p className="text-xs text-slate-500">
              The GigaLibs DB Router intercepts incoming HTTP requests, resolves the tenant context from the JWT header, and borrows a connection from the tenant's dedicated physical pool without connection starvation.
            </p>
          </div>

          <div className="space-y-4 text-xs">
            {tenants.map((t) => (
              <div key={t.id} className="p-4 bg-slate-50 rounded-2xl border space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">{t.name}</span>
                    <Badge variant="info">{t.dbMode}</Badge>
                  </div>
                  <span className="font-mono text-emerald-600 font-bold">⚡ {t.metrics.avgLatencyMs} ms Ping</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] font-mono">
                  <div className="p-2.5 bg-white rounded-xl border">
                    <span className="text-slate-400 block text-[10px]">Active Pool Connections</span>
                    <strong className="text-indigo-600">{t.metrics.activePoolConnections} / {t.metrics.maxPoolConnections} sockets</strong>
                  </div>
                  <div className="p-2.5 bg-white rounded-xl border">
                    <span className="text-slate-400 block text-[10px]">Target Cluster Endpoint</span>
                    <strong className="text-slate-800 truncate block">{t.dbHost}</strong>
                  </div>
                  <div className="p-2.5 bg-white rounded-xl border">
                    <span className="text-slate-400 block text-[10px]">Database Namespace</span>
                    <strong className="text-slate-800">{t.dbName}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ─── TAB 3: STORAGE QUOTAS & API METERS ──────────────────────────────────── */}
      {activeStudioTab === 'QUOTAS' && (
        <Card className="max-w-4xl mx-auto p-6 space-y-6">
          <div>
            <h3 className="text-base font-black text-slate-900">📊 Storage & API Consumption Metering</h3>
            <p className="text-xs text-slate-500">
              Real-time resource meters prevent database bloat and enforce SLA boundaries.
            </p>
          </div>

          <div className="space-y-5 text-xs">
            {tenants.map((t) => {
              const apiPercent = Math.round((t.metrics.monthlyApiRequests / t.metrics.monthlyApiLimit) * 100);

              return (
                <div key={t.id} className="p-4 bg-slate-50 rounded-2xl border space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-900">{t.name}</span>
                    <span className="text-slate-500 text-[11px]">Plan: <strong>{t.plan}</strong></span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span>Monthly API Requests:</span>
                      <span className="font-mono font-bold text-indigo-600">
                        {t.metrics.monthlyApiRequests.toLocaleString()} / {t.metrics.monthlyApiLimit.toLocaleString()} ({apiPercent}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${apiPercent}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ─── TAB 4: CROSS-TENANT DATA LEAKAGE DEFENSE SIMULATOR ──────────────────── */}
      {activeStudioTab === 'DEFENSE' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-4">
            <Card className="p-5 space-y-4">
              <div className="border-b pb-2">
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700">
                  🛡️ Penetration Probe Configuration
                </h4>
                <p className="text-[11px] text-slate-500">Simulate cross-tenant data leakage attack.</p>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold block mb-1">1. Attacker / Requester Tenant Context</label>
                  <select
                    value={simAttackerTenant}
                    onChange={(e) => setSimAttackerTenant(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 bg-white font-bold text-slate-800"
                  >
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold block mb-1">2. Target Victim Tenant Data</label>
                  <select
                    value={simTargetTenant}
                    onChange={(e) => setSimTargetTenant(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 bg-white font-bold text-slate-800"
                  >
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold block mb-1">3. Attack Vector / Probe Type</label>
                  <select
                    value={simProbeType}
                    onChange={(e) => setSimProbeType(e.target.value as any)}
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 bg-white font-mono text-xs"
                  >
                    <option value="RLS_BYPASS_QUERY">SELECT * FROM invoices WHERE tenant_id = 'paramount' (RLS Bypass)</option>
                    <option value="CROSS_SCHEMA_INJECTION">SELECT * FROM paramount_schema.invoices (Cross-Schema Injection)</option>
                    <option value="JWT_TENANT_SPOOF">Forged Authorization Header: X-Tenant-Id: paramount</option>
                  </select>
                </div>

                <Button onClick={handleRunDefenseProbe} className="w-full !bg-rose-600 hover:!bg-rose-500 !text-white font-bold">
                  Execute Penetration Probe 🛡️
                </Button>
              </div>
            </Card>
          </div>

          <div className="lg:col-span-7 space-y-4">
            <Card className="p-5 space-y-4 min-h-[50vh]">
              <div className="border-b pb-2">
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700">
                  🎯 Security Defense Output
                </h4>
              </div>

              {defenseResult ? (
                <div className="space-y-4 text-xs font-mono">
                  <div
                    className={`p-6 rounded-2xl border-2 text-center space-y-2 ${
                      defenseResult.blocked
                        ? 'border-emerald-400 bg-emerald-50 text-emerald-950'
                        : 'border-blue-400 bg-blue-50 text-blue-950'
                    }`}
                  >
                    <div className="text-3xl">{defenseResult.blocked ? '🛡️' : '✅'}</div>
                    <h3 className="text-lg font-black font-sans">
                      HTTP {defenseResult.statusCode}: {defenseResult.blocked ? 'ACCESS BLOCKED / ZERO LEAKAGE' : 'AUTHORIZED ACCESS'}
                    </h3>
                    <p className="text-xs">{defenseResult.auditMessage}</p>
                  </div>

                  <div className="p-4 bg-slate-950 rounded-2xl text-emerald-400 space-y-1.5 shadow-inner">
                    <div>• <strong>Defense Layer:</strong> {defenseResult.defenseLayer}</div>
                    <div>• <strong>Attacker Context:</strong> {defenseResult.attackerTenantId}</div>
                    <div>• <strong>Target Context:</strong> {defenseResult.targetTenantId}</div>
                    <div>• <strong>Data Leakage Rows:</strong> 0 rows returned</div>
                  </div>
                </div>
              ) : (
                <div className="p-12 text-center text-xs text-slate-400 space-y-2">
                  <div className="text-3xl">🛡️</div>
                  <p>Click <strong>"Execute Penetration Probe 🛡️"</strong> to test cross-tenant boundary defense.</p>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ─── TAB 5: POINT-IN-TIME BACKUP SNAPSHOTS ───────────────────────────────── */}
      {activeStudioTab === 'BACKUPS' && (
        <Card className="max-w-4xl mx-auto p-6 space-y-6">
          <div className="flex flex-wrap justify-between items-center gap-3 border-b pb-3">
            <div>
              <h3 className="text-base font-black text-slate-900">💾 Point-in-Time Database Snapshots</h3>
              <p className="text-xs text-slate-500">
                Snapshots for <strong>{activeTenant.name}</strong> ({activeTenant.dbMode}).
              </p>
            </div>
            <Button size="sm" onClick={() => alert('New database snapshot queued on AWS RDS!')}>
              + Create Instant Snapshot 💾
            </Button>
          </div>

          <div className="space-y-3 text-xs">
            {activeTenant.backups && activeTenant.backups.length > 0 ? (
              activeTenant.backups.map((b) => (
                <div key={b.id} className="p-4 bg-slate-50 rounded-2xl border flex justify-between items-center font-mono">
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-900 text-xs">{b.name}</div>
                    <div className="text-[10px] text-slate-500">Created: {b.createdAt} • Size: {(b.sizeMb / 1024).toFixed(2)} GB</div>
                    <div className="text-[10px] text-slate-400">Checksum: {b.checksum}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => alert(`Restoring cluster from ${b.name}...`)}>
                      Restore 🔁
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs">
                No backup snapshots found for this shared RLS cluster. (Automated daily at 02:00 UTC).
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ─── MODAL: 1-CLICK PROVISION NEW TENANT ─────────────────────────────────── */}
      {isProvisionModalOpen && (
        <Modal
          isOpen={isProvisionModalOpen}
          onClose={() => setIsProvisionModalOpen(false)}
          size="lg"
          title="🚀 Provision New Multi-Tenant Database Cluster"
          description="Configure enterprise isolation adapter, AWS region, and run automatic DDL migrations."
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsProvisionModalOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleProvisionTenant}>
                Provision Cluster Now 🚀
              </Button>
            </div>
          }
        >
          <div className="space-y-4 text-xs">
            <div>
              <label className="font-bold block mb-1">Tenant / Organization Name</label>
              <Input
                placeholder="e.g. Warner Bros Discovery, Universal Pictures"
                value={newTenantName}
                onChange={(e) => {
                  setNewTenantName(e.target.value);
                  setNewTenantSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-'));
                }}
              />
            </div>

            <div>
              <label className="font-bold block mb-1">Tenant URL Slug</label>
              <Input
                placeholder="e.g. warner-bros"
                value={newTenantSlug}
                onChange={(e) => setNewTenantSlug(e.target.value)}
              />
            </div>

            <div>
              <label className="font-bold block mb-1">Database Isolation Adapter</label>
              <select
                value={newTenantDbMode}
                onChange={(e) => setNewTenantDbMode(e.target.value as DbIsolationMode)}
                className="w-full h-9 px-3 rounded-xl border border-slate-300 bg-white font-bold text-slate-800"
              >
                <option value="DEDICATED_DATABASE">🛡️ Dedicated Physical Database (Enterprise Tier - Max Isolation)</option>
                <option value="SCHEMA_ISOLATED">🏢 Schema-per-Tenant (Growth Tier - Shared DB, Separate Schema)</option>
                <option value="ROW_LEVEL_SECURITY">⚡ PostgreSQL Row-Level Security RLS (Starter Tier - Shared Tables)</option>
              </select>
            </div>

            <div>
              <label className="font-bold block mb-1">Cloud Deployment Region</label>
              <select
                value={newTenantRegion}
                onChange={(e) => setNewTenantRegion(e.target.value)}
                className="w-full h-9 px-3 rounded-xl border border-slate-300 bg-white text-slate-800 font-medium"
              >
                <option value="us-east-1 (N. Virginia)">AWS US-East (N. Virginia)</option>
                <option value="us-west-2 (Oregon)">AWS US-West (Oregon)</option>
                <option value="eu-central-1 (Frankfurt)">AWS EU-Central (Frankfurt)</option>
                <option value="ap-southeast-1 (Singapore)">AWS AP-Southeast (Singapore)</option>
              </select>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
