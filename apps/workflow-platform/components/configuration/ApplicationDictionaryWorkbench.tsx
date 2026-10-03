'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  type DictionaryEntityV1,
  type DictionaryFieldV1,
  type DictionaryRelationshipV1,
  type DictionaryReferenceV1,
  type DictionaryValidationRuleV1,
  type DictionaryViewV1,
  type DictionaryNavigationItemV1,
  type DictionaryActionV1,
  type DictionaryPackageDefinitionV1,
  type DictionaryChangeSetDefinition,
} from '@gigalibs/contracts';
import {
  BookOpen,
  Database,
  Columns,
  GitBranch,
  Layout,
  Menu,
  Zap,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Plus,
  ArrowRight,
  RefreshCw,
  Search,
  Eye,
  Check,
  X,
  FileCode,
  Layers,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';

interface ApplicationDictionaryWorkbenchProps {
  currentUserId: string;
  permissions: string[];
  tenantId: string;
  tenantName: string;
}

type DictionaryTab =
  | 'entities'
  | 'relationships'
  | 'views'
  | 'navigation'
  | 'actions'
  | 'validation'
  | 'governance';

export function ApplicationDictionaryWorkbench({
  currentUserId,
  permissions,
  tenantId,
  tenantName,
}: ApplicationDictionaryWorkbenchProps) {
  const [activeTab, setActiveTab] = useState<DictionaryTab>('entities');
  const [selectedEntityKey, setSelectedEntityKey] = useState<string>('platform.tenant-profile');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [contributions, setContributions] = useState<any[]>([]);
  const [changeSets, setChangeSets] = useState<any[]>([]);
  const [publishedVersions, setPublishedVersions] = useState<any[]>([]);
  const [activations, setActivations] = useState<any[]>([]);
  const [selectedChangeSet, setSelectedChangeSet] = useState<any | null>(null);
  const [impactReport, setImpactReport] = useState<any | null>(null);

  // New overlay form state
  const [isCreatingChangeSet, setIsCreatingChangeSet] = useState(false);
  const [newChangeSetTitle, setNewChangeSetTitle] = useState('');
  const [newChangeSetReason, setNewChangeSetReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const canAuthor =
    permissions.includes('*') ||
    permissions.includes('configuration:*') ||
    permissions.includes('configuration:draft');

  const canApprove =
    permissions.includes('*') ||
    permissions.includes('configuration:*') ||
    permissions.includes('configuration:approve');

  const canPublish =
    permissions.includes('*') ||
    permissions.includes('configuration:*') ||
    permissions.includes('configuration:publish');

  const canActivate =
    permissions.includes('*') ||
    permissions.includes('configuration:*') ||
    permissions.includes('configuration:activate');

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [contributionsRes, changeSetsRes, publishedRes, activationsRes] = await Promise.all([
        fetch('/api/control/configuration/dictionary/contributions', { cache: 'no-store' }),
        fetch('/api/control/configuration/change-sets', { cache: 'no-store' }),
        fetch('/api/control/configuration/published-versions', { cache: 'no-store' }),
        fetch('/api/control/configuration/activations', { cache: 'no-store' }),
      ]);

      if (contributionsRes.ok) {
        const contribData = await contributionsRes.json();
        setContributions(Array.isArray(contribData) ? contribData : []);
      }
      if (changeSetsRes.ok) {
        const csData = await changeSetsRes.json();
        setChangeSets(Array.isArray(csData) ? csData : []);
      }
      if (publishedRes.ok) {
        const pubData = await publishedRes.json();
        setPublishedVersions(Array.isArray(pubData) ? pubData : []);
      }
      if (activationsRes.ok) {
        const actData = await activationsRes.json();
        setActivations(Array.isArray(actData) ? actData : []);
      }
    } catch (err) {
      console.error('Failed to load Application Dictionary data', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Active baseline dictionary from registered contributions
  const activeContribution = useMemo(() => {
    return contributions.find(
      (c) => c.dictionaryContribution?.targetEntityKey === selectedEntityKey,
    )?.dictionaryContribution;
  }, [contributions, selectedEntityKey]);

  // Fallback default dictionary for Tenant Profile if not yet loaded from API
  const dictionary: DictionaryPackageDefinitionV1 = useMemo(() => {
    if (activeContribution) return activeContribution;
    return {
      packageKey: 'tenant-profile-dictionary',
      name: 'Tenant Profile Application Dictionary',
      version: '1.0.0',
      moduleKey: 'tenant-settings',
      targetEntityKey: 'platform.tenant-profile',
      entities: [
        {
          entityKey: 'platform.tenant-profile',
          moduleKey: 'tenant-settings',
          label: 'Tenant Profile',
          ownership: 'MODULE_CORE',
          primaryKeyField: 'id',
          isVersioned: true,
          isAuditLogged: true,
          isSoftDeletable: false,
        },
      ],
      fields: [
        {
          fieldKey: 'name',
          entityKey: 'platform.tenant-profile',
          label: 'Workspace name',
          type: 'TEXT',
          required: true,
          readOnly: false,
          isSystemLocked: true,
          classification: 'INTERNAL',
          maskOnDisplay: false,
        },
        {
          fieldKey: 'slug',
          entityKey: 'platform.tenant-profile',
          label: 'Workspace slug',
          type: 'TEXT',
          required: true,
          readOnly: true,
          isSystemLocked: true,
          classification: 'INTERNAL',
          maskOnDisplay: false,
        },
        {
          fieldKey: 'status',
          entityKey: 'platform.tenant-profile',
          label: 'Workspace status',
          type: 'SELECT',
          required: true,
          readOnly: true,
          isSystemLocked: true,
          classification: 'INTERNAL',
          referenceKey: 'ref-tenant-statuses',
          maskOnDisplay: false,
        },
        {
          fieldKey: 'region',
          entityKey: 'platform.tenant-profile',
          label: 'Data region',
          type: 'TEXT',
          required: true,
          readOnly: true,
          isSystemLocked: true,
          classification: 'INTERNAL',
          maskOnDisplay: false,
        },
      ],
      relationships: [],
      references: [
        {
          referenceKey: 'ref-tenant-statuses',
          referenceType: 'VALUE_LIST',
          staticValues: [
            { value: 'ACTIVE', label: 'Active', isDefault: true },
            { value: 'SUSPENDED', label: 'Suspended' },
            { value: 'ARCHIVED', label: 'Archived' },
          ],
        },
      ],
      validationRules: [
        {
          ruleKey: 'rule-name-required',
          label: 'Workspace Name Required',
          errorMessage: 'Workspace name cannot be empty',
          severity: 'ERROR',
          condition: {
            field: 'name',
            operator: 'IS_NOT_NULL',
          },
        },
      ],
      views: [
        {
          viewKey: 'tenant-profile-main',
          label: 'Workspace Profile',
          mode: 'EDIT',
          device: 'ALL',
          tabs: [
            {
              tabKey: 'general-tab',
              label: 'General Information',
              position: 0,
              level: 0,
              targetEntityKey: 'platform.tenant-profile',
              sections: [
                {
                  sectionKey: 'core-section',
                  label: 'Core Details',
                  collapsible: false,
                  defaultCollapsed: false,
                  position: 0,
                },
              ],
              fields: [
                { fieldKey: 'name', sectionKey: 'core-section', position: 0, span: 6, componentKey: 'text-input' },
                { fieldKey: 'slug', sectionKey: 'core-section', position: 1, span: 6, componentKey: 'text-input' },
                { fieldKey: 'status', sectionKey: 'core-section', position: 2, span: 6, componentKey: 'select' },
                { fieldKey: 'region', sectionKey: 'core-section', position: 3, span: 6, componentKey: 'text-input' },
              ],
            },
          ],
          defaultSortDirection: 'ASC',
        },
      ],
      navigation: [
        {
          itemKey: 'nav-tenant-profile',
          label: 'Organization Profile',
          route: '/settings',
          position: 10,
          requiredPermissions: ['configuration:read'],
        },
      ],
      actions: [
        {
          actionKey: 'verify-domain',
          label: 'Verify Domain',
          type: 'COMMAND',
          handlerKey: 'platform.tenant-profile.verify-domain',
          requiredPermissions: ['configuration:write'],
        },
      ],
      messages: [
        {
          messageKey: 'profile.title',
          locale: 'en-US',
          value: 'Workspace Profile',
          category: 'LABEL',
        },
      ],
    };
  }, [activeContribution]);

  // Classification Badge styling
  const renderClassificationBadge = (classification: string) => {
    switch (classification) {
      case 'RESTRICTED':
        return (
          <span className="inline-flex items-center rounded-md bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 border border-rose-200">
            RESTRICTED
          </span>
        );
      case 'CONFIDENTIAL':
        return (
          <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 border border-amber-200">
            CONFIDENTIAL
          </span>
        );
      case 'PUBLIC':
        return (
          <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
            PUBLIC
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 border border-sky-200">
            INTERNAL
          </span>
        );
    }
  };

  // Ownership Badge
  const renderOwnershipBadge = (ownership: string, isLocked: boolean) => {
    if (ownership === 'MODULE_CORE' || isLocked) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 border border-zinc-200">
          <Lock className="h-3 w-3 text-zinc-500" />
          Core (Locked)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-700 border border-purple-200">
        Tenant Extension
      </span>
    );
  };

  // Handle Maker-Checker Actions
  const handleSubmitForReview = async (changeSetId: string, version: number) => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/control/configuration/change-sets/${changeSetId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: version,
          reason: 'Submitting Application Dictionary change set for governance review',
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Submission failed');
      }
      setNotification({ message: 'Change set submitted for review successfully.', type: 'success' });
      await loadData();
    } catch (err: any) {
      setNotification({ message: err.message, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async (changeSetId: string, version: number) => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/control/configuration/change-sets/${changeSetId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: version,
          reason: 'Application Dictionary change set approved',
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Approval failed');
      }
      setNotification({ message: 'Change set approved successfully.', type: 'success' });
      await loadData();
    } catch (err: any) {
      setNotification({ message: err.message, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePublish = async (changeSetId: string, version: number) => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/control/configuration/change-sets/${changeSetId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: version,
          reason: 'Application Dictionary change set published',
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Publishing failed');
      }
      setNotification({ message: 'Change set published into immutable version.', type: 'success' });
      await loadData();
    } catch (err: any) {
      setNotification({ message: err.message, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateOverlay = async () => {
    if (!newChangeSetTitle.trim()) return;
    setIsSubmitting(true);
    try {
      const payload: DictionaryChangeSetDefinition = {
        kind: 'APPLICATION_DICTIONARY',
        contractVersion: '1.0',
        moduleKey: dictionary.moduleKey,
        entityKey: dictionary.targetEntityKey,
        surfaceKey: dictionary.packageKey,
        title: newChangeSetTitle,
        dictionary: {
          ...dictionary,
          name: newChangeSetTitle,
        },
      };

      const res = await fetch('/api/control/configuration/change-sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          definition: payload,
          reason: newChangeSetReason || 'Custom dictionary overlay',
          idempotencyKey: `dict-cs-${Date.now()}`,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to create change set');
      }

      setNotification({ message: 'Dictionary overlay change set created.', type: 'success' });
      setIsCreatingChangeSet(false);
      setNewChangeSetTitle('');
      setNewChangeSetReason('');
      await loadData();
    } catch (err: any) {
      setNotification({ message: err.message, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-zinc-50/60 pb-16">
      {/* Header Bar */}
      <div className="border-b border-zinc-200 bg-white px-6 py-5 shadow-xs">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-emerald-50 p-2 text-emerald-700">
                <BookOpen className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-zinc-900">
                  Application Dictionary
                </h1>
                <p className="text-xs text-zinc-500">
                  Enterprise metadata compiler, module boundaries, locked baselines and governed overlays
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={loadData}
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-medium text-zinc-700 shadow-2xs hover:bg-zinc-50 transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            {canAuthor && (
              <button
                type="button"
                onClick={() => setIsCreatingChangeSet(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-500 transition"
              >
                <Plus className="h-4 w-4" />
                New Governed Overlay
              </button>
            )}
          </div>
        </div>

        {/* Global Notifications */}
        {notification && (
          <div
            className={`mt-4 flex items-center justify-between rounded-xl p-3 text-xs font-medium ${
              notification.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            <span>{notification.message}</span>
            <button type="button" onClick={() => setNotification(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Secondary Navigation Tabs */}
        <div className="mt-6 flex flex-wrap gap-1 border-b border-zinc-100 pb-px">
          {[
            { id: 'entities', label: 'Entities & Fields', icon: Columns },
            { id: 'relationships', label: 'Relationships & References', icon: GitBranch },
            { id: 'views', label: 'Views & Layouts', icon: Layout },
            { id: 'navigation', label: 'Navigation & Menus', icon: Menu },
            { id: 'actions', label: 'Registered Actions', icon: Zap },
            { id: 'validation', label: 'Validation Rules (Safe AST)', icon: ShieldCheck },
            { id: 'governance', label: 'Maker-Checker & Governance', icon: FileCode },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as DictionaryTab)}
                className={`inline-flex items-center gap-2 border-b-2 px-3.5 py-2.5 text-xs font-semibold transition ${
                  isActive
                    ? 'border-emerald-600 text-emerald-700 bg-emerald-50/40 rounded-t-lg'
                    : 'border-transparent text-zinc-600 hover:text-zinc-900 hover:border-zinc-300'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-emerald-600' : 'text-zinc-400'}`} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Body Content */}
      <div className="p-6">
        {/* TAB 1: ENTITIES & FIELDS */}
        {activeTab === 'entities' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
            {/* Entities Selector */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs lg:col-span-1">
              <h2 className="text-sm font-semibold text-zinc-900 mb-3 flex items-center gap-2">
                <Database className="h-4 w-4 text-emerald-600" />
                Registered Entities
              </h2>
              <div className="space-y-2">
                {dictionary.entities.map((entity) => (
                  <button
                    key={entity.entityKey}
                    type="button"
                    onClick={() => setSelectedEntityKey(entity.entityKey)}
                    className={`w-full text-left rounded-xl p-3 text-xs transition border ${
                      selectedEntityKey === entity.entityKey
                        ? 'border-emerald-500 bg-emerald-50/50 shadow-2xs'
                        : 'border-zinc-200 hover:bg-zinc-50'
                    }`}
                  >
                    <div className="font-semibold text-zinc-900">{entity.label}</div>
                    <div className="font-mono text-[11px] text-zinc-500 mt-0.5">{entity.entityKey}</div>
                    <div className="mt-2 flex items-center gap-1.5">
                      {renderOwnershipBadge(entity.ownership, entity.ownership === 'MODULE_CORE')}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Field Catalogue */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs lg:col-span-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-100">
                <div>
                  <h2 className="text-base font-bold text-zinc-950">Field Catalogue</h2>
                  <p className="text-xs text-zinc-500">
                    Fields declared for <span className="font-mono font-medium text-zinc-800">{selectedEntityKey}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Filter fields…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="rounded-xl border border-zinc-200 bg-zinc-50/50 py-1.5 pl-8 pr-3 text-xs text-zinc-900 placeholder-zinc-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50/60 font-semibold text-zinc-600">
                      <th className="py-2.5 px-3">Field Key</th>
                      <th className="py-2.5 px-3">Label</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Ownership & Locking</th>
                      <th className="py-2.5 px-3">Classification</th>
                      <th className="py-2.5 px-3">Rules & Refs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {dictionary.fields
                      .filter(
                        (f) =>
                          f.fieldKey.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          f.label.toLowerCase().includes(searchQuery.toLowerCase()),
                      )
                      .map((field) => (
                        <tr key={field.fieldKey} className="hover:bg-zinc-50/80 transition">
                          <td className="py-3 px-3 font-mono font-medium text-zinc-900">{field.fieldKey}</td>
                          <td className="py-3 px-3 text-zinc-800">{field.label}</td>
                          <td className="py-3 px-3">
                            <span className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-[11px] text-zinc-700">
                              {field.type}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            {renderOwnershipBadge('MODULE_CORE', field.isSystemLocked)}
                          </td>
                          <td className="py-3 px-3">{renderClassificationBadge(field.classification)}</td>
                          <td className="py-3 px-3">
                            {field.referenceKey && (
                              <span className="inline-block rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 mr-1">
                                {field.referenceKey}
                              </span>
                            )}
                            {field.required && (
                              <span className="inline-block rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600">
                                Required
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: RELATIONSHIPS & REFERENCES */}
        {activeTab === 'relationships' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* References & Value Lists */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs">
              <h2 className="text-sm font-bold text-zinc-950 flex items-center gap-2 mb-1">
                <GitBranch className="h-4 w-4 text-emerald-600" />
                References & Value Lists
              </h2>
              <p className="text-xs text-zinc-500 mb-4">
                Bounded discrete lists and resolver keys validated server-side
              </p>

              <div className="space-y-4">
                {dictionary.references.map((ref) => (
                  <div key={ref.referenceKey} className="rounded-xl border border-zinc-200 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs font-semibold text-zinc-900">{ref.referenceKey}</span>
                      <span className="rounded bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-700">
                        {ref.referenceType}
                      </span>
                    </div>

                    {ref.staticValues && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {ref.staticValues.map((val) => (
                          <span
                            key={val.value}
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium border ${
                              val.isDefault
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : 'bg-zinc-50 text-zinc-700 border-zinc-200'
                            }`}
                          >
                            <span className="font-mono">{val.value}</span>
                            <span className="text-zinc-400">({val.label})</span>
                            {val.isDefault && <Check className="h-3 w-3 text-emerald-600" />}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Entity Relationships */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs">
              <h2 className="text-sm font-bold text-zinc-950 flex items-center gap-2 mb-1">
                <Database className="h-4 w-4 text-emerald-600" />
                Entity Relationships
              </h2>
              <p className="text-xs text-zinc-500 mb-4">
                Strict foreign keys, parent-child cascades, and relational integrity constraints
              </p>

              {dictionary.relationships.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-200 p-8 text-center text-zinc-400 text-xs">
                  No relationships declared for this entity baseline.
                </div>
              ) : (
                <div className="space-y-3">
                  {dictionary.relationships.map((rel) => (
                    <div key={rel.relationshipKey} className="rounded-xl border border-zinc-200 p-4">
                      <div className="font-mono text-xs font-semibold text-zinc-900">{rel.relationshipKey}</div>
                      <div className="mt-2 text-xs text-zinc-600">
                        {rel.sourceEntityKey} <span className="font-semibold text-zinc-400">→</span>{' '}
                        {rel.targetEntityKey} ({rel.type})
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: VIEWS & LAYOUTS */}
        {activeTab === 'views' && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs">
            <h2 className="text-sm font-bold text-zinc-950 flex items-center gap-2 mb-1">
              <Layout className="h-4 w-4 text-emerald-600" />
              Views, Tabs & Presentation Layouts
            </h2>
            <p className="text-xs text-zinc-500 mb-4">
              Multi-tab windows, responsive 12-column sections and device variants
            </p>

            <div className="space-y-6">
              {dictionary.views.map((view) => (
                <div key={view.viewKey} className="rounded-xl border border-zinc-200 p-5 bg-zinc-50/40">
                  <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
                    <div>
                      <span className="font-semibold text-sm text-zinc-900">{view.label}</span>
                      <span className="ml-2 font-mono text-xs text-zinc-500">({view.viewKey})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700">
                        Mode: {view.mode}
                      </span>
                      <span className="rounded bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700">
                        Device: {view.device}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 space-y-4">
                    {view.tabs.map((tab) => (
                      <div key={tab.tabKey} className="rounded-xl border border-zinc-200 bg-white p-4">
                        <div className="font-semibold text-xs text-zinc-900 mb-2">
                          Tab: {tab.label} <span className="text-zinc-400 font-normal">({tab.tabKey})</span>
                        </div>

                        {tab.sections.map((sec) => (
                          <div key={sec.sectionKey} className="mt-3 rounded-lg bg-zinc-50 p-3 border border-zinc-100">
                            <div className="font-medium text-xs text-zinc-800 mb-2">
                              Section: {sec.label}
                            </div>
                            <div className="grid grid-cols-12 gap-2">
                              {tab.fields
                                .filter((f) => f.sectionKey === sec.sectionKey)
                                .map((f) => (
                                  <div
                                    key={f.fieldKey}
                                    style={{ gridColumn: `span ${f.span ?? 6} / span ${f.span ?? 6}` }}
                                    className="rounded border border-zinc-200 bg-white p-2 text-xs"
                                  >
                                    <div className="font-mono text-[11px] text-zinc-800 font-semibold">
                                      {f.fieldKey}
                                    </div>
                                    <div className="text-[10px] text-zinc-400 mt-0.5">
                                      Component: {f.componentKey} (Span: {f.span ?? 6})
                                    </div>
                                  </div>
                                ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: NAVIGATION & MENUS */}
        {activeTab === 'navigation' && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs">
            <h2 className="text-sm font-bold text-zinc-950 flex items-center gap-2 mb-1">
              <Menu className="h-4 w-4 text-emerald-600" />
              Navigation Hierarchy & Contributions
            </h2>
            <p className="text-xs text-zinc-500 mb-4">
              Registered menu contributions with cycle detection and RBAC permission guards
            </p>

            <div className="divide-y divide-zinc-100 border border-zinc-200 rounded-xl overflow-hidden">
              {dictionary.navigation.map((item) => (
                <div key={item.itemKey} className="p-4 bg-white flex items-center justify-between hover:bg-zinc-50 transition">
                  <div className="flex items-center gap-3">
                    <span className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
                      <Menu className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="font-semibold text-xs text-zinc-900">{item.label}</div>
                      <div className="font-mono text-[11px] text-zinc-400">
                        {item.route} · Position: {item.position}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {item.requiredPermissions?.map((perm) => (
                      <span key={perm} className="rounded bg-zinc-100 px-2 py-0.5 text-[10px] font-mono text-zinc-700">
                        {perm}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: REGISTERED ACTIONS */}
        {activeTab === 'actions' && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs">
            <h2 className="text-sm font-bold text-zinc-950 flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-emerald-600" />
              Registered Actions & Handlers
            </h2>
            <p className="text-xs text-zinc-500 mb-4">
              Bounded actions mapped to verified server-side code handlers (no arbitrary code execution)
            </p>

            <div className="space-y-3">
              {dictionary.actions.map((act) => (
                <div key={act.actionKey} className="rounded-xl border border-zinc-200 p-4 bg-white flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-xs text-zinc-900 flex items-center gap-2">
                      {act.label}
                      <span className="font-mono text-[11px] text-zinc-400 font-normal">({act.actionKey})</span>
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-emerald-700">
                      Handler: {act.handlerKey}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="rounded bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-700">
                      Type: {act.type}
                    </span>
                    {act.requiredPermissions?.map((perm) => (
                      <span key={perm} className="rounded bg-zinc-100 px-2 py-0.5 text-[10px] font-mono text-zinc-700">
                        {perm}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 6: VALIDATION RULES (SAFE AST) */}
        {activeTab === 'validation' && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs">
            <h2 className="text-sm font-bold text-zinc-950 flex items-center gap-2 mb-1">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Bounded Validation Rules (Safe AST)
            </h2>
            <p className="text-xs text-zinc-500 mb-4">
              Declarative validation predicates evaluated securely on client and server without SQL or eval
            </p>

            <div className="space-y-4">
              {dictionary.validationRules.map((rule) => (
                <div key={rule.ruleKey} className="rounded-xl border border-zinc-200 p-4 bg-white">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-xs text-zinc-900">{rule.label}</div>
                    <span className="rounded bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                      {rule.severity}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 mb-3">{rule.errorMessage}</p>

                  <div className="rounded-lg bg-zinc-50 p-3 font-mono text-[11px] text-zinc-800 border border-zinc-100">
                    <div className="text-zinc-400 mb-1">// Condition AST (max depth: 10)</div>
                    {JSON.stringify(rule.condition, null, 2)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 7: MAKER-CHECKER & GOVERNANCE */}
        {activeTab === 'governance' && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs">
              <h2 className="text-sm font-bold text-zinc-950 flex items-center gap-2 mb-1">
                <FileCode className="h-4 w-4 text-emerald-600" />
                Change Sets & Maker-Checker Workflow
              </h2>
              <p className="text-xs text-zinc-500 mb-4">
                Governed change proposals, multi-eye review, cryptographic SHA-256 checksums, and backward-compatibility audit
              </p>

              {changeSets.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-200 p-8 text-center text-zinc-400 text-xs">
                  No active change sets found. Click "New Governed Overlay" to author an extension.
                </div>
              ) : (
                <div className="divide-y divide-zinc-100 border border-zinc-200 rounded-xl overflow-hidden">
                  {changeSets.map((cs) => {
                    const isAuthor = cs.createdById === currentUserId;
                    return (
                      <div key={cs.id} className="p-4 bg-white hover:bg-zinc-50/80 transition flex flex-col gap-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs text-zinc-900">{cs.definition?.title || cs.id}</span>
                              <span
                                className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                                  cs.status === 'PUBLISHED'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : cs.status === 'APPROVED'
                                    ? 'bg-sky-50 text-sky-700 border border-sky-200'
                                    : cs.status === 'SUBMITTED'
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                    : 'bg-zinc-100 text-zinc-700'
                                }`}
                              >
                                {cs.status}
                              </span>
                              {cs.compatibility && (
                                <span className="rounded bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-mono">
                                  {cs.compatibility}
                                </span>
                              )}
                            </div>
                            <div className="font-mono text-[11px] text-zinc-400 mt-1">
                              Module: {cs.moduleKey} · Entity: {cs.entityKey} · Checksum: {cs.checksum?.slice(0, 18) ?? 'none'}…
                            </div>
                          </div>

                          {/* Maker-Checker Action Buttons */}
                          <div className="flex items-center gap-2">
                            {cs.status === 'DRAFT' && canAuthor && (
                              <button
                                type="button"
                                onClick={() => handleSubmitForReview(cs.id, cs.version)}
                                disabled={isSubmitting}
                                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 transition"
                              >
                                Submit Review
                              </button>
                            )}

                            {cs.status === 'SUBMITTED' && canApprove && (
                              <>
                                {isAuthor ? (
                                  <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                                    Author cannot approve own change (Maker-Checker rule)
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleApprove(cs.id, cs.version)}
                                    disabled={isSubmitting}
                                    className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 transition"
                                  >
                                    Approve Change
                                  </button>
                                )}
                              </>
                            )}

                            {cs.status === 'APPROVED' && canPublish && (
                              <button
                                type="button"
                                onClick={() => handlePublish(cs.id, cs.version)}
                                disabled={isSubmitting}
                                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition"
                              >
                                Publish Version
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Published Versions Authority */}
            <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs">
              <h2 className="text-sm font-bold text-zinc-950 flex items-center gap-2 mb-1">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Immutable Published Manifests
              </h2>
              <p className="text-xs text-zinc-500 mb-4">
                Checksummed publication records deployed to client runtimes
              </p>

              <div className="divide-y divide-zinc-100 border border-zinc-200 rounded-xl overflow-hidden">
                {publishedVersions.map((pv) => (
                  <div key={pv.id} className="p-4 bg-white flex items-center justify-between hover:bg-zinc-50 transition">
                    <div>
                      <div className="font-semibold text-xs text-zinc-900">
                        Sequence #{pv.sequence} · {pv.moduleKey} ({pv.surfaceKey})
                      </div>
                      <div className="font-mono text-[11px] text-zinc-400 mt-0.5">
                        Checksum: {pv.checksum}
                      </div>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {new Date(pv.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal for New Governed Overlay */}
      {isCreatingChangeSet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-zinc-200">
            <h3 className="text-base font-bold text-zinc-950">New Application Dictionary Overlay</h3>
            <p className="text-xs text-zinc-500 mt-1">
              Create a tenant change set over the baseline module metadata. All system-locked properties are preserved.
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Overlay Title</label>
                <input
                  type="text"
                  placeholder="e.g. Workspace Custom Attributes Overlay"
                  value={newChangeSetTitle}
                  onChange={(e) => setNewChangeSetTitle(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 px-3.5 py-2 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Business Reason</label>
                <textarea
                  placeholder="Explain why this metadata overlay is needed…"
                  value={newChangeSetReason}
                  onChange={(e) => setNewChangeSetReason(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-zinc-200 px-3.5 py-2 text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsCreatingChangeSet(false)}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateOverlay}
                disabled={isSubmitting || !newChangeSetTitle.trim()}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {isSubmitting ? 'Creating…' : 'Create Change Set'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
