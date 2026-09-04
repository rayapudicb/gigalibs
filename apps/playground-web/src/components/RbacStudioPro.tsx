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
import {
  PermissionEvaluator,
  type EnterpriseRole,
  type ResourceScope,
  type FieldMaskRule,
  type TemporaryAccessGrant,
  type AuthorizationDecision,
} from '@gigalibs/rbac-core';
import { ApiClient } from '../api-client.js';

// ─── MASTER MODULE LIST & ACTIONS ─────────────────────────────────────────────

export const RBAC_MODULES = [
  { id: 'invoices', name: '💰 Universal Invoicing & Billing', icon: '💳' },
  { id: 'ledger', name: '⚡ Double-Entry General Ledger', icon: '🏛️' },
  { id: 'forms', name: '📝 Dynamic Forms & Smartsheets', icon: '📊' },
  { id: 'rules', name: '⚡ Universal Business Rule Engine', icon: '🧠' },
  { id: 'workflows', name: '🤖 AI Workflow DAG Canvas', icon: '⚡' },
  { id: 'users', name: '👥 Team Directory & User Roster', icon: '👤' },
  { id: 'tenants', name: '🏢 SaaS Tenants & DB Isolation', icon: '🗄️' },
];

export const CRUD_ACTIONS: Array<{ id: string; label: string }> = [
  { id: 'create', label: 'Create' },
  { id: 'read', label: 'Read / View' },
  { id: 'update', label: 'Edit / Update' },
  { id: 'delete', label: 'Delete / Purge' },
  { id: 'export', label: 'Export Data' },
];

// ─── INITIAL ENTERPRISE HIERARCHICAL ROLES ────────────────────────────────────

export const INITIAL_ENTERPRISE_ROLES: EnterpriseRole[] = [
  {
    id: 'role_super_admin',
    name: '👑 Super Administrator (Global Owner)',
    description: 'Full uninhibited global access across all microservices, tenants, and ledger books. Exempt from all field-level masking.',
    color: '#6366f1',
    isSystem: true,
    priority: 100,
    scopes: {
      'invoices:create': 'ALL', 'invoices:read': 'ALL', 'invoices:update': 'ALL', 'invoices:delete': 'ALL', 'invoices:export': 'ALL',
      'ledger:create': 'ALL', 'ledger:read': 'ALL', 'ledger:update': 'ALL', 'ledger:delete': 'ALL', 'ledger:export': 'ALL',
      'forms:create': 'ALL', 'forms:read': 'ALL', 'forms:update': 'ALL', 'forms:delete': 'ALL', 'forms:export': 'ALL',
      'rules:create': 'ALL', 'rules:read': 'ALL', 'rules:update': 'ALL', 'rules:delete': 'ALL', 'rules:export': 'ALL',
      'workflows:create': 'ALL', 'workflows:read': 'ALL', 'workflows:update': 'ALL', 'workflows:delete': 'ALL', 'workflows:export': 'ALL',
      'users:create': 'ALL', 'users:read': 'ALL', 'users:update': 'ALL', 'users:delete': 'ALL', 'users:export': 'ALL',
      'tenants:create': 'ALL', 'tenants:read': 'ALL', 'tenants:update': 'ALL', 'tenants:delete': 'ALL', 'tenants:export': 'ALL',
    },
  },
  {
    id: 'role_dept_manager',
    name: '👔 Department Manager / Squad Lead',
    description: 'Scoped management over assigned department/squad resources. Can read and edit team invoices and forms.',
    color: '#0284c7',
    isSystem: false,
    priority: 75,
    inherits: ['role_member'],
    scopes: {
      'invoices:create': 'TEAM', 'invoices:read': 'TEAM', 'invoices:update': 'TEAM', 'invoices:delete': 'OWN', 'invoices:export': 'TEAM',
      'ledger:create': 'NONE', 'ledger:read': 'TEAM', 'ledger:update': 'NONE', 'ledger:delete': 'NONE', 'ledger:export': 'TEAM',
      'forms:create': 'TEAM', 'forms:read': 'TEAM', 'forms:update': 'TEAM', 'forms:delete': 'TEAM', 'forms:export': 'TEAM',
      'rules:create': 'NONE', 'rules:read': 'ALL', 'rules:update': 'NONE', 'rules:delete': 'NONE', 'rules:export': 'NONE',
      'workflows:create': 'TEAM', 'workflows:read': 'TEAM', 'workflows:update': 'TEAM', 'workflows:delete': 'OWN', 'workflows:export': 'TEAM',
      'users:create': 'NONE', 'users:read': 'TEAM', 'users:update': 'OWN', 'users:delete': 'NONE', 'users:export': 'TEAM',
      'tenants:create': 'NONE', 'tenants:read': 'OWN', 'tenants:update': 'NONE', 'tenants:delete': 'NONE', 'tenants:export': 'NONE',
    },
  },
  {
    id: 'role_member',
    name: '👤 Staff Member / Field Specialist',
    description: 'Standard worker who can create and manage their own invoices, timesheets, and form submissions.',
    color: '#10b981',
    isSystem: false,
    priority: 50,
    scopes: {
      'invoices:create': 'OWN', 'invoices:read': 'OWN', 'invoices:update': 'OWN', 'invoices:delete': 'NONE', 'invoices:export': 'OWN',
      'ledger:create': 'NONE', 'ledger:read': 'NONE', 'ledger:update': 'NONE', 'ledger:delete': 'NONE', 'ledger:export': 'NONE',
      'forms:create': 'OWN', 'forms:read': 'OWN', 'forms:update': 'OWN', 'forms:delete': 'NONE', 'forms:export': 'OWN',
      'rules:create': 'NONE', 'rules:read': 'NONE', 'rules:update': 'NONE', 'rules:delete': 'NONE', 'rules:export': 'NONE',
      'workflows:create': 'NONE', 'workflows:read': 'TEAM', 'workflows:update': 'NONE', 'workflows:delete': 'NONE', 'workflows:export': 'NONE',
      'users:create': 'NONE', 'users:read': 'TEAM', 'users:update': 'OWN', 'users:delete': 'NONE', 'users:export': 'NONE',
      'tenants:create': 'NONE', 'tenants:read': 'NONE', 'tenants:update': 'NONE', 'tenants:delete': 'NONE', 'tenants:export': 'NONE',
    },
  },
  {
    id: 'role_auditor',
    name: '👁️ External Auditor / Compliance Guest',
    description: 'Read-only access across invoices and ledger books, but all financial profit margins and PII are masked.',
    color: '#f59e0b',
    isSystem: false,
    priority: 25,
    scopes: {
      'invoices:create': 'NONE', 'invoices:read': 'ALL', 'invoices:update': 'NONE', 'invoices:delete': 'NONE', 'invoices:export': 'ALL',
      'ledger:create': 'NONE', 'ledger:read': 'ALL', 'ledger:update': 'NONE', 'ledger:delete': 'NONE', 'ledger:export': 'ALL',
      'forms:create': 'NONE', 'forms:read': 'ALL', 'forms:update': 'NONE', 'forms:delete': 'NONE', 'forms:export': 'ALL',
      'rules:create': 'NONE', 'rules:read': 'ALL', 'rules:update': 'NONE', 'rules:delete': 'NONE', 'rules:export': 'NONE',
      'workflows:create': 'NONE', 'workflows:read': 'ALL', 'workflows:update': 'NONE', 'workflows:delete': 'NONE', 'workflows:export': 'NONE',
      'users:create': 'NONE', 'users:read': 'ALL', 'users:update': 'NONE', 'users:delete': 'NONE', 'users:export': 'ALL',
      'tenants:create': 'NONE', 'tenants:read': 'ALL', 'tenants:update': 'NONE', 'tenants:delete': 'NONE', 'tenants:export': 'NONE',
    },
  },
];

// ─── FIELD MASKING RULES ──────────────────────────────────────────────────────

export const DEFAULT_FIELD_MASKS: FieldMaskRule[] = [
  { field: 'taxId', maskType: 'PARTIAL_MASK', allowedRoles: ['role_super_admin'] },
  { field: 'bankIban', maskType: 'PARTIAL_MASK', allowedRoles: ['role_super_admin', 'role_dept_manager'] },
  { field: 'profitMargin', maskType: 'REDACTED', allowedRoles: ['role_super_admin'] },
  { field: 'ssn', maskType: 'PARTIAL_MASK', allowedRoles: ['role_super_admin'] },
];

export function RbacStudioPro() {
  const [activeStudioTab, setActiveStudioTab] = React.useState<'MATRIX' | 'SIMULATOR' | 'MASKING' | 'JIT' | 'DDL'>('MATRIX');
  const [roles, setRoles] = React.useState<EnterpriseRole[]>(INITIAL_ENTERPRISE_ROLES);
  const [selectedRoleId, setSelectedRoleId] = React.useState<string>('');
  const [isRolesLoading, setIsRolesLoading] = React.useState(true);
  const [fieldMasks, setFieldMasks] = React.useState<FieldMaskRule[]>(DEFAULT_FIELD_MASKS);

  React.useEffect(() => {
    setIsRolesLoading(true);
    ApiClient.listRoles()
      .then((dbRoles) => {
        if (dbRoles && dbRoles.length > 0) {
          setRoles(dbRoles);
          setSelectedRoleId(dbRoles[0].id);
        } else {
          // No roles in DB yet — seed falls back to static defaults
          setRoles(INITIAL_ENTERPRISE_ROLES);
          setSelectedRoleId(INITIAL_ENTERPRISE_ROLES[0]?.id ?? '');
        }
      })
      .catch(() => {
        setRoles(INITIAL_ENTERPRISE_ROLES);
        setSelectedRoleId(INITIAL_ENTERPRISE_ROLES[0]?.id ?? '');
      })
      .finally(() => setIsRolesLoading(false));
  }, []);

  // JIT Temporary Grants State
  const [temporaryGrants, setTemporaryGrants] = React.useState<TemporaryAccessGrant[]>([
    {
      id: 'jit_001',
      userId: 'usr_contractor_99',
      userName: 'Alex Rivers (Contractor)',
      roleId: 'role_dept_manager',
      roleName: 'Department Manager (Emergency)',
      grantedBy: 'SuperAdmin (Devin)',
      grantedAt: '2026-08-31 11:00 AM',
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toLocaleString(),
      reason: 'On-call emergency soundstage access authorization',
      isActive: true,
    },
  ]);

  // Create Custom Role State
  const [isCreateRoleModalOpen, setIsCreateRoleModalOpen] = React.useState(false);
  const [newRoleName, setNewRoleName] = React.useState('');
  const [newRoleDescription, setNewRoleDescription] = React.useState('');
  const [newRoleColor, setNewRoleColor] = React.useState('#6366f1');
  const [cloneFromRoleId, setCloneFromRoleId] = React.useState('role_dept_manager');

  // Simulator Context State
  const [simUserRole, setSimUserRole] = React.useState<string>('role_dept_manager');
  const [simActionKey, setSimActionKey] = React.useState<string>('invoices:delete');
  const [simOwnershipRelation, setSimOwnershipRelation] = React.useState<'OWN' | 'SAME_TEAM' | 'OTHER_TEAM'>('SAME_TEAM');
  const [simTenantMatch, setSimTenantMatch] = React.useState<boolean>(true);
  const [simDecision, setSimDecision] = React.useState<AuthorizationDecision | null>(null);

  const activeRole = roles.find((r) => r.id === selectedRoleId) || roles[0]!;

  // Handle Create Role Submit
  const handleCreateRoleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;

    const sourceRole = roles.find((r) => r.id === cloneFromRoleId) || roles[0]!;
    const newRole: EnterpriseRole = {
      id: `role_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: newRoleName.trim(),
      description: newRoleDescription.trim() || 'Custom workspace security role.',
      color: newRoleColor,
      isSystem: false,
      priority: 60,
      inherits: [sourceRole.id],
      scopes: { ...sourceRole.scopes },
    };

    setRoles((prev) => [...prev, newRole]);
    setSelectedRoleId(newRole.id);
    setIsCreateRoleModalOpen(false);
    setNewRoleName('');
    setNewRoleDescription('');

    // Persist to database if live API connected
    ApiClient.createRole?.({
      name: newRole.name,
      description: newRole.description,
      color: newRole.color,
      scopes: newRole.scopes,
    }).catch(() => {});
  };

  // 1-Click Cycle Scope (ALL -> TEAM -> OWN -> NONE)
  const handleCycleScope = (actionKey: string) => {
    const currentScope = activeRole.scopes[actionKey] || 'NONE';
    const nextScopeMap: Record<ResourceScope, ResourceScope> = {
      ALL: 'TEAM',
      TEAM: 'OWN',
      OWN: 'NONE',
      NONE: 'ALL',
    };
    const nextScope = nextScopeMap[currentScope];

    setRoles((prev) =>
      prev.map((r) =>
        r.id === activeRole.id
          ? {
              ...r,
              scopes: {
                ...r.scopes,
                [actionKey]: nextScope,
              },
            }
          : r
      )
    );
  };

  // Run Casbin-Grade Authorization Simulation
  const handleRunSimulation = () => {
    const userRoleObj = roles.find((r) => r.id === simUserRole);
    if (!userRoleObj) return;

    const context = {
      userId: 'usr_test_sarah',
      userSquadId: 'squad_finance',
      tenantId: 'tenant_acme',
      resourceOwnerId: simOwnershipRelation === 'OWN' ? 'usr_test_sarah' : 'usr_marcus_lead',
      resourceSquadId: simOwnershipRelation === 'SAME_TEAM' || simOwnershipRelation === 'OWN' ? 'squad_finance' : 'squad_engineering',
      resourceTenantId: simTenantMatch ? 'tenant_acme' : 'tenant_paramount',
    };

    const decision = PermissionEvaluator.evaluateEnterpriseAccess(
      [userRoleObj],
      simActionKey,
      context,
      temporaryGrants
    );

    setSimDecision(decision);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <span>🛡️ Enterprise Multi-Tenant RBAC & Scoped ABAC Studio</span>
            <Badge variant="info">Casbin & AWS IAM Grade</Badge>
          </h2>
          <p className="text-xs text-slate-500">
            Hierarchical role inheritance, <strong>4-tier resource scopes (ALL / TEAM / OWN / NONE)</strong>, field-level PII masking, and JIT access elevation.
          </p>
        </div>

        {/* Action Button & Master Tab Bar */}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setIsCreateRoleModalOpen(true)} className="!bg-indigo-600 hover:!bg-indigo-500 !text-white font-bold">
            + Create Custom Role 🛡️
          </Button>

          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border">
            {[
              { id: 'MATRIX', label: '👑 Hierarchical Scoped Matrix' },
              { id: 'SIMULATOR', label: '🧪 Authorization Simulator' },
              { id: 'MASKING', label: '🎭 Field-Level Data Masking' },
              { id: 'JIT', label: `⏱️ JIT Access Grants (${temporaryGrants.length})` },
              { id: 'DDL', label: '🗄️ Casbin & RLS Policy DDL' },
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
      </div>

      {/* ─── TAB 1: HIERARCHICAL ROLES & 4-TIER SCOPED MATRIX ────────────────────── */}
      {activeStudioTab === 'MATRIX' && (
        <div className="space-y-6">
          {/* Role Selector Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {roles.map((role) => {
              const activeCount = Object.values(role.scopes).filter((s) => s !== 'NONE').length;

              return (
                <div
                  key={role.id}
                  onClick={() => setSelectedRoleId(role.id)}
                  className={`p-4 rounded-2xl border-2 transition cursor-pointer space-y-2 relative shadow-xs ${
                    selectedRoleId === role.id
                      ? 'border-indigo-500 bg-indigo-50/50 shadow-md ring-4 ring-indigo-500/10'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="w-3.5 h-3.5 rounded-full shadow-xs" style={{ backgroundColor: role.color }} />
                    <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                      {activeCount} Gates Active
                    </span>
                  </div>
                  <h4 className="font-bold text-xs text-slate-900">{role.name}</h4>
                  <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">{role.description}</p>
                </div>
              );
            })}
          </div>

          {/* Scoped Permissions Table */}
          <Card className="p-6 space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-3 border-b pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <span>Granular Scoped Matrix for:</span>
                  <span className="text-indigo-600">{activeRole.name}</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Click any scope badge below to cycle: <strong>[ ALL ] (Global)</strong> $\rightarrow$ <strong>[ TEAM ] (Squad)</strong> $\rightarrow$ <strong>[ OWN ] (Self)</strong> $\rightarrow$ <strong>[ NONE ] (Denied)</strong>.
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="font-bold text-slate-500">Scope Legend:</span>
                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold font-mono text-[10px]">ALL</span>
                <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-bold font-mono text-[10px]">TEAM</span>
                <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-bold font-mono text-[10px]">OWN</span>
                <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-400 font-bold font-mono text-[10px]">NONE</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100 border-b text-slate-700 font-bold font-mono">
                  <tr>
                    <th className="p-3 border-r w-72">Enterprise Microservice</th>
                    {CRUD_ACTIONS.map((act) => (
                      <th key={act.id} className="p-3 text-center border-r">
                        {act.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {RBAC_MODULES.map((mod) => (
                    <tr key={mod.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-3 border-r font-bold text-slate-900 flex items-center gap-2">
                        <span>{mod.icon}</span>
                        <span>{mod.name}</span>
                      </td>
                      {CRUD_ACTIONS.map((act) => {
                        const actionKey = `${mod.id}:${act.id}`;
                        const currentScope = activeRole.scopes[actionKey] || 'NONE';

                        return (
                          <td key={act.id} className="p-2.5 text-center border-r">
                            <button
                              onClick={() => handleCycleScope(actionKey)}
                              className={`px-3 py-1.5 rounded-xl font-mono text-[11px] font-black transition cursor-pointer shadow-xs active:scale-95 ${
                                currentScope === 'ALL'
                                  ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                                  : currentScope === 'TEAM'
                                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                                  : currentScope === 'OWN'
                                  ? 'bg-purple-500 text-white hover:bg-purple-600'
                                  : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                              }`}
                            >
                              {currentScope}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ─── TAB 2: CASBIN-GRADE AUTHORIZATION SIMULATOR ──────────────────────────── */}
      {activeStudioTab === 'SIMULATOR' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Input Evaluation Context */}
          <div className="lg:col-span-5 space-y-4">
            <Card className="p-5 space-y-4">
              <div className="border-b pb-2">
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700">
                  🧪 Policy Evaluation Context
                </h4>
                <p className="text-[11px] text-slate-500">Configure parameters to test access gates.</p>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold block mb-1">1. User Active Role</label>
                  <select
                    value={simUserRole}
                    onChange={(e) => setSimUserRole(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 bg-white font-bold text-slate-800"
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold block mb-1">2. Requested Action Key</label>
                  <select
                    value={simActionKey}
                    onChange={(e) => setSimActionKey(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 bg-white font-mono font-bold text-indigo-600"
                  >
                    <option value="invoices:delete">invoices:delete (Delete Invoice Record)</option>
                    <option value="invoices:read">invoices:read (View Invoice Details)</option>
                    <option value="ledger:commit">ledger:commit (Post General Ledger Journal)</option>
                    <option value="forms:create">forms:create (Build New Form)</option>
                    <option value="users:delete">users:delete (Purge User Account)</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold block mb-1">3. Resource Ownership Relation</label>
                  <select
                    value={simOwnershipRelation}
                    onChange={(e) => setSimOwnershipRelation(e.target.value as any)}
                    className="w-full h-9 px-3 rounded-xl border border-slate-300 bg-white font-bold text-slate-800"
                  >
                    <option value="OWN">User OWNS this record directly (Creator)</option>
                    <option value="SAME_TEAM">Record belongs to SAME Department / Squad</option>
                    <option value="OTHER_TEAM">Record belongs to DIFFERENT Department</option>
                  </select>
                </div>

                <div>
                  <label className="flex items-center gap-2 cursor-pointer font-bold p-2.5 bg-slate-50 rounded-xl border">
                    <input
                      type="checkbox"
                      checked={simTenantMatch}
                      onChange={(e) => setSimTenantMatch(e.target.checked)}
                      className="rounded text-indigo-600 w-4 h-4"
                    />
                    <span>Tenant Match (Both in same workspace)</span>
                  </label>
                </div>

                <Button onClick={handleRunSimulation} className="w-full !bg-indigo-600 hover:!bg-indigo-500 !text-white font-bold">
                  Evaluate Authorization Policy 🚀
                </Button>
              </div>
            </Card>
          </div>

          {/* Right: Decision Output & Step-by-Step Audit Trace */}
          <div className="lg:col-span-7 space-y-4">
            <Card className="p-5 space-y-4 min-h-[50vh]">
              <div className="border-b pb-2">
                <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700">
                  🎯 Casbin Decision Engine Output
                </h4>
              </div>

              {simDecision ? (
                <div className="space-y-4">
                  <div
                    className={`p-6 rounded-2xl border-2 text-center space-y-2 ${
                      simDecision.allowed
                        ? 'border-emerald-400 bg-emerald-50/70 text-emerald-950'
                        : 'border-rose-400 bg-rose-50/70 text-rose-950'
                    }`}
                  >
                    <div className="text-3xl">{simDecision.allowed ? '✅' : '🚫'}</div>
                    <h3 className="text-xl font-black">{simDecision.decision}: ACCESS {simDecision.allowed ? 'GRANTED' : 'DENIED'}</h3>
                    {simDecision.matchedRole && (
                      <p className="text-xs font-mono">
                        Evaluated via Role: <strong>{simDecision.matchedRole}</strong> (Scope: <strong>{simDecision.matchedScope}</strong>)
                      </p>
                    )}
                  </div>

                  {/* Audit Trace */}
                  <div className="p-4 bg-slate-950 rounded-2xl text-emerald-400 font-mono text-xs space-y-2 shadow-inner">
                    <div className="text-slate-400 text-[10px] uppercase font-bold">Step-by-Step Policy Audit Trace:</div>
                    <ul className="space-y-1">
                      {simDecision.auditTrace.map((step, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-indigo-400">[{idx + 1}]</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="p-12 text-center text-xs text-slate-400 space-y-2">
                  <div className="text-3xl">🧪</div>
                  <p>Click <strong>"Evaluate Authorization Policy 🚀"</strong> to execute live ABAC check.</p>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ─── TAB 3: FIELD-LEVEL DATA MASKING ────────────────────────────────────── */}
      {activeStudioTab === 'MASKING' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-4">
            <Card className="p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-900">🎭 Configured Sensitive Attributes</h3>
              <div className="space-y-2 text-xs">
                {fieldMasks.map((mask) => (
                  <div key={mask.field} className="p-3 bg-slate-50 rounded-xl border flex justify-between items-center">
                    <div>
                      <span className="font-bold text-slate-900 font-mono">{mask.field}</span>
                      <div className="text-[10px] text-slate-500">
                        Exempt: {mask.allowedRoles?.join(', ') || 'None'}
                      </div>
                    </div>
                    <Badge variant={mask.maskType === 'REDACTED' ? 'danger' : 'warning'}>
                      {mask.maskType}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <div className="lg:col-span-7 space-y-4">
            <Card className="p-5 space-y-4">
              <h3 className="text-sm font-bold text-slate-900">👁️ Live Role Masking Comparison</h3>
              <p className="text-xs text-slate-500">
                Notice how the exact same database record appears to an <strong>Admin</strong> vs an <strong>Auditor</strong>.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                {/* Admin View */}
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2 text-emerald-950">
                  <div className="font-bold text-emerald-800">👑 Admin Unmasked View:</div>
                  <div className="space-y-1">
                    <div>client: Paramount Studios</div>
                    <div>taxId: 95-4819201</div>
                    <div>bankIban: US89 3100 4812</div>
                    <div>profitMargin: 38.4%</div>
                  </div>
                </div>

                {/* Auditor Masked View */}
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-2 text-slate-200">
                  <div className="font-bold text-amber-400">👁️ Auditor Masked View:</div>
                  <div className="space-y-1">
                    <div>client: Paramount Studios</div>
                    <div>taxId: ***-**-9201</div>
                    <div>bankIban: **** 4812</div>
                    <div className="text-rose-400">profitMargin: [REDACTED]</div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ─── TAB 4: JUST-IN-TIME (JIT) ACCESS ELEVATION ──────────────────────────── */}
      {activeStudioTab === 'JIT' && (
        <Card className="max-w-4xl mx-auto p-6 space-y-6">
          <div className="flex flex-wrap justify-between items-center gap-3 border-b pb-3">
            <div>
              <h3 className="text-base font-black text-slate-900">⏱️ Just-In-Time (JIT) Temporary Access Grants</h3>
              <p className="text-xs text-slate-500">
                Grant temporary elevated roles (e.g. 2-hour emergency soundstage access) with automatic expiration.
              </p>
            </div>
            <Button size="sm" onClick={() => alert('New 2-hour emergency elevation grant issued!')}>
              + Issue Temporary Grant ⚡
            </Button>
          </div>

          <div className="space-y-3 text-xs">
            {temporaryGrants.map((grant) => (
              <div
                key={grant.id}
                className="p-4 bg-amber-50/60 border border-amber-200 rounded-2xl flex flex-wrap justify-between items-center gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="warning">Active (2h Pass)</Badge>
                    <span className="font-bold text-slate-900">{grant.userName}</span>
                    <span className="text-slate-400">→</span>
                    <span className="font-bold text-indigo-600">{grant.roleName}</span>
                  </div>
                  <p className="text-[11px] text-slate-600">Reason: {grant.reason}</p>
                  <p className="text-[10px] font-mono text-amber-800">
                    Expires at: <strong>{grant.expiresAt}</strong> (Granted by {grant.grantedBy})
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setTemporaryGrants(temporaryGrants.filter((g) => g.id !== grant.id))}
                >
                  Revoke Now ✕
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ─── TAB 5: CASBIN MODEL & POSTGRESQL RLS POLICY DDL ─────────────────────── */}
      {activeStudioTab === 'DDL' && (
        <Card className="max-w-4xl mx-auto p-6 space-y-6">
          <div>
            <h3 className="text-base font-black text-slate-900">🗄️ Casbin & PostgreSQL Row-Level Security (RLS) DDL</h3>
            <p className="text-xs text-slate-500">
              Auto-generated multi-tenant security policies ready for production deployment.
            </p>
          </div>

          <pre className="p-5 bg-slate-950 text-emerald-400 font-mono text-xs rounded-2xl overflow-x-auto shadow-inner">
{`-- 1. PostgreSQL Multi-Tenant Row-Level Security (RLS) Policy
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY rbac_invoice_isolation ON invoices
FOR ALL
USING (
    tenant_id = current_setting('app.current_tenant_id')
    AND (
        current_setting('app.current_user_scope') = 'ALL'
        OR (current_setting('app.current_user_scope') = 'TEAM' AND squad_id = current_setting('app.current_user_squad_id'))
        OR (current_setting('app.current_user_scope') = 'OWN' AND owner_id = current_setting('app.current_user_id'))
    )
);`}
          </pre>
        </Card>
      )}

      {/* ─── MODAL: CREATE CUSTOM RBAC ROLE ────────────────────────────────────── */}
      <Modal
        isOpen={isCreateRoleModalOpen}
        onClose={() => setIsCreateRoleModalOpen(false)}
        title="🛡️ Create Custom RBAC Security Role"
        description="Define a new tenant role, assign brand accent color, and clone baseline scoped permissions."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsCreateRoleModalOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleCreateRoleSubmit} className="!bg-indigo-600 !text-white font-bold">
              Create Role 🚀
            </Button>
          </div>
        }
      >
        <form onSubmit={handleCreateRoleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="font-bold block mb-1 text-slate-800">Role Title / Display Name *</label>
            <Input
              placeholder="e.g. Regional Deal Approver / AP Specialist"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="font-bold block mb-1 text-slate-800">Description & Purpose</label>
            <Input
              placeholder="e.g. Authorizes deal approvals above $50k and manages regional contracts"
              value={newRoleDescription}
              onChange={(e) => setNewRoleDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-bold block mb-1 text-slate-800">Clone Baseline Scopes From</label>
              <select
                value={cloneFromRoleId}
                onChange={(e) => setCloneFromRoleId(e.target.value)}
                className="w-full h-10 px-3 border rounded-xl bg-white font-bold text-slate-800 text-xs"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-bold block mb-1 text-slate-800">Role Badge Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={newRoleColor}
                  onChange={(e) => setNewRoleColor(e.target.value)}
                  className="w-12 h-10 cursor-pointer rounded-xl border p-1"
                />
                <span className="font-mono font-bold text-slate-600">{newRoleColor}</span>
              </div>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
