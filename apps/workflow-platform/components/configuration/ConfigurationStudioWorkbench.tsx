'use client';

import {
  ConfigurationForm,
  FormEngineConfigurationForm,
  ConfigurationDetailView,
  ConfigurationListView,
  ConfigurationRenderer,
  type ConfigurationValues,
} from '@gigalibs/configuration-react';

import type {
  ConfigurationCondition,
  ConfigurationDefinition,
  ConfigurationField,
  ConfigurationImpactReport,
} from '@gigalibs/contracts';
import {
  AlignLeft,
  CalendarClock,
  CalendarDays,
  CheckSquare2,
  ChevronRight,
  CircleDollarSign,
  Download,
  Eye,
  FileCheck2,
  GripVertical,
  Hash,
  Layers3,
  Link2,
  ListChecks,
  Monitor,
  Plus,
  Rocket,
  Save,
  Send,
  Settings2,
  ShieldCheck,
  Smartphone,
  Trash2,
  Type,
  Upload,
} from 'lucide-react';
import { Button, Badge, Input, toast as medusaToast } from '@medusajs/ui';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import styles from './ConfigurationStudioWorkbench.module.css';

type ChangeSet = {
  id: string;
  status: string;
  version: number;
  moduleKey: string;
  entityKey: string;
  surfaceKey: string;
  definition: ConfigurationDefinition;
  checksum: string | null;
  compatibility: string;
  findings: Array<{ code: string; message: string; path: string; severity: string }>;
  createdById: string;
  updatedAt: string;
};

type PublishedVersion = {
  id: string;
  moduleKey: string;
  entityKey: string;
  surfaceKey: string;
  sequence: number;
  checksum: string;
  manifest: ConfigurationDefinition & { checksum: string };
  publishedAt: string;
};

type Activation = {
  id: string;
  moduleKey: string;
  entityKey: string;
  surfaceKey: string;
  environmentKey: string;
  cohortKey: string;
  status: string;
  activatedAt: string;
  publishedVersion: { checksum: string; sequence: number };
};

type ConfigurationSurface = {
  registrationKey: string;
  moduleKey: string;
  entityKey: string;
  surfaceKey: string;
  label: string;
  description: string;
  ownership: 'MODULE_EXTENSION' | 'TENANT_APPLICATION';
  entityKeyEditable: boolean;
  surfaceKeyEditable: boolean;
  modes: ConfigurationDefinition['mode'][];
};

const FIELD_TYPES: ConfigurationField['type'][] = [
  'TEXT',
  'TEXTAREA',
  'NUMBER',
  'INTEGER',
  'BOOLEAN',
  'DATE',
  'DATETIME',
  'EMAIL',
  'PHONE',
  'URL',
  'CURRENCY',
  'SELECT',
  'MULTI_SELECT',
];
const FIELD_PALETTE: Array<{
  type: ConfigurationField['type'];
  label: string;
  icon: typeof Type;
}> = [
  { type: 'TEXT', label: 'Short text', icon: Type },
  { type: 'TEXTAREA', label: 'Long text', icon: AlignLeft },
  { type: 'NUMBER', label: 'Number', icon: Hash },
  { type: 'INTEGER', label: 'Whole number', icon: Hash },
  { type: 'CURRENCY', label: 'Currency', icon: CircleDollarSign },
  { type: 'SELECT', label: 'Dropdown', icon: ListChecks },
  { type: 'MULTI_SELECT', label: 'Multi-select', icon: ListChecks },
  { type: 'BOOLEAN', label: 'Checkbox', icon: CheckSquare2 },
  { type: 'DATE', label: 'Date', icon: CalendarDays },
  { type: 'DATETIME', label: 'Date & time', icon: CalendarClock },
  { type: 'EMAIL', label: 'Email', icon: Send },
  { type: 'PHONE', label: 'Phone', icon: Smartphone },
  { type: 'URL', label: 'Website link', icon: Link2 },
];

export function ConfigurationStudioWorkbench({
  currentUserId,
  permissions,
  tenantId,
  tenantName,
  locale = 'en-US',
  currency = 'USD',
}: { currentUserId: string; permissions: string[]; tenantId: string; tenantName: string; locale?: string; currency?: string }) {
  const [tab, setTab] = useState<
    'designer' | 'governance' | 'published' | 'runtime' | 'portability'
  >('designer');
  const [definition, setDefinition] = useState<ConfigurationDefinition>(() => initialDefinition());
  const [previewValues, setPreviewValues] = useState<ConfigurationValues>({});
  const [changeSets, setChangeSets] = useState<ChangeSet[]>([]);
  const [published, setPublished] = useState<PublishedVersion[]>([]);
  const [activations, setActivations] = useState<Activation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState('Configure tenant-specific fields');
  const [busy, setBusy] = useState(false);
  const [packageText, setPackageText] = useState('');
  const [impact, setImpact] = useState<ConfigurationImpactReport | null>(null);
  const [surfaces, setSurfaces] = useState<ConfigurationSurface[]>([]);

  const selected = useMemo(
    () => changeSets.find((item) => item.id === selectedId) ?? null,
    [changeSets, selectedId],
  );
  const canDraft = hasPermission(permissions, 'configuration:draft');
  const canApprove = hasPermission(permissions, 'configuration:approve');
  const canPublish = hasPermission(permissions, 'configuration:publish');
  const canActivate = hasPermission(permissions, 'configuration:activate');
  const canRollback = hasPermission(permissions, 'configuration:rollback');
  const canExport = hasPermission(permissions, 'configuration:export');
  const canImport = hasPermission(permissions, 'configuration:import');

  const load = useCallback(async () => {
    const [draftResponse, publishedResponse, activationResponse, surfaceResponse] =
      await Promise.all([
        fetch('/api/control/configuration/change-sets', { cache: 'no-store' }),
        fetch('/api/control/configuration/published-versions', { cache: 'no-store' }),
        fetch('/api/control/configuration/activations', { cache: 'no-store' }),
        fetch('/api/control/configuration/surfaces', { cache: 'no-store' }),
      ]);
    const failed = [draftResponse, publishedResponse, activationResponse, surfaceResponse].find(
      (response) => !response.ok,
    );
    if (failed) throw new Error(await responseMessage(failed));
    setChangeSets((await draftResponse.json()) as ChangeSet[]);
    setPublished((await publishedResponse.json()) as PublishedVersion[]);
    setActivations((await activationResponse.json()) as Activation[]);
    setSurfaces((await surfaceResponse.json()) as ConfigurationSurface[]);
  }, []);

  useEffect(() => {
    void load().catch((error: unknown) => { medusaToast.error(errorMessage(error)); });
  }, [load]);

  useEffect(() => {
    if (!selectedId) {
      setImpact(null);
      return;
    }
    const controller = new AbortController();
    void fetch(`/api/control/configuration/change-sets/${encodeURIComponent(selectedId)}/impact`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseMessage(response));
        setImpact((await response.json()) as ConfigurationImpactReport);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setImpact(null);
        medusaToast.error(errorMessage(error));
      });
    return () => controller.abort();
  }, [selectedId, selected?.updatedAt]);

  async function perform(action: () => Promise<Response>, success: string) {
    setBusy(true);
    try {
      const response = await action();
      if (!response.ok) throw new Error(await responseMessage(response));
      const payload = (await response.json()) as ChangeSet | PublishedVersion | Activation;
      if ('status' in payload && 'version' in payload) setSelectedId(payload.id);
      await load();
      medusaToast.success(success);
    } catch (error) {
      medusaToast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  function createChangeSet() {
    return perform(
      () =>
        fetch('/api/control/configuration/change-sets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ definition, reason, idempotencyKey: crypto.randomUUID() }),
        }),
      'Validated change set saved to the tenant configuration ledger.',
    );
  }

  function transition(action: 'submit' | 'approve' | 'reject' | 'publish') {
    if (!selected) return;
    return perform(
      () =>
        fetch(
          `/api/control/configuration/change-sets/${encodeURIComponent(selected.id)}/${action}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason, expectedVersion: selected.version }),
          },
        ),
      action === 'publish'
        ? 'An immutable configuration version was published.'
        : `Change set ${action} completed.`,
    );
  }

  function activate(
    version: PublishedVersion,
    options: { environmentKey: string; cohortKey: string } = { environmentKey: 'local-uat', cohortKey: 'all-users' },
  ) {
    const current = activations.find(
      (item) =>
        item.status === 'ACTIVE' &&
        item.moduleKey === version.moduleKey &&
        item.entityKey === version.entityKey &&
        item.surfaceKey === version.surfaceKey,
    );
    const rollback = Boolean(current && current.publishedVersion.sequence > version.sequence);
    return perform(
      () =>
        fetch(
          rollback
            ? '/api/control/configuration/activations/rollback'
            : '/api/control/configuration/activations',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              publishedVersionId: version.id,
              environmentKey: options.environmentKey,
              cohortKey: options.cohortKey,
              reason,
              idempotencyKey: crypto.randomUUID(),
            }),
          },
        ),
      rollback
        ? `Runtime rolled back to version ${version.sequence}.`
        : `Version ${version.sequence} is active for ${options.environmentKey}.`,
    );
  }

  function selectChangeSet(item: ChangeSet) {
    setSelectedId(item.id);
    setDefinition(item.definition);
    setPreviewValues({});
    setTab('governance');
  }

  async function exportPackage() {
    const latest = latestPublishedVersions(published);
    if (latest.length === 0) {
      medusaToast.error('Publish at least one configuration version before exporting.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/control/configuration/packages/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publishedVersionIds: latest.map((item) => item.id),
          reason,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const envelope = await response.json();
      const content = JSON.stringify(envelope, null, 2);
      setPackageText(content);
      const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `gigalibs-configuration-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      medusaToast.success(`Exported ${latest.length} latest surface definition(s) in a signed package.`);
    } catch (error) {
      medusaToast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function importPackage() {
    setBusy(true);
    try {
      const configurationPackage = JSON.parse(packageText) as unknown;
      const response = await fetch('/api/control/configuration/packages/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          package: configurationPackage,
          reason,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      const result = (await response.json()) as { importedChangeSets: unknown[] };
      await load();
      setTab('governance');
      medusaToast.success(`Verified the signature and imported ${result.importedChangeSets.length} definition(s) as validated drafts.`);
    } catch (error) {
      medusaToast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-full bg-ui-bg-subtle p-6 lg:p-8">
      <header className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-ui-fg-muted">
            <Layers3 className="h-4 w-4" /> Governed metadata
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-ui-fg-base">
            Universal Configuration Studio
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-ui-fg-subtle">
            Design fields for {tenantName}, validate them on the server, route them through
            maker-checker approval, publish an immutable version, and activate it for runtime use.
          </p>
        </div>
        <div className="rounded-lg border border-ui-border-base bg-ui-bg-base px-4 py-3 text-xs text-ui-fg-subtle">
          <span className="font-semibold text-ui-fg-base">Tenant boundary</span>
          <br />
          {tenantId ? tenantId : null}
        </div>
      </header>

      <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Configuration workflow">
        {(
          [
            ['designer', '1. Design'],
            ['governance', '2. Review'],
            ['published', '3. Publish & activate'],
            ['runtime', '4. Runtime preview'],
            ['portability', '5. Package'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium ${tab === key ? 'border-ui-border-interactive bg-ui-bg-base text-ui-fg-base shadow-xs' : 'border-ui-border-base bg-transparent text-ui-fg-subtle hover:bg-ui-bg-base'}`}
          >
            {label}
          </button>
        ))}
      </div>

      

      {tab === 'designer' ? (
        <Designer
          definition={definition}
          setDefinition={setDefinition}
          values={previewValues}
          setValues={setPreviewValues}
          reason={reason}
          setReason={setReason}
          busy={busy}
          canDraft={canDraft}
          onSave={createChangeSet}
          surfaces={surfaces}
        />
      ) : null}
      {tab === 'governance' ? (
        <Governance
          changeSets={changeSets}
          selected={selected}
          impact={impact}
          currentUserId={currentUserId}
          reason={reason}
          setReason={setReason}
          busy={busy}
          canApprove={canApprove}
          canPublish={canPublish}
          onSelect={selectChangeSet}
          onTransition={transition}
        />
      ) : null}
      {tab === 'published' ? (
        <Published
          versions={published}
          activations={activations}
          busy={busy}
          canActivate={canActivate}
          canRollback={canRollback}
          onActivate={activate}
        />
      ) : null}
      {tab === 'runtime' ? <RuntimePreview versions={published} activations={activations} locale={locale} currency={currency} /> : null}
      {tab === 'portability' ? (
        <Portability
          packageText={packageText}
          setPackageText={setPackageText}
          reason={reason}
          setReason={setReason}
          busy={busy}
          canExport={canExport}
          canImport={canImport}
          onExport={exportPackage}
          onImport={importPackage}
        />
      ) : null}
    </main>
  );
}

function Designer({
  definition,
  setDefinition,
  values,
  setValues,
  reason,
  setReason,
  busy,
  canDraft,
  onSave,
  surfaces,
}: {
  definition: ConfigurationDefinition;
  setDefinition: (value: ConfigurationDefinition) => void;
  values: ConfigurationValues;
  setValues: (value: ConfigurationValues) => void;
  reason: string;
  setReason: (value: string) => void;
  busy: boolean;
  canDraft: boolean;
  onSave: () => void;
  surfaces: ConfigurationSurface[];
}) {
  const [selectedFieldKey, setSelectedFieldKey] = useState<string | null>(
    definition.fields[0]?.key ?? null,
  );
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const selectedField = definition.fields.find((field) => field.key === selectedFieldKey);
  const selectedFieldIndex = selectedField
    ? definition.fields.findIndex((field) => field.key === selectedField.key)
    : -1;
  const selectedSurface = surfaces.find(
    (surface) =>
      surface.moduleKey === definition.moduleKey &&
      (surface.entityKeyEditable || surface.entityKey === definition.entityKey) &&
      (surface.surfaceKeyEditable || surface.surfaceKey === definition.surfaceKey),
  );
  const updateField = (index: number, patch: Partial<ConfigurationField>) => {
    const previous = definition.fields[index];
    if (!previous) return;
    const oldKey = previous.key;
    const newKey = patch.key ?? oldKey;
    const fields = definition.fields.map((field, fieldIndex) => {
      const next = fieldIndex === index ? { ...field, ...patch } : field;
      if (oldKey === newKey) return next;
      return {
        ...next,
        visibleWhen: rewriteConditionFieldKey(next.visibleWhen, oldKey, newKey),
        requiredWhen: rewriteConditionFieldKey(next.requiredWhen, oldKey, newKey),
      };
    });
    const sections = definition.sections.map((section) => ({
      ...section,
      fieldKeys: section.fieldKeys.map((key) => (key === oldKey ? newKey : key)),
    }));
    setDefinition({ ...definition, fields, sections });
    if (selectedFieldKey === oldKey && newKey !== oldKey) setSelectedFieldKey(newKey);
  };
  const addField = (type: ConfigurationField['type'] = 'TEXT') => {
    const key = uniqueKey(definition.fields, type.toLowerCase().replace('_', '-'));
    const sections =
      definition.sections.length > 0
        ? definition.sections.map((section, index) =>
            index === 0 ? { ...section, fieldKeys: [...section.fieldKeys, key] } : section,
          )
        : [{ key: 'details', title: 'Details', columns: 1 as const, fieldKeys: [key] }];
    setDefinition({
      ...definition,
      fields: [
        ...definition.fields,
        {
          ...makeField(key),
          type,
          component: componentFor(type),
          label: fieldLabel(type),
          ...(type === 'SELECT' || type === 'MULTI_SELECT'
            ? { options: [{ value: 'option-1', label: 'Option 1' }] }
            : {}),
        },
      ],
      sections,
    });
    setSelectedFieldKey(key);
  };
  const removeField = (key: string) => {
    setDefinition({
      ...definition,
      fields: definition.fields
        .filter((field) => field.key !== key)
        .map((field) => ({
          ...field,
          ...(conditionUsesField(field.visibleWhen, key) ? { visibleWhen: undefined } : {}),
          ...(conditionUsesField(field.requiredWhen, key) ? { requiredWhen: undefined } : {}),
        })),
      sections: definition.sections.map((section) => ({
        ...section,
        fieldKeys: section.fieldKeys.filter((item) => item !== key),
      })),
    });
    if (selectedFieldKey === key)
      setSelectedFieldKey(definition.fields.find((field) => field.key !== key)?.key ?? null);
  };
  const addSection = () => {
    const key = uniqueSectionKey(definition.sections, 'new-section');
    setDefinition({
      ...definition,
      sections: [...definition.sections, { key, title: 'New section', columns: 1, fieldKeys: [] }],
    });
  };
  const updateSection = (
    index: number,
    patch: Partial<ConfigurationDefinition['sections'][number]>,
  ) => {
    if (!definition.sections[index]) return;
    setDefinition({
      ...definition,
      sections: definition.sections.map((section, sectionIndex) =>
        sectionIndex === index ? { ...section, ...patch } : section,
      ),
    });
  };
  const removeSection = (key: string) => {
    const section = definition.sections.find((item) => item.key === key);
    if (!section || section.fieldKeys.length > 0) return;
    setDefinition({
      ...definition,
      sections: definition.sections.filter((item) => item.key !== key),
    });
  };
  const moveField = (fieldKey: string, sectionKey: string) =>
    setDefinition({
      ...definition,
      sections: definition.sections.map((section) => ({
        ...section,
        fieldKeys: [
          ...section.fieldKeys.filter((key) => key !== fieldKey),
          ...(section.key === sectionKey ? [fieldKey] : []),
        ],
      })),
    });
  const reorderField = (fieldKey: string, direction: -1 | 1) => {
    const section = definition.sections.find((item) => item.fieldKeys.includes(fieldKey));
    if (!section) return;
    const current = section.fieldKeys.indexOf(fieldKey);
    const target = current + direction;
    if (target < 0 || target >= section.fieldKeys.length) return;
    const fieldKeys = [...section.fieldKeys];
    [fieldKeys[current], fieldKeys[target]] = [fieldKeys[target]!, fieldKeys[current]!];
    setDefinition({
      ...definition,
      sections: definition.sections.map((item) =>
        item.key === section.key ? { ...item, fieldKeys } : item,
      ),
    });
  };

  return (
    <div className={`${styles.studioGrid} min-h-[720px] overflow-hidden rounded-2xl border border-ui-border-base bg-ui-bg-base shadow-sm`}>
      <aside className={`${styles.palette} space-y-5 bg-white p-4`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ui-fg-muted">
              Build
            </p>
            <h2 className="mt-1 text-sm font-semibold">Components</h2>
          </div>
          <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
            {definition.fields.length} fields
          </span>
        </div>
        <div className="grid gap-3">
          <Labeled label="Target surface">
            <select
              value={selectedSurface?.registrationKey ?? ''}
              onChange={(event) => {
                const surface = surfaces.find(
                  (item) => item.registrationKey === event.target.value,
                );
                if (!surface) return;
                setDefinition({
                  ...definition,
                  moduleKey: surface.moduleKey,
                  entityKey: surface.entityKey,
                  surfaceKey: surface.surfaceKey,
                  mode: surface.modes[0] ?? 'EDIT',
                  title: surface.label,
                });
              }}
              className="studio-input"
            >
              {surfaces.length === 0 ? (
                <option value="">Loading registered surfaces…</option>
              ) : null}
              {surfaces.map((surface) => (
                <option key={surface.registrationKey} value={surface.registrationKey}>
                  {surface.label}
                </option>
              ))}
            </select>
          </Labeled>
          {selectedSurface ? (
            <p className="-mt-1 text-[11px] leading-4 text-ui-fg-muted">
              {selectedSurface.description}
            </p>
          ) : null}
          <Labeled label="Form mode">
            <select
              value={definition.mode}
              onChange={(event) =>
                setDefinition({
                  ...definition,
                  mode: event.target.value as ConfigurationDefinition['mode'],
                })
              }
              className="studio-input"
            >
              {(selectedSurface?.modes ?? ['CREATE', 'EDIT', 'READ', 'LIST']).map((mode) => (
                <option key={mode}>{mode}</option>
              ))}
            </select>
          </Labeled>
          {selectedSurface?.entityKeyEditable ? (
            <>
              <Labeled label="Entity key">
                <input
                  className="studio-input"
                  value={definition.entityKey}
                  onChange={(event) =>
                    setDefinition({ ...definition, entityKey: normalizeKey(event.target.value) })
                  }
                />
              </Labeled>
              <Labeled label="Surface key">
                <input
                  className="studio-input"
                  value={definition.surfaceKey}
                  onChange={(event) =>
                    setDefinition({ ...definition, surfaceKey: normalizeKey(event.target.value) })
                  }
                />
              </Labeled>
            </>
          ) : null}
          <Labeled label="Form title">
            <input
              className="studio-input"
              value={definition.title}
              onChange={(event) => setDefinition({ ...definition, title: event.target.value })}
            />
          </Labeled>
        </div>

        <div className="flex items-center justify-between border-t border-ui-border-base pt-4">
          <div>
            <h2 className="text-sm font-semibold">Layout sections</h2>
            <p className="text-xs text-ui-fg-muted">Group fields into responsive blocks.</p>
          </div>
          <button type="button" onClick={addSection} className="studio-secondary">
            <Plus className="h-4 w-4" /> Add section
          </button>
        </div>
        <div className="space-y-2">
          {definition.sections.map((section, index) => (
            <div
              key={section.key}
              className="space-y-2 rounded-xl border border-ui-border-base bg-ui-bg-subtle p-3"
            >
              <Labeled label="Section title">
                <input
                  className="studio-input"
                  value={section.title}
                  onChange={(event) => updateSection(index, { title: event.target.value })}
                />
              </Labeled>
              <div className="flex items-end gap-2">
                <Labeled label="Columns">
                  <select
                    className="studio-input"
                    value={section.columns}
                    onChange={(event) =>
                      updateSection(index, { columns: Number(event.target.value) as 1 | 2 | 3 })
                    }
                  >
                    <option value={1}>1 column</option>
                    <option value={2}>2 columns</option>
                    <option value={3}>3 columns</option>
                  </select>
                </Labeled>
                <button
                  type="button"
                  title={
                    section.fieldKeys.length > 0
                      ? 'Move fields before removing this section'
                      : 'Remove section'
                  }
                  disabled={section.fieldKeys.length > 0}
                  onClick={() => removeSection(section.key)}
                  className="mb-0.5 rounded-lg p-2 text-ui-fg-muted hover:bg-ui-bg-base hover:text-ui-fg-error disabled:opacity-30"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-ui-border-base pt-4">
          <div>
            <h2 className="text-sm font-semibold">Fields</h2>
            <p className="text-xs text-ui-fg-muted">Click a component to add it to the canvas.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {FIELD_PALETTE.map((item) => (
            <button
              key={item.type}
              type="button"
              aria-label={`Add ${item.label} field`}
              onClick={() => addField(item.type)}
              className="group rounded-xl border border-ui-border-base bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-sm"
            >
              <item.icon className="h-4 w-4 text-ui-fg-muted group-hover:text-emerald-600" />
              <span className="mt-2 block text-xs font-medium text-ui-fg-base">{item.label}</span>
            </button>
          ))}
        </div>
        <div className="border-t border-ui-border-base pt-4">
          <Labeled label="Change reason">
            <input
              className="studio-input"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Labeled>
          <button
            type="button"
            disabled={busy || !canDraft}
            onClick={onSave}
            className="studio-primary mt-3 w-full"
          >
            <Save className="h-4 w-4" /> Validate and save draft
          </button>
        </div>
      </aside>

      <section className="min-w-0 bg-[#f5f6f8] p-5 lg:p-7">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ui-fg-muted">
              Canvas
            </p>
            <h2 className="mt-1 text-sm font-semibold">{definition.title}</h2>
          </div>
          <div className="flex rounded-lg border border-ui-border-base bg-white p-1">
            <button
              type="button"
              aria-label="Desktop preview"
              onClick={() => setPreviewDevice('desktop')}
              className={`rounded-md p-1.5 ${previewDevice === 'desktop' ? 'bg-ui-bg-subtle text-ui-fg-base' : 'text-ui-fg-muted'}`}
            >
              <Monitor className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Mobile preview"
              onClick={() => setPreviewDevice('mobile')}
              className={`rounded-md p-1.5 ${previewDevice === 'mobile' ? 'bg-ui-bg-subtle text-ui-fg-base' : 'text-ui-fg-muted'}`}
            >
              <Smartphone className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div
          className={`mx-auto transition-all ${previewDevice === 'mobile' ? 'max-w-[390px]' : 'max-w-3xl'}`}
        >
          <div className="mb-3 flex flex-wrap gap-2">
            {definition.fields.map((field) => (
              <button
                type="button"
                key={field.key}
                onClick={() => setSelectedFieldKey(field.key)}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] ${selectedFieldKey === field.key ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-ui-border-base bg-white text-ui-fg-subtle'}`}
              >
                <GripVertical className="h-3 w-3" />
                {field.label}
              </button>
            ))}
          </div>
          <div className="rounded-2xl border border-ui-border-base bg-white p-5 shadow-[0_18px_55px_rgba(24,32,29,0.08)]">
            <div className="mb-6 border-b border-ui-border-base pb-5">
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                Live form
              </span>
              <input
                aria-label="Form title"
                className="mt-3 block w-full border-0 bg-transparent p-0 text-xl font-semibold outline-none"
                value={definition.title}
                onChange={(event) => setDefinition({ ...definition, title: event.target.value })}
              />
              <input
                aria-label="Form description"
                className="mt-1 block w-full border-0 bg-transparent p-0 text-sm text-ui-fg-subtle outline-none"
                value={definition.description ?? ''}
                placeholder="Add a clear description for users"
                onChange={(event) =>
                  setDefinition({ ...definition, description: event.target.value || undefined })
                }
              />
            </div>
            <FormEngineConfigurationForm definition={definition} values={values} onChange={setValues} />
          </div>
        </div>
      </section>

      <aside className={`${styles.inspector} bg-white p-4`}>
        <div className="mb-4 flex items-center gap-2 border-b border-ui-border-base pb-4">
          <Settings2 className="h-4 w-4 text-ui-fg-muted" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ui-fg-muted">
              Inspector
            </p>
            <h2 className="mt-1 text-sm font-semibold">
              {selectedField ? selectedField.label : 'Select a field'}
            </h2>
          </div>
        </div>
        {selectedField && selectedFieldIndex >= 0 ? (
          <>
            <div className="mb-3 flex gap-2">
              <button
                type="button"
                onClick={() => reorderField(selectedField.key, -1)}
                className="studio-secondary flex-1"
              >
                Move up
              </button>
              <button
                type="button"
                onClick={() => reorderField(selectedField.key, 1)}
                className="studio-secondary flex-1"
              >
                Move down
              </button>
            </div>
            <FieldEditor
              field={selectedField}
              fields={definition.fields}
              sections={definition.sections}
              currentSection={
                definition.sections.find((section) => section.fieldKeys.includes(selectedField.key))
                  ?.key ?? ''
              }
              onMove={(sectionKey) => moveField(selectedField.key, sectionKey)}
              onChange={(patch) => updateField(selectedFieldIndex, patch)}
              onRemove={() => removeField(selectedField.key)}
            />
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-ui-border-base p-8 text-center text-sm text-ui-fg-muted">
            Add or select a field to configure its label, validation, permissions, layout, and
            conditions.
          </div>
        )}
      </aside>
    </div>
  );
}

function FieldEditor({
  field,
  fields,
  sections,
  currentSection,
  onMove,
  onChange,
  onRemove,
}: {
  field: ConfigurationField;
  fields: ConfigurationField[];
  sections: ConfigurationDefinition['sections'];
  currentSection: string;
  onMove: (sectionKey: string) => void;
  onChange: (patch: Partial<ConfigurationField>) => void;
  onRemove: () => void;
}) {
  const numeric = ['NUMBER', 'INTEGER', 'CURRENCY'].includes(field.type);
  return (
    <div className="rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_160px_auto]">
        <Labeled label="Label">
          <input
            className="studio-input"
            value={field.label}
            onChange={(event) => onChange({ label: event.target.value })}
          />
        </Labeled>
        <Labeled label="Key">
          <input
            className="studio-input font-mono"
            value={field.key}
            onChange={(event) => onChange({ key: normalizeKey(event.target.value) })}
          />
        </Labeled>
        <Labeled label="Type">
          <select
            className="studio-input"
            value={field.type}
            onChange={(event) => {
              const type = event.target.value as ConfigurationField['type'];
              onChange({
                type,
                component: componentFor(type),
                ...(type === 'SELECT' || type === 'MULTI_SELECT'
                  ? { options: field.options ?? [{ value: 'option-1', label: 'Option 1' }] }
                  : { options: undefined }),
              });
            }}
          >
            {FIELD_TYPES.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </Labeled>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${field.label}`}
          className="mt-5 rounded-lg p-2 text-ui-fg-muted hover:bg-ui-bg-base hover:text-ui-fg-error"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Labeled label="Help text">
          <input
            className="studio-input"
            value={field.helpText ?? ''}
            onChange={(event) => onChange({ helpText: event.target.value || undefined })}
          />
        </Labeled>
        <Labeled label="Layout section">
          <select
            className="studio-input"
            value={currentSection}
            onChange={(event) => onMove(event.target.value)}
          >
            <option value="" disabled>
              Select section
            </option>
            {sections.map((section) => (
              <option key={section.key} value={section.key}>
                {section.title}
              </option>
            ))}
          </select>
        </Labeled>
      </div>
      <div className="mt-3 flex flex-wrap gap-5 text-xs">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(event) => onChange({ required: event.target.checked })}
          />{' '}
          Required
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={field.readOnly}
            onChange={(event) =>
              onChange({
                readOnly: event.target.checked,
                ...(event.target.checked ? { writePermission: undefined } : {}),
              })
            }
          />{' '}
          Read only
        </label>
        <label className="flex items-center gap-2">
          Classification{' '}
          <select
            className="rounded border border-ui-border-base bg-ui-bg-base px-2 py-1"
            value={field.classification}
            onChange={(event) =>
              onChange({
                classification: event.target.value as ConfigurationField['classification'],
              })
            }
          >
            <option>PUBLIC</option>
            <option>INTERNAL</option>
            <option>CONFIDENTIAL</option>
            <option>RESTRICTED</option>
          </select>
        </label>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Labeled label="Read permission (optional)">
          <input
            className="studio-input font-mono"
            placeholder="configuration-apps:read"
            value={field.readPermission ?? ''}
            onChange={(event) =>
              onChange({ readPermission: event.target.value.trim() || undefined })
            }
          />
        </Labeled>
        <Labeled label="Write permission (optional)">
          <input
            className="studio-input font-mono"
            placeholder="configuration-apps:write"
            disabled={field.readOnly}
            value={field.writePermission ?? ''}
            onChange={(event) =>
              onChange({ writePermission: event.target.value.trim() || undefined })
            }
          />
        </Labeled>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {numeric ? (
          <>
            <Labeled label="Minimum">
              <input
                type="number"
                className="studio-input"
                value={field.minimum ?? ''}
                onChange={(event) =>
                  onChange({
                    minimum: event.target.value === '' ? undefined : Number(event.target.value),
                  })
                }
              />
            </Labeled>
            <Labeled label="Maximum">
              <input
                type="number"
                className="studio-input"
                value={field.maximum ?? ''}
                onChange={(event) =>
                  onChange({
                    maximum: event.target.value === '' ? undefined : Number(event.target.value),
                  })
                }
              />
            </Labeled>
          </>
        ) : (
          <>
            <Labeled label="Minimum length">
              <input
                type="number"
                min={0}
                className="studio-input"
                value={field.minLength ?? ''}
                onChange={(event) =>
                  onChange({
                    minLength: event.target.value === '' ? undefined : Number(event.target.value),
                  })
                }
              />
            </Labeled>
            <Labeled label="Maximum length">
              <input
                type="number"
                min={1}
                className="studio-input"
                value={field.maxLength ?? ''}
                onChange={(event) =>
                  onChange({
                    maxLength: event.target.value === '' ? undefined : Number(event.target.value),
                  })
                }
              />
            </Labeled>
          </>
        )}
      </div>
      {field.type === 'SELECT' || field.type === 'MULTI_SELECT' ? (
        <Labeled label="Options (comma separated)">
          <input
            className="studio-input mt-2"
            value={(field.options ?? []).map((option) => option.label).join(', ')}
            onChange={(event) =>
              onChange({
                options: event.target.value
                  .split(',')
                  .map((label) => label.trim())
                  .filter(Boolean)
                  .map((label) => ({ label, value: normalizeKey(label) })),
              })
            }
          />
        </Labeled>
      ) : null}
      <div className="mt-4 grid gap-3 border-t border-ui-border-base pt-4 lg:grid-cols-2">
        <ConditionalRuleEditor
          label="Show this field when"
          condition={field.visibleWhen}
          fields={fields}
          targetKey={field.key}
          onChange={(visibleWhen) => onChange({ visibleWhen })}
        />
        <ConditionalRuleEditor
          label="Require this field when"
          condition={field.requiredWhen}
          fields={fields}
          targetKey={field.key}
          onChange={(requiredWhen) => onChange({ requiredWhen })}
        />
      </div>
    </div>
  );
}

function ConditionalRuleEditor({
  label,
  condition,
  fields,
  targetKey,
  onChange,
}: {
  label: string;
  condition: ConfigurationCondition | undefined;
  fields: ConfigurationField[];
  targetKey: string;
  onChange: (condition: ConfigurationCondition | undefined) => void;
}) {
  const sourceFields = fields.filter((item) => item.key !== targetKey);
  const predicate = condition?.kind === 'PREDICATE' ? condition : undefined;
  const source = sourceFields.find((item) => item.key === predicate?.fieldKey);
  const enabled = Boolean(condition);
  const setPredicate = (patch: Partial<Extract<ConfigurationCondition, { kind: 'PREDICATE' }>>) => {
    const current = predicate ?? {
      kind: 'PREDICATE' as const,
      fieldKey: sourceFields[0]?.key ?? '',
      operator: 'EQUALS' as const,
      value: '',
    };
    const next = { ...current, ...patch };
    if (next.operator === 'IS_EMPTY' || next.operator === 'IS_NOT_EMPTY') delete next.value;
    else if (next.value === undefined) next.value = '';
    onChange(next);
  };
  return (
    <fieldset className="rounded-lg border border-ui-border-base bg-ui-bg-base p-3">
      <label className="flex items-center gap-2 text-xs font-medium">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!enabled && sourceFields.length === 0}
          onChange={(event) =>
            onChange(
              event.target.checked
                ? {
                    kind: 'PREDICATE',
                    fieldKey: sourceFields[0]?.key ?? '',
                    operator: 'EQUALS',
                    value: '',
                  }
                : undefined,
            )
          }
        />
        {label}
      </label>
      {condition?.kind === 'GROUP' ? (
        <p className="mt-3 rounded border border-ui-border-base p-2 text-xs text-ui-fg-subtle">
          This version contains a governed {condition.combinator.toLowerCase()} group with{' '}
          {condition.conditions.length} rules. It is preserved; clear it to replace it with a single
          visual rule.
        </p>
      ) : null}
      {predicate ? (
        <div className="mt-3 grid gap-2">
          <select
            className="studio-input"
            aria-label={`${label} source field`}
            value={predicate.fieldKey}
            onChange={(event) => setPredicate({ fieldKey: event.target.value, value: '' })}
          >
            {sourceFields.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
          <select
            className="studio-input"
            aria-label={`${label} operator`}
            value={predicate.operator}
            onChange={(event) =>
              setPredicate({
                operator: event.target.value as Extract<
                  ConfigurationCondition,
                  { kind: 'PREDICATE' }
                >['operator'],
              })
            }
          >
            <option value="EQUALS">equals</option>
            <option value="NOT_EQUALS">does not equal</option>
            <option value="IS_EMPTY">is empty</option>
            <option value="IS_NOT_EMPTY">is not empty</option>
            {source && ['NUMBER', 'INTEGER', 'CURRENCY'].includes(source.type) ? (
              <>
                <option value="GREATER_THAN">is greater than</option>
                <option value="GREATER_THAN_OR_EQUAL">is at least</option>
                <option value="LESS_THAN">is less than</option>
                <option value="LESS_THAN_OR_EQUAL">is at most</option>
              </>
            ) : null}
            <option value="IN">is in list</option>
            {source && ['TEXT', 'TEXTAREA', 'MULTI_SELECT'].includes(source.type) ? (
              <option value="CONTAINS">contains</option>
            ) : null}
          </select>
          {predicate.operator !== 'IS_EMPTY' && predicate.operator !== 'IS_NOT_EMPTY' ? (
            source?.type === 'BOOLEAN' && predicate.operator !== 'IN' ? (
              <select
                className="studio-input"
                aria-label={`${label} comparison value`}
                value={String(predicate.value ?? false)}
                onChange={(event) => setPredicate({ value: event.target.value === 'true' })}
              >
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : (
              <input
                className="studio-input"
                aria-label={`${label} comparison value`}
                placeholder={predicate.operator === 'IN' ? 'value-1, value-2' : 'Comparison value'}
                value={conditionValueText(predicate.value)}
                onChange={(event) =>
                  setPredicate({
                    value: parseConditionValue(event.target.value, source, predicate.operator),
                  })
                }
              />
            )
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}

function Governance({
  changeSets,
  selected,
  impact,
  currentUserId,
  reason,
  setReason,
  busy,
  canApprove,
  canPublish,
  onSelect,
  onTransition,
}: {
  changeSets: ChangeSet[];
  selected: ChangeSet | null;
  impact: ConfigurationImpactReport | null;
  currentUserId: string;
  reason: string;
  setReason: (value: string) => void;
  busy: boolean;
  canApprove: boolean;
  canPublish: boolean;
  onSelect: (item: ChangeSet) => void;
  onTransition: (action: 'submit' | 'approve' | 'reject' | 'publish') => void;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <section className="rounded-xl border border-ui-border-base bg-ui-bg-base p-3 shadow-xs">
        <h2 className="px-2 py-2 text-sm font-semibold">Change sets</h2>
        <div className="space-y-1">
          {changeSets.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelect(item)}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-3 text-left ${selected?.id === item.id ? 'bg-ui-bg-base-hover' : 'hover:bg-ui-bg-subtle'}`}
            >
              <span>
                <span className="block text-sm font-medium">{item.definition.title}</span>
                <span className="mt-1 block font-mono text-[10px] text-ui-fg-muted">
                  {item.status} · v{item.version} · {item.compatibility}
                </span>
              </span>
              <ChevronRight className="h-4 w-4" />
            </button>
          ))}
          {changeSets.length === 0 ? (
            <p className="p-5 text-center text-sm text-ui-fg-muted">
              No persisted change sets yet.
            </p>
          ) : null}
        </div>
      </section>
      <section className="rounded-xl border border-ui-border-base bg-ui-bg-base p-6 shadow-xs">
        {selected ? (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-ui-fg-muted">
                  {selected.moduleKey} / {selected.entityKey} / {selected.surfaceKey}
                </p>
                <h2 className="mt-1 text-xl font-semibold">{selected.definition.title}</h2>
                <p className="mt-2 text-sm text-ui-fg-subtle">
                  Status {selected.status}, record version {selected.version}, compatibility{' '}
                  {selected.compatibility}.
                </p>
              </div>
              <span className="rounded-full border border-ui-border-base px-3 py-1 font-mono text-xs">
                {selected.checksum?.slice(0, 24) ?? 'Not compiled'}
              </span>
            </div>
            {selected.findings.length > 0 ? (
              <div className="mt-5 rounded-lg border border-ui-tag-red-border bg-ui-tag-red-bg p-4">
                {selected.findings.map((finding) => (
                  <p
                    key={`${finding.code}-${finding.path}`}
                    className="text-sm text-ui-tag-red-text"
                  >
                    {finding.code}: {finding.message}
                  </p>
                ))}
              </div>
            ) : (
              <div className="mt-5 flex items-center gap-2 rounded-lg border border-ui-tag-green-border bg-ui-tag-green-bg p-4 text-sm text-ui-tag-green-text">
                <FileCheck2 className="h-4 w-4" /> Server compilation passed with no blocking
                findings.
              </div>
            )}
            {impact ? (
              <ImpactSummary impact={impact} />
            ) : (
              <p className="mt-5 text-sm text-ui-fg-muted">Evaluating persisted-record impact…</p>
            )}
            <Labeled label="Decision reason">
              <input
                className="studio-input mt-5"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Labeled>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                disabled={busy || selected.status !== 'VALIDATED'}
                onClick={() => onTransition('submit')}
                className="studio-primary"
              >
                <Send className="h-4 w-4" /> Submit
              </button>
              <button
                disabled={
                  busy ||
                  !canApprove ||
                  selected.status !== 'SUBMITTED' ||
                  selected.createdById === currentUserId
                }
                onClick={() => onTransition('approve')}
                className="studio-primary"
              >
                <ShieldCheck className="h-4 w-4" /> Approve
              </button>
              <button
                disabled={busy || !canApprove || selected.status !== 'SUBMITTED'}
                onClick={() => onTransition('reject')}
                className="studio-secondary"
              >
                Reject
              </button>
              <button
                disabled={busy || !canPublish || selected.status !== 'APPROVED'}
                onClick={() => onTransition('publish')}
                className="studio-primary"
              >
                <Rocket className="h-4 w-4" /> Publish immutable version
              </button>
            </div>
            {selected.createdById === currentUserId && selected.status === 'SUBMITTED' ? (
              <p className="mt-3 text-xs text-ui-fg-muted">
                Maker-checker control: sign in as a different authorized tenant administrator to
                approve this change.
              </p>
            ) : null}
          </>
        ) : (
          <p className="py-20 text-center text-sm text-ui-fg-muted">
            Select a change set to review its evidence and lifecycle actions.
          </p>
        )}
      </section>
    </div>
  );
}

function ImpactSummary({ impact }: { impact: ConfigurationImpactReport }) {
  const incompatible =
    impact.incompatible.configurationRecords + impact.incompatible.extensionValues;
  return (
    <div
      className={`mt-5 rounded-lg border p-4 ${impact.activationAllowed ? 'border-ui-tag-green-border bg-ui-tag-green-bg' : 'border-ui-tag-red-border bg-ui-tag-red-bg'}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Persisted-record impact</h3>
        <span className="rounded-full border border-current px-2 py-0.5 text-xs font-semibold">
          {impact.classification}
        </span>
      </div>
      <p className="mt-2 text-sm">
        Scanned {impact.scanned.configurationRecords} application record(s) and{' '}
        {impact.scanned.extensionValues} extension record(s).{' '}
        {incompatible === 0
          ? 'All persisted values are valid under this definition.'
          : `${incompatible} record(s) are incompatible; activation will be blocked.`}
      </p>
      {impact.changes.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs">
          {impact.changes.map((change, index) => (
            <li key={`${change.fieldKey}-${change.kind}-${index}`}>
              <span className="font-semibold">{change.severity}</span> · {change.message}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs">No field-level schema changes detected.</p>
      )}
      {impact.incompatible.samples.length > 0 ? (
        <p className="mt-3 text-xs">
          Affected record identifiers:{' '}
          {impact.incompatible.samples.map((sample) => sample.recordId).join(', ')}. Stored values
          are never displayed in the report.
        </p>
      ) : null}
    </div>
  );
}

function Published({
  versions,
  activations,
  busy,
  canActivate,
  canRollback,
  onActivate,
}: {
  versions: PublishedVersion[];
  activations: Activation[];
  busy: boolean;
  canActivate: boolean;
  canRollback: boolean;
  onActivate: (version: PublishedVersion, options: { environmentKey: string; cohortKey: string }) => void;
}) {
  const [environmentKey, setEnvironmentKey] = useState('local-uat');
  const [cohortKey, setCohortKey] = useState('all-users');
  const activeIds = new Set(
    activations
      .filter((item) => item.status === 'ACTIVE')
      .map(
        (item) =>
          `${item.moduleKey}/${item.entityKey}/${item.surfaceKey}/${item.publishedVersion.sequence}`,
      ),
  );
  return (
    <section className="rounded-xl border border-ui-border-base bg-ui-bg-base p-5 shadow-xs">
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <h2 className="text-sm font-semibold">Immutable published versions</h2>
        <div className="ml-auto flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-ui-fg-muted">
            Environment
            <select
              value={environmentKey}
              onChange={(e) => setEnvironmentKey(e.target.value)}
              className="studio-input studio-input-sm"
            >
              <option value="local-uat">Local UAT</option>
              <option value="staging">Staging</option>
              <option value="production">Production</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs text-ui-fg-muted">
            Cohort
            <select
              value={cohortKey}
              onChange={(e) => setCohortKey(e.target.value)}
              className="studio-input studio-input-sm"
            >
              <option value="all-users">All users</option>
              <option value="beta">Beta</option>
              <option value="internal">Internal only</option>
            </select>
          </label>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-ui-border-base text-xs uppercase text-ui-fg-muted">
            <tr>
              <th className="p-3">Surface</th>
              <th className="p-3">Version</th>
              <th className="p-3">Checksum</th>
              <th className="p-3">Published</th>
              <th className="p-3 text-right">Runtime</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((version) => {
              const active = activeIds.has(
                `${version.moduleKey}/${version.entityKey}/${version.surfaceKey}/${version.sequence}`,
              );
              const current = activations.find(
                (item) =>
                  item.status === 'ACTIVE' &&
                  item.moduleKey === version.moduleKey &&
                  item.entityKey === version.entityKey &&
                  item.surfaceKey === version.surfaceKey,
              );
              const isRollback = Boolean(
                current && current.publishedVersion.sequence > version.sequence,
              );
              return (
                <tr key={version.id} className="border-b border-ui-border-base last:border-0">
                  <td className="p-3">
                    <span className="font-medium">{version.manifest.title}</span>
                    <span className="block font-mono text-[10px] text-ui-fg-muted">
                      {version.moduleKey}/{version.entityKey}/{version.surfaceKey}
                    </span>
                  </td>
                  <td className="p-3">v{version.sequence}</td>
                  <td className="p-3 font-mono text-xs">{version.checksum.slice(0, 20)}…</td>
                  <td className="p-3">{new Date(version.publishedAt).toLocaleString()}</td>
                  <td className="p-3 text-right">
                    {active ? (
                      <span className="text-ui-fg-success">Active</span>
                    ) : (
                      <button
                        disabled={busy || (isRollback ? !canRollback : !canActivate)}
                        onClick={() => onActivate(version, { environmentKey, cohortKey })}
                        className="studio-secondary"
                      >
                        {isRollback ? `Rollback to v${version.sequence}` : 'Activate for UAT'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {versions.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-10 text-center text-ui-fg-muted">
                  No published configuration exists.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RuntimePreview({
  versions,
  activations,
  locale = 'en-US',
  currency = 'USD',
}: { versions: PublishedVersion[]; activations: Activation[]; locale?: string; currency?: string }) {
  const active = activations.find((item) => item.status === 'ACTIVE');
  const version = active
    ? versions.find(
        (item) =>
          item.moduleKey === active.moduleKey &&
          item.entityKey === active.entityKey &&
          item.surfaceKey === active.surfaceKey &&
          item.sequence === active.publishedVersion.sequence,
      )
    : undefined;
  const [values, setValues] = useState<ConfigurationValues>({});
  const [previewMode, setPreviewMode] = useState<'AUTO' | 'EDIT' | 'READ' | 'LIST'>('AUTO');
  const [maskPolicy, setMaskPolicy] = useState<'NONE' | 'MASK_LAST_FOUR' | 'REDACTED'>('NONE');

  const sampleRecords = useMemo(() => {
    if (!version) return [];
    return [
      { id: 'rec-001', ...values },
      {
        id: 'rec-002',
        ...Object.fromEntries(
          version.manifest.fields.map((f) => [
            f.key,
            f.type === 'CURRENCY'
              ? 350000
              : f.type === 'NUMBER' || f.type === 'INTEGER'
                ? 42
                : f.type === 'BOOLEAN'
                  ? true
                  : `${f.label} Sample A`,
          ]),
        ),
      },
      {
        id: 'rec-003',
        ...Object.fromEntries(
          version.manifest.fields.map((f) => [
            f.key,
            f.type === 'CURRENCY'
              ? 1250000
              : f.type === 'NUMBER' || f.type === 'INTEGER'
                ? 99
                : f.type === 'BOOLEAN'
                  ? false
                  : `${f.label} Sample B`,
          ]),
        ),
      },
    ];
  }, [version, values]);

  const effectiveMode = previewMode === 'AUTO' ? (version?.manifest.mode ?? 'EDIT') : previewMode;

  return (
    <div className="space-y-4">
      {version ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-ui-border-base bg-ui-bg-base p-4 text-sm">
            <div>
              <span className="font-semibold">Runtime resolution:</span> {active?.environmentKey} /{' '}
              {active?.cohortKey} / version {version.sequence}
              <span className="mt-1 block font-mono text-xs text-ui-fg-muted">
                {version.checksum}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-medium text-ui-fg-muted">View layout:</span>
                <select
                  value={previewMode}
                  onChange={(e) =>
                    setPreviewMode(e.target.value as 'AUTO' | 'EDIT' | 'READ' | 'LIST')
                  }
                  className="rounded border border-ui-border-base bg-white px-2 py-1 text-xs"
                >
                  <option value="AUTO">Auto (Manifest: {version.manifest.mode})</option>
                  <option value="EDIT">Interactive Form (EDIT)</option>
                  <option value="READ">Read-Only Detail Card (READ)</option>
                  <option value="LIST">Tabular Data Grid (LIST)</option>
                </select>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-medium text-ui-fg-muted">Privacy masking:</span>
                <select
                  value={maskPolicy}
                  onChange={(e) =>
                    setMaskPolicy(e.target.value as 'NONE' | 'MASK_LAST_FOUR' | 'REDACTED')
                  }
                  className="rounded border border-ui-border-base bg-white px-2 py-1 text-xs"
                >
                  <option value="NONE">No Masking (Cleartext)</option>
                  <option value="MASK_LAST_FOUR">Mask Last 4 (PII/Protected)</option>
                  <option value="REDACTED">Full Redaction</option>
                </select>
              </div>
            </div>
          </div>

          <ConfigurationRenderer
            definition={{
              ...version.manifest,
              mode: effectiveMode,
            }}
            values={values}
            records={sampleRecords}
            maskPolicy={maskPolicy}
            locale={locale}
            currency={currency}
            onChange={setValues}
            formEngine={process.env.NEXT_PUBLIC_USE_FORM_ENGINE === 'true' && effectiveMode === 'EDIT'}
          />
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-ui-border-base bg-ui-bg-base p-16 text-center">
          <Rocket className="mx-auto h-8 w-8 text-ui-fg-muted" />
          <p className="mt-3 text-sm text-ui-fg-subtle">
            Publish and activate a version to render the tenant runtime surface.
          </p>
        </div>
      )}
    </div>
  );
}

function Portability({
  packageText,
  setPackageText,
  reason,
  setReason,
  busy,
  canExport,
  canImport,
  onExport,
  onImport,
}: {
  packageText: string;
  setPackageText: (value: string) => void;
  reason: string;
  setReason: (value: string) => void;
  busy: boolean;
  canExport: boolean;
  canImport: boolean;
  onExport: () => void;
  onImport: () => void;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-xl border border-ui-border-base bg-ui-bg-base p-6 shadow-xs">
        <Download className="h-6 w-6 text-ui-fg-muted" />
        <h2 className="mt-3 text-lg font-semibold">Export signed definitions</h2>
        <p className="mt-2 text-sm text-ui-fg-subtle">
          Exports the latest immutable version of every configured surface. Packages contain
          definitions and checksums; tenant records and secret values are excluded.
        </p>
        <button className="studio-primary mt-5" disabled={busy || !canExport} onClick={onExport}>
          <Download className="h-4 w-4" /> Export JSON package
        </button>
      </section>
      <section className="rounded-xl border border-ui-border-base bg-ui-bg-base p-6 shadow-xs">
        <Upload className="h-6 w-6 text-ui-fg-muted" />
        <h2 className="mt-3 text-lg font-semibold">Import as governed drafts</h2>
        <p className="mt-2 text-sm text-ui-fg-subtle">
          Only trusted Ed25519 signatures are accepted. Imported definitions enter validation and
          still require review, publication and activation.
        </p>
        <Labeled label="Import reason">
          <input
            className="studio-input"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Labeled>
        <label className="mt-4 block text-xs font-medium">
          Load package file
          <input
            className="mt-2 block w-full text-sm"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void file.text().then(setPackageText);
            }}
          />
        </label>
        <Labeled label="Signed package JSON">
          <textarea
            className="studio-input min-h-64 font-mono text-xs"
            value={packageText}
            onChange={(event) => setPackageText(event.target.value)}
          />
        </Labeled>
        <button
          className="studio-primary mt-4"
          disabled={busy || !canImport || packageText.trim().length === 0}
          onClick={onImport}
        >
          <Upload className="h-4 w-4" /> Verify and import drafts
        </button>
      </section>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs font-medium text-ui-fg-base">
      <span className="mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}
function hasPermission(permissions: string[], required: string) {
  const [resource] = required.split(':');
  return (
    permissions.includes('*') ||
    permissions.includes(required) ||
    permissions.includes(`${resource}:*`)
  );
}
function makeField(key: string): ConfigurationField {
  return {
    key,
    label: 'New field',
    type: 'TEXT',
    component: 'text-input',
    required: false,
    readOnly: false,
    classification: 'INTERNAL',
  };
}
function fieldLabel(type: ConfigurationField['type']) {
  return (
    FIELD_PALETTE.find((item) => item.type === type)?.label ??
    type.toLowerCase().replaceAll('_', ' ')
  );
}
function uniqueKey(fields: ConfigurationField[], base: string) {
  const keys = new Set(fields.map((field) => field.key));
  let candidate = base;
  let suffix = 2;
  while (keys.has(candidate)) candidate = `${base}-${suffix++}`;
  return candidate;
}
function uniqueSectionKey(sections: ConfigurationDefinition['sections'], base: string) {
  const keys = new Set(sections.map((section) => section.key));
  let candidate = base;
  let suffix = 2;
  while (keys.has(candidate)) candidate = `${base}-${suffix++}`;
  return candidate;
}
function normalizeKey(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'field'
  );
}
function rewriteConditionFieldKey(
  condition: ConfigurationCondition | undefined,
  oldKey: string,
  newKey: string,
): ConfigurationCondition | undefined {
  if (!condition) return undefined;
  if (condition.kind === 'PREDICATE')
    return condition.fieldKey === oldKey ? { ...condition, fieldKey: newKey } : condition;
  return {
    ...condition,
    conditions: condition.conditions.map((item) => rewriteConditionFieldKey(item, oldKey, newKey)!),
  };
}
function conditionUsesField(
  condition: ConfigurationCondition | undefined,
  fieldKey: string,
): boolean {
  if (!condition) return false;
  if (condition.kind === 'PREDICATE') return condition.fieldKey === fieldKey;
  return condition.conditions.some((item) => conditionUsesField(item, fieldKey));
}
function conditionValueText(
  value: Extract<ConfigurationCondition, { kind: 'PREDICATE' }>['value'],
) {
  return Array.isArray(value)
    ? value.join(', ')
    : value === undefined || value === null
      ? ''
      : String(value);
}
function parseConditionValue(
  value: string,
  source: ConfigurationField | undefined,
  operator: Extract<ConfigurationCondition, { kind: 'PREDICATE' }>['operator'],
): string | number | boolean | Array<string | number | boolean> {
  const parseOne = (item: string): string | number | boolean => {
    if (source && ['NUMBER', 'INTEGER', 'CURRENCY'].includes(source.type)) {
      const parsed = Number(item);
      return Number.isFinite(parsed) ? parsed : item;
    }
    if (source?.type === 'BOOLEAN') return item.trim().toLowerCase() === 'true';
    return item;
  };
  return operator === 'IN'
    ? value.split(',').map((item) => parseOne(item.trim()))
    : parseOne(value);
}
function componentFor(type: ConfigurationField['type']): ConfigurationField['component'] {
  if (type === 'TEXTAREA') return 'textarea';
  if (type === 'BOOLEAN') return 'checkbox';
  if (type === 'DATE') return 'date-input';
  if (type === 'DATETIME') return 'datetime-input';
  if (type === 'SELECT') return 'select';
  if (type === 'MULTI_SELECT') return 'multi-select';
  if (['NUMBER', 'INTEGER', 'CURRENCY'].includes(type)) return 'number-input';
  return 'text-input';
}
function initialDefinition(): ConfigurationDefinition {
  return {
    contractVersion: '1.0',
    moduleKey: 'tenant-settings',
    entityKey: 'tenant-profile',
    surfaceKey: 'profile-extension',
    mode: 'EDIT',
    title: 'New configuration',
    description: 'Define schema-driven fields for this surface.',
    fields: [],
    sections: [],
  };
}
async function responseMessage(response: Response) {
  const payload = (await response.json().catch(() => null)) as {
    message?: string | string[];
    detail?: string;
  } | null;
  if (Array.isArray(payload?.message)) return payload.message.join(' ');
  return payload?.message ?? payload?.detail ?? `Request failed (${response.status}).`;
}
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'The request could not be completed.';
}
function latestPublishedVersions(versions: PublishedVersion[]) {
  const latest = new Map<string, PublishedVersion>();
  for (const version of versions) {
    const key = `${version.moduleKey}/${version.entityKey}/${version.surfaceKey}`;
    const current = latest.get(key);
    if (!current || version.sequence > current.sequence) latest.set(key, version);
  }
  return [...latest.values()];
}
