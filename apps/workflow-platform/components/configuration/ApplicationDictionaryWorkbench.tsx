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
  holdsAnyPermission,
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

  const canAuthor = holdsAnyPermission(permissions, ['configuration:draft']);
  const canApprove = holdsAnyPermission(permissions, ['configuration:approve']);
  const canPublish = holdsAnyPermission(permissions, ['configuration:publish']);
  const canActivate = holdsAnyPermission(permissions, ['configuration:activate']);

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
          <span className="inline-flex items-center rounded-md bg-ui-tag-red-bg px-2 py-0.5 text-[11px] font-semibold text-ui-fg-error border border-ui-tag-red-border">
            RESTRICTED
          </span>
        );
      case 'CONFIDENTIAL':
        return (
          <span className="inline-flex items-center rounded-md bg-ui-tag-orange-bg px-2 py-0.5 text-[11px] font-semibold text-ui-tag-orange-text border border-ui-tag-orange-border">
            CONFIDENTIAL
          </span>
        );
      case 'PUBLIC':
        return (
          <span className="inline-flex items-center rounded-md bg-ui-tag-green-bg px-2 py-0.5 text-[11px] font-semibold text-ui-tag-green-text border border-ui-tag-green-border">
            PUBLIC
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-md bg-ui-tag-blue-bg px-2 py-0.5 text-[11px] font-semibold text-ui-tag-blue-text border border-ui-tag-blue-border">
            INTERNAL
          </span>
        );
    }
  };

  // Ownership Badge
  const renderOwnershipBadge = (ownership: string, isLocked: boolean) => {
    if (ownership === 'MODULE_CORE' || isLocked) {
      return (
        <span className="inline-flex items-center gap-1 rounded-md bg-ui-bg-component px-2 py-0.5 text-[11px] font-medium text-ui-fg-subtle border border-ui-border-base">
          <Lock className="h-3 w-3 text-ui-fg-muted" />
          Core (Locked)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-ui-tag-purple-bg px-2 py-0.5 text-[11px] font-medium text-ui-tag-purple-text border border-ui-tag-purple-border">
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
    <div className="flex flex-col min-h-screen bg-ui-bg-subtle pb-16">
      {/* Header Bar */}
      <div className="border-b border-ui-border-base bg-ui-bg-base px-6 py-5 shadow-xs">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-ui-tag-green-bg p-2 text-ui-tag-green-text">
                <BookOpen className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-ui-fg-base">
                  Application Dictionary
                </h1>
                <p className="text-xs text-ui-fg-muted">
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
              className="inline-flex items-center gap-2 rounded-xl border border-ui-border-base bg-ui-bg-base px-3.5 py-2 text-xs font-medium text-ui-fg-subtle shadow-2xs hover:bg-ui-bg-base-hover transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            {canAuthor && (
              <button
                type="button"
                onClick={() => setIsCreatingChangeSet(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-ui-button-inverted px-4 py-2 text-xs font-semibold text-ui-contrast-fg-primary shadow-sm hover:bg-ui-button-inverted-hover transition"
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
                ? 'bg-ui-tag-green-bg text-ui-tag-green-text border border-ui-tag-green-border'
                : 'bg-ui-tag-red-bg text-ui-fg-error border border-ui-tag-red-border'
            }`}
          >
            <span>{notification.message}</span>
            <button type="button" onClick={() => setNotification(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Secondary Navigation Tabs */}
        <div className="mt-6 flex flex-wrap gap-1 border-b border-ui-border-base pb-px">
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
                    ? 'border-ui-border-interactive text-ui-tag-green-text bg-ui-tag-green-bg rounded-t-lg'
                    : 'border-transparent text-ui-fg-subtle hover:text-ui-fg-base hover:border-ui-border-strong'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-ui-tag-green-text' : 'text-ui-fg-muted'}`} />
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
            <div className="rounded-2xl border border-ui-border-base bg-ui-bg-base p-5 shadow-xs lg:col-span-1">
              <h2 className="text-sm font-semibold text-ui-fg-base mb-3 flex items-center gap-2">
                <Database className="h-4 w-4 text-ui-tag-green-text" />
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
                        ? 'border-ui-border-interactive bg-ui-tag-green-bg shadow-2xs'
                        : 'border-ui-border-base hover:bg-ui-bg-base-hover'
                    }`}
                  >
                    <div className="font-semibold text-ui-fg-base">{entity.label}</div>
                    <div className="font-mono text-[11px] text-ui-fg-muted mt-0.5">{entity.entityKey}</div>
                    <div className="mt-2 flex items-center gap-1.5">
                      {renderOwnershipBadge(entity.ownership, entity.ownership === 'MODULE_CORE')}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Field Catalogue */}
            <div className="rounded-2xl border border-ui-border-base bg-ui-bg-base p-6 shadow-xs lg:col-span-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-ui-border-base">
                <div>
                  <h2 className="text-base font-bold text-ui-fg-base">Field Catalogue</h2>
                  <p className="text-xs text-ui-fg-muted">
                    Fields declared for <span className="font-mono font-medium text-ui-fg-base">{selectedEntityKey}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ui-fg-muted" />
                    <input
                      type="text"
                      placeholder="Filter fields…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="rounded-xl border border-ui-border-base bg-ui-bg-subtle py-1.5 pl-8 pr-3 text-xs text-ui-fg-base placeholder-ui-fg-muted focus:bg-ui-bg-base focus:outline-none focus:ring-1 focus:ring-ui-border-interactive"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-ui-border-base bg-ui-bg-subtle font-semibold text-ui-fg-subtle">
                      <th className="py-2.5 px-3">Field Key</th>
                      <th className="py-2.5 px-3">Label</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Ownership & Locking</th>
                      <th className="py-2.5 px-3">Classification</th>
                      <th className="py-2.5 px-3">Rules & Refs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ui-border-base">
                    {dictionary.fields
                      .filter(
                        (f) =>
                          f.fieldKey.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          f.label.toLowerCase().includes(searchQuery.toLowerCase()),
                      )
                      .map((field) => (
                        <tr key={field.fieldKey} className="hover:bg-ui-bg-base-hover transition">
                          <td className="py-3 px-3 font-mono font-medium text-ui-fg-base">{field.fieldKey}</td>
                          <td className="py-3 px-3 text-ui-fg-base">{field.label}</td>
                          <td className="py-3 px-3">
                            <span className="rounded bg-ui-bg-component px-2 py-0.5 font-mono text-[11px] text-ui-fg-subtle">
                              {field.type}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            {renderOwnershipBadge('MODULE_CORE', field.isSystemLocked)}
                          </td>
                          <td className="py-3 px-3">{renderClassificationBadge(field.classification)}</td>
                          <td className="py-3 px-3">
                            {field.referenceKey && (
                              <span className="inline-block rounded bg-ui-tag-blue-bg px-2 py-0.5 text-[10px] font-medium text-ui-tag-blue-text mr-1">
                                {field.referenceKey}
                              </span>
                            )}
                            {field.required && (
                              <span className="inline-block rounded bg-ui-bg-component px-1.5 py-0.5 text-[10px] font-medium text-ui-fg-subtle">
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
            <div className="rounded-2xl border border-ui-border-base bg-ui-bg-base p-6 shadow-xs">
              <h2 className="text-sm font-bold text-ui-fg-base flex items-center gap-2 mb-1">
                <GitBranch className="h-4 w-4 text-ui-tag-green-text" />
                References & Value Lists
              </h2>
              <p className="text-xs text-ui-fg-muted mb-4">
                Bounded discrete lists and resolver keys validated server-side
              </p>

              <div className="space-y-4">
                {dictionary.references.map((ref) => (
                  <div key={ref.referenceKey} className="rounded-xl border border-ui-border-base p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs font-semibold text-ui-fg-base">{ref.referenceKey}</span>
                      <span className="rounded bg-ui-bg-component px-2 py-0.5 text-[10px] font-medium text-ui-fg-subtle">
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
                                ? 'bg-ui-tag-green-bg text-ui-tag-green-text border-ui-tag-green-border'
                                : 'bg-ui-bg-subtle text-ui-fg-subtle border-ui-border-base'
                            }`}
                          >
                            <span className="font-mono">{val.value}</span>
                            <span className="text-ui-fg-muted">({val.label})</span>
                            {val.isDefault && <Check className="h-3 w-3 text-ui-tag-green-text" />}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Entity Relationships */}
            <div className="rounded-2xl border border-ui-border-base bg-ui-bg-base p-6 shadow-xs">
              <h2 className="text-sm font-bold text-ui-fg-base flex items-center gap-2 mb-1">
                <Database className="h-4 w-4 text-ui-tag-green-text" />
                Entity Relationships
              </h2>
              <p className="text-xs text-ui-fg-muted mb-4">
                Strict foreign keys, parent-child cascades, and relational integrity constraints
              </p>

              {dictionary.relationships.length === 0 ? (
                <div className="rounded-xl border border-dashed border-ui-border-base p-8 text-center text-ui-fg-muted text-xs">
                  No relationships declared for this entity baseline.
                </div>
              ) : (
                <div className="space-y-3">
                  {dictionary.relationships.map((rel) => (
                    <div key={rel.relationshipKey} className="rounded-xl border border-ui-border-base p-4">
                      <div className="font-mono text-xs font-semibold text-ui-fg-base">{rel.relationshipKey}</div>
                      <div className="mt-2 text-xs text-ui-fg-subtle">
                        {rel.sourceEntityKey} <span className="font-semibold text-ui-fg-muted">→</span>{' '}
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
          <div className="rounded-2xl border border-ui-border-base bg-ui-bg-base p-6 shadow-xs">
            <h2 className="text-sm font-bold text-ui-fg-base flex items-center gap-2 mb-1">
              <Layout className="h-4 w-4 text-ui-tag-green-text" />
              Views, Tabs & Presentation Layouts
            </h2>
            <p className="text-xs text-ui-fg-muted mb-4">
              Multi-tab windows, responsive 12-column sections and device variants
            </p>

            <div className="space-y-6">
              {dictionary.views.map((view) => (
                <div key={view.viewKey} className="rounded-xl border border-ui-border-base p-5 bg-ui-bg-subtle">
                  <div className="flex items-center justify-between pb-3 border-b border-ui-border-base">
                    <div>
                      <span className="font-semibold text-sm text-ui-fg-base">{view.label}</span>
                      <span className="ml-2 font-mono text-xs text-ui-fg-muted">({view.viewKey})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-ui-bg-component px-2 py-0.5 text-[11px] font-medium text-ui-fg-subtle">
                        Mode: {view.mode}
                      </span>
                      <span className="rounded bg-ui-bg-component px-2 py-0.5 text-[11px] font-medium text-ui-fg-subtle">
                        Device: {view.device}
                      </span>
                    </div>
                  </div>

                  <div className="mt-4 space-y-4">
                    {view.tabs.map((tab) => (
                      <div key={tab.tabKey} className="rounded-xl border border-ui-border-base bg-ui-bg-base p-4">
                        <div className="font-semibold text-xs text-ui-fg-base mb-2">
                          Tab: {tab.label} <span className="text-ui-fg-muted font-normal">({tab.tabKey})</span>
                        </div>

                        {tab.sections.map((sec) => (
                          <div key={sec.sectionKey} className="mt-3 rounded-lg bg-ui-bg-subtle p-3 border border-ui-border-base">
                            <div className="font-medium text-xs text-ui-fg-base mb-2">
                              Section: {sec.label}
                            </div>
                            <div className="grid grid-cols-12 gap-2">
                              {tab.fields
                                .filter((f) => f.sectionKey === sec.sectionKey)
                                .map((f) => (
                                  <div
                                    key={f.fieldKey}
                                    style={{ gridColumn: `span ${f.span ?? 6} / span ${f.span ?? 6}` }}
                                    className="rounded border border-ui-border-base bg-ui-bg-base p-2 text-xs"
                                  >
                                    <div className="font-mono text-[11px] text-ui-fg-base font-semibold">
                                      {f.fieldKey}
                                    </div>
                                    <div className="text-[10px] text-ui-fg-muted mt-0.5">
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
          <div className="rounded-2xl border border-ui-border-base bg-ui-bg-base p-6 shadow-xs">
            <h2 className="text-sm font-bold text-ui-fg-base flex items-center gap-2 mb-1">
              <Menu className="h-4 w-4 text-ui-tag-green-text" />
              Navigation Hierarchy & Contributions
            </h2>
            <p className="text-xs text-ui-fg-muted mb-4">
              Registered menu contributions with cycle detection and RBAC permission guards
            </p>

            <div className="divide-y divide-ui-border-base border border-ui-border-base rounded-xl overflow-hidden">
              {dictionary.navigation.map((item) => (
                <div key={item.itemKey} className="p-4 bg-ui-bg-base flex items-center justify-between hover:bg-ui-bg-base-hover transition">
                  <div className="flex items-center gap-3">
                    <span className="rounded-lg bg-ui-tag-green-bg p-2 text-ui-tag-green-text">
                      <Menu className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="font-semibold text-xs text-ui-fg-base">{item.label}</div>
                      <div className="font-mono text-[11px] text-ui-fg-muted">
                        {item.route} · Position: {item.position}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {item.requiredPermissions?.map((perm) => (
                      <span key={perm} className="rounded bg-ui-bg-component px-2 py-0.5 text-[10px] font-mono text-ui-fg-subtle">
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
          <div className="rounded-2xl border border-ui-border-base bg-ui-bg-base p-6 shadow-xs">
            <h2 className="text-sm font-bold text-ui-fg-base flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-ui-tag-green-text" />
              Registered Actions & Handlers
            </h2>
            <p className="text-xs text-ui-fg-muted mb-4">
              Bounded actions mapped to verified server-side code handlers (no arbitrary code execution)
            </p>

            <div className="space-y-3">
              {dictionary.actions.map((act) => (
                <div key={act.actionKey} className="rounded-xl border border-ui-border-base p-4 bg-ui-bg-base flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-xs text-ui-fg-base flex items-center gap-2">
                      {act.label}
                      <span className="font-mono text-[11px] text-ui-fg-muted font-normal">({act.actionKey})</span>
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-ui-tag-green-text">
                      Handler: {act.handlerKey}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="rounded bg-ui-bg-component px-2 py-0.5 text-[10px] font-medium text-ui-fg-subtle">
                      Type: {act.type}
                    </span>
                    {act.requiredPermissions?.map((perm) => (
                      <span key={perm} className="rounded bg-ui-bg-component px-2 py-0.5 text-[10px] font-mono text-ui-fg-subtle">
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
          <div className="rounded-2xl border border-ui-border-base bg-ui-bg-base p-6 shadow-xs">
            <h2 className="text-sm font-bold text-ui-fg-base flex items-center gap-2 mb-1">
              <ShieldCheck className="h-4 w-4 text-ui-tag-green-text" />
              Bounded Validation Rules (Safe AST)
            </h2>
            <p className="text-xs text-ui-fg-muted mb-4">
              Declarative validation predicates evaluated securely on client and server without SQL or eval
            </p>

            <div className="space-y-4">
              {dictionary.validationRules.map((rule) => (
                <div key={rule.ruleKey} className="rounded-xl border border-ui-border-base p-4 bg-ui-bg-base">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-semibold text-xs text-ui-fg-base">{rule.label}</div>
                    <span className="rounded bg-ui-tag-red-bg border border-ui-tag-red-border px-2 py-0.5 text-[10px] font-semibold text-ui-fg-error">
                      {rule.severity}
                    </span>
                  </div>
                  <p className="text-xs text-ui-fg-muted mb-3">{rule.errorMessage}</p>

                  <div className="rounded-lg bg-ui-bg-subtle p-3 font-mono text-[11px] text-ui-fg-base border border-ui-border-base">
                    <div className="text-ui-fg-muted mb-1">// Condition AST (max depth: 10)</div>
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
            <div className="rounded-2xl border border-ui-border-base bg-ui-bg-base p-6 shadow-xs">
              <h2 className="text-sm font-bold text-ui-fg-base flex items-center gap-2 mb-1">
                <FileCode className="h-4 w-4 text-ui-tag-green-text" />
                Change Sets & Maker-Checker Workflow
              </h2>
              <p className="text-xs text-ui-fg-muted mb-4">
                Governed change proposals, multi-eye review, cryptographic SHA-256 checksums, and backward-compatibility audit
              </p>

              {changeSets.length === 0 ? (
                <div className="rounded-xl border border-dashed border-ui-border-base p-8 text-center text-ui-fg-muted text-xs">
                  No active change sets found. Click "New Governed Overlay" to author an extension.
                </div>
              ) : (
                <div className="divide-y divide-ui-border-base border border-ui-border-base rounded-xl overflow-hidden">
                  {changeSets.map((cs) => {
                    const isAuthor = cs.createdById === currentUserId;
                    return (
                      <div key={cs.id} className="p-4 bg-ui-bg-base hover:bg-ui-bg-base-hover transition flex flex-col gap-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-xs text-ui-fg-base">{cs.definition?.title || cs.id}</span>
                              <span
                                className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                                  cs.status === 'PUBLISHED'
                                    ? 'bg-ui-tag-green-bg text-ui-tag-green-text border border-ui-tag-green-border'
                                    : cs.status === 'APPROVED'
                                    ? 'bg-ui-tag-blue-bg text-ui-tag-blue-text border border-ui-tag-blue-border'
                                    : cs.status === 'SUBMITTED'
                                    ? 'bg-ui-tag-orange-bg text-ui-tag-orange-text border border-ui-tag-orange-border'
                                    : 'bg-ui-bg-component text-ui-fg-subtle'
                                }`}
                              >
                                {cs.status}
                              </span>
                              {cs.compatibility && (
                                <span className="rounded bg-ui-tag-green-bg text-ui-tag-green-text border border-ui-tag-green-border px-1.5 py-0.5 text-[10px] font-mono">
                                  {cs.compatibility}
                                </span>
                              )}
                            </div>
                            <div className="font-mono text-[11px] text-ui-fg-muted mt-1">
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
                                className="rounded-lg bg-ui-button-inverted px-3 py-1.5 text-xs font-semibold text-ui-contrast-fg-primary hover:bg-ui-button-inverted-hover transition"
                              >
                                Submit Review
                              </button>
                            )}

                            {cs.status === 'SUBMITTED' && canApprove && (
                              <>
                                {isAuthor ? (
                                  <span className="text-[11px] text-ui-tag-orange-text bg-ui-tag-orange-bg px-2 py-1 rounded border border-ui-tag-orange-border">
                                    Author cannot approve own change (Maker-Checker rule)
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleApprove(cs.id, cs.version)}
                                    disabled={isSubmitting}
                                    className="rounded-lg bg-ui-button-inverted px-3 py-1.5 text-xs font-semibold text-ui-contrast-fg-primary hover:bg-ui-button-inverted-hover transition"
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
                                className="rounded-lg bg-ui-button-inverted px-3 py-1.5 text-xs font-semibold text-ui-contrast-fg-primary hover:bg-ui-button-inverted-hover transition"
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
            <div className="rounded-2xl border border-ui-border-base bg-ui-bg-base p-6 shadow-xs">
              <h2 className="text-sm font-bold text-ui-fg-base flex items-center gap-2 mb-1">
                <CheckCircle2 className="h-4 w-4 text-ui-tag-green-text" />
                Immutable Published Manifests
              </h2>
              <p className="text-xs text-ui-fg-muted mb-4">
                Checksummed publication records deployed to client runtimes
              </p>

              <div className="divide-y divide-ui-border-base border border-ui-border-base rounded-xl overflow-hidden">
                {publishedVersions.map((pv) => (
                  <div key={pv.id} className="p-4 bg-ui-bg-base flex items-center justify-between hover:bg-ui-bg-base-hover transition">
                    <div>
                      <div className="font-semibold text-xs text-ui-fg-base">
                        Sequence #{pv.sequence} · {pv.moduleKey} ({pv.surfaceKey})
                      </div>
                      <div className="font-mono text-[11px] text-ui-fg-muted mt-0.5">
                        Checksum: {pv.checksum}
                      </div>
                    </div>
                    <span className="text-[10px] text-ui-fg-muted font-mono">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ui-bg-overlay backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-ui-bg-base p-6 shadow-xl border border-ui-border-base">
            <h3 className="text-base font-bold text-ui-fg-base">New Application Dictionary Overlay</h3>
            <p className="text-xs text-ui-fg-muted mt-1">
              Create a tenant change set over the baseline module metadata. All system-locked properties are preserved.
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ui-fg-subtle mb-1">Overlay Title</label>
                <input
                  type="text"
                  placeholder="e.g. Workspace Custom Attributes Overlay"
                  value={newChangeSetTitle}
                  onChange={(e) => setNewChangeSetTitle(e.target.value)}
                  className="w-full rounded-xl border border-ui-border-base px-3.5 py-2 text-xs text-ui-fg-base focus:outline-none focus:ring-1 focus:ring-ui-border-interactive"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ui-fg-subtle mb-1">Business Reason</label>
                <textarea
                  placeholder="Explain why this metadata overlay is needed…"
                  value={newChangeSetReason}
                  onChange={(e) => setNewChangeSetReason(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-ui-border-base px-3.5 py-2 text-xs text-ui-fg-base focus:outline-none focus:ring-1 focus:ring-ui-border-interactive"
                />
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsCreatingChangeSet(false)}
                className="rounded-xl border border-ui-border-base px-4 py-2 text-xs font-medium text-ui-fg-subtle hover:bg-ui-bg-base-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateOverlay}
                disabled={isSubmitting || !newChangeSetTitle.trim()}
                className="rounded-xl bg-ui-button-inverted px-4 py-2 text-xs font-semibold text-ui-contrast-fg-primary hover:bg-ui-button-inverted-hover disabled:opacity-50"
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
