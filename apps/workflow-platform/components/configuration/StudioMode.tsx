'use client';

import {
  type ConfigurationSurface,
  decodeConfigurationSurfaces,
} from '@/lib/configuration-surface-registry';
import { parseOptionsInput } from '@/lib/form-options-parser';
import { type ConfigurationField, holdsAnyPermission } from '@gigalibs/contracts';
import {
  CheckCircle,
  ChevronDown,
  ChevronRight,
  LockKeyhole,
  PanelRightOpen,
  Plus,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ConfigurationStudioWorkbench } from './ConfigurationStudioWorkbench';

// ─── Types ───────────────────────────────────────────────────────────────────

type SurfaceTarget = {
  registrationKey: string;
  moduleLabel: string;
  screenLabel: string;
};

type StudioModeContextValue = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  openSurface: (target: SurfaceTarget) => void;
};

type FieldType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'NUMBER'
  | 'INTEGER'
  | 'BOOLEAN'
  | 'DATE'
  | 'DATETIME'
  | 'EMAIL'
  | 'PHONE'
  | 'URL'
  | 'CURRENCY'
  | 'SELECT'
  | 'MULTI_SELECT';

type AddFieldForm = {
  label: string;
  key: string;
  type: FieldType;
  required: boolean;
  helpText: string;
  optionsText: string;
};

type SaveResult = {
  ok: boolean;
  changeSetId?: string;
  message: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function typeToComponent(type: FieldType): string {
  const map: Record<FieldType, string> = {
    TEXT: 'text-input',
    EMAIL: 'text-input',
    PHONE: 'text-input',
    URL: 'text-input',
    CURRENCY: 'number-input',
    NUMBER: 'number-input',
    INTEGER: 'number-input',
    TEXTAREA: 'textarea',
    BOOLEAN: 'checkbox',
    DATE: 'date-input',
    DATETIME: 'datetime-input',
    SELECT: 'select',
    MULTI_SELECT: 'multi-select',
  };
  return map[type] ?? 'text-input';
}

function labelToKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function typeBadgeColor(type: string): string {
  const colors: Record<string, string> = {
    TEXT: 'bg-sky-50 text-sky-700 border-sky-200',
    TEXTAREA: 'bg-sky-50 text-sky-700 border-sky-200',
    EMAIL: 'bg-violet-50 text-violet-700 border-violet-200',
    PHONE: 'bg-violet-50 text-violet-700 border-violet-200',
    URL: 'bg-violet-50 text-violet-700 border-violet-200',
    NUMBER: 'bg-orange-50 text-orange-700 border-orange-200',
    INTEGER: 'bg-orange-50 text-orange-700 border-orange-200',
    CURRENCY: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    BOOLEAN: 'bg-rose-50 text-rose-700 border-rose-200',
    DATE: 'bg-amber-50 text-amber-700 border-amber-200',
    DATETIME: 'bg-amber-50 text-amber-700 border-amber-200',
    SELECT: 'bg-purple-50 text-purple-700 border-purple-200',
    MULTI_SELECT: 'bg-purple-50 text-purple-700 border-purple-200',
  };
  return colors[type] ?? 'bg-zinc-50 text-zinc-600 border-zinc-200';
}

async function responseMessage(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as {
    detail?: string;
    message?: string | string[];
  } | null;
  if (Array.isArray(payload?.message)) return payload.message.join(' ');
  return (
    payload?.message ?? payload?.detail ?? `Request failed (${response.status}).`
  );
}

// ─── Context ─────────────────────────────────────────────────────────────────

const StudioModeContext = createContext<StudioModeContextValue | null>(null);

// ─── Provider ────────────────────────────────────────────────────────────────

export function StudioModeProvider({
  children,
  canUseStudioMode,
  currentUserId,
  permissions,
  tenantId,
  tenantName,
}: {
  children: ReactNode;
  canUseStudioMode: boolean;
  currentUserId: string;
  permissions: string[];
  tenantId: string;
  tenantName: string;
}) {
  const storageKey = `gigalibs-studio-mode:${tenantId}`;
  const [enabled, setEnabledState] = useState(false);
  const [target, setTarget] = useState<SurfaceTarget | null>(null);
  const [designerOpen, setDesignerOpen] = useState(false);

  useEffect(() => {
    if (!canUseStudioMode) return;
    setEnabledState(window.sessionStorage.getItem(storageKey) === 'true');
  }, [canUseStudioMode, storageKey]);

  const setEnabled = useCallback(
    (nextEnabled: boolean) => {
      if (!canUseStudioMode) return;
      setEnabledState(nextEnabled);
      window.sessionStorage.setItem(storageKey, String(nextEnabled));
      if (!nextEnabled) {
        setTarget(null);
        setDesignerOpen(false);
      }
    },
    [canUseStudioMode, storageKey],
  );

  const openSurface = useCallback(
    (nextTarget: SurfaceTarget) => {
      if (!canUseStudioMode || !enabled) return;
      setTarget(nextTarget);
    },
    [canUseStudioMode, enabled],
  );

  const value = useMemo(
    () => ({ enabled: canUseStudioMode && enabled, setEnabled, openSurface }),
    [canUseStudioMode, enabled, openSurface, setEnabled],
  );

  return (
    <StudioModeContext.Provider value={value}>
      {children}
      {value.enabled ? (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[70] border-2 border-amber-400"
        />
      ) : null}
      {target && !designerOpen ? (
        <StudioSurfacePanel
          target={target}
          currentUserId={currentUserId}
          permissions={permissions}
          tenantId={tenantId}
          tenantName={tenantName}
          onClose={() => setTarget(null)}
          onOpenDesigner={() => setDesignerOpen(true)}
        />
      ) : null}
      {target && designerOpen ? (
        <div className="fixed inset-3 z-[90] overflow-auto rounded-2xl border border-amber-300 bg-ui-bg-subtle shadow-2xl">
          <ConfigurationStudioWorkbench
            currentUserId={currentUserId}
            permissions={permissions}
            tenantId={tenantId}
            tenantName={tenantName}
            initialRegistrationKey={target.registrationKey}
            returnTo="/modules"
            onClose={() => setDesignerOpen(false)}
          />
        </div>
      ) : null}
    </StudioModeContext.Provider>
  );
}

// ─── Toggle ──────────────────────────────────────────────────────────────────

export function StudioModeToggle() {
  const studio = useContext(StudioModeContext);
  if (!studio) return null;

  return (
    <button
      type="button"
      aria-pressed={studio.enabled}
      onClick={() => studio.setEnabled(!studio.enabled)}
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
        studio.enabled
          ? 'border-amber-300 bg-amber-50 text-amber-900'
          : 'border-ui-border-base bg-ui-bg-base text-ui-fg-subtle hover:bg-ui-bg-subtle'
      }`}
    >
      <Settings2 className="h-4 w-4" />
      {studio.enabled ? 'Exit Studio' : 'Studio mode'}
    </button>
  );
}

// ─── Entry ───────────────────────────────────────────────────────────────────

export function StudioModeEntry({ returnTo = '/modules' }: { returnTo?: string }) {
  const studio = useContext(StudioModeContext);
  const router = useRouter();

  useEffect(() => {
    if (!studio) return;
    studio.setEnabled(true);
    router.replace(returnTo);
  }, [returnTo, router, studio]);

  return (
    <main className="flex min-h-full items-center justify-center p-8">
      <p className="text-sm text-ui-fg-muted">Entering contextual Studio mode…</p>
    </main>
  );
}

// ─── Boundary ────────────────────────────────────────────────────────────────

export function StudioSurfaceBoundary({
  children,
  registrationKey,
  moduleLabel,
  screenLabel,
}: {
  children: ReactNode;
  registrationKey?: string;
  moduleLabel: string;
  screenLabel: string;
}) {
  const studio = useContext(StudioModeContext);
  if (!studio?.enabled) return children;

  return (
    <div className="relative min-h-full">
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-amber-300 bg-amber-50 px-5 py-2 text-xs text-amber-900">
        <div className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          <span className="font-semibold">
            {moduleLabel} · {screenLabel}
          </span>
        </div>
        <span className="text-amber-700">
          {registrationKey
            ? 'Click Config to inspect and extend this screen.'
            : 'This screen has no configuration surface yet.'}
        </span>
      </div>
      {children}
      <button
        type="button"
        disabled={!registrationKey}
        onClick={() =>
          registrationKey
            ? studio.openSurface({ registrationKey, moduleLabel, screenLabel })
            : undefined
        }
        className="fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 rounded-full border border-amber-400 bg-amber-500 px-5 py-3 text-sm font-bold text-white shadow-2xl shadow-amber-300/40 hover:bg-amber-400 active:bg-amber-600 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500 disabled:shadow-none"
      >
        <PanelRightOpen className="h-4 w-4" />
        Config
      </button>
    </div>
  );
}

// ─── Surface Panel ───────────────────────────────────────────────────────────

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'TEXT', label: 'Text' },
  { value: 'TEXTAREA', label: 'Long text' },
  { value: 'NUMBER', label: 'Number' },
  { value: 'INTEGER', label: 'Integer' },
  { value: 'CURRENCY', label: 'Currency' },
  { value: 'BOOLEAN', label: 'Checkbox (yes/no)' },
  { value: 'DATE', label: 'Date' },
  { value: 'DATETIME', label: 'Date & time' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'PHONE', label: 'Phone' },
  { value: 'URL', label: 'URL' },
  { value: 'SELECT', label: 'Single select' },
  { value: 'MULTI_SELECT', label: 'Multi select' },
];

function StudioSurfacePanel({
  target,
  currentUserId: _currentUserId,
  permissions,
  tenantId: _tenantId,
  tenantName: _tenantName,
  onClose,
  onOpenDesigner,
}: {
  target: SurfaceTarget;
  currentUserId: string;
  permissions: string[];
  tenantId: string;
  tenantName: string;
  onClose: () => void;
  onOpenDesigner: () => void;
}) {
  const [surface, setSurface] = useState<ConfigurationSurface | null>(null);
  const [customFields, setCustomFields] = useState<ConfigurationField[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'core' | 'custom'>('core');
  const [expandedCore, setExpandedCore] = useState<string | null>(null);

  // Add-field form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState<AddFieldForm>({
    label: '',
    key: '',
    type: 'TEXT',
    required: false,
    helpText: '',
    optionsText: '',
  });
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);

  const canDraft = holdsAnyPermission(permissions, ['configuration:draft']);

  // ── Fetch surface + manifest ──────────────────────────────────────────────

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setSurface(null);
    setCustomFields([]);
    setSaveResult(null);
    setShowAddForm(false);

    void fetch('/api/control/configuration/surfaces', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseMessage(response));
        const surfaces = decodeConfigurationSurfaces(await response.json());
        const selected = surfaces.find(
          (c) => c.registrationKey === target.registrationKey,
        );
        if (!selected) throw new Error('This screen is not in the configuration registry.');
        setSurface(selected);
        if (!selected.authoringEnabled) return;

        const query = new URLSearchParams({
          moduleKey: selected.moduleKey,
          entityKey: selected.entityKey,
          surfaceKey: selected.surfaceKey,
          environmentKey: 'local-uat',
          cohortKey: 'all-users',
        });
        const manifRes = await fetch(
          `/api/control/configuration/runtime/manifest?${query}`,
          { cache: 'no-store', signal: controller.signal },
        );
        if (manifRes.status === 404) return;
        if (!manifRes.ok) throw new Error(await responseMessage(manifRes));
        const runtime = (await manifRes.json()) as {
          manifest?: { fields?: ConfigurationField[] };
        };
        setCustomFields(runtime.manifest?.fields ?? []);
      })
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError(caught instanceof Error ? caught.message : 'Configuration could not be loaded.');
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [target]);

  // ── Keyboard close ────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showAddForm) { setShowAddForm(false); return; }
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, showAddForm]);

  // ── Focus label input when form opens ────────────────────────────────────

  useEffect(() => {
    if (showAddForm) setTimeout(() => labelInputRef.current?.focus(), 50);
  }, [showAddForm]);

  // ── Add field handler ─────────────────────────────────────────────────────

  const handleAddField = async () => {
    if (!surface || !form.label.trim() || !form.key.trim()) return;
    setSaving(true);
    setSaveResult(null);

    try {
      let options: { label: string; value: string }[] | undefined;
      if (form.type === 'SELECT' || form.type === 'MULTI_SELECT') {
        options = parseOptionsInput(form.optionsText);
        if (options.length === 0) {
          setSaveResult({
            ok: false,
            message: 'Dropdown and Multi-Select fields require at least one option. Enter comma-separated options (e.g. Active, Inactive).',
          });
          setSaving(false);
          return;
        }
      }

      const definition = {
        contractVersion: '1.0',
        moduleKey: surface.moduleKey,
        entityKey: surface.entityKey,
        surfaceKey: surface.surfaceKey,
        mode: 'EDIT',
        title: `Add attribute: ${form.label.trim()}`,
        description: form.helpText.trim() || undefined,
        fields: [
          {
            key: form.key.trim(),
            label: form.label.trim(),
            helpText: form.helpText.trim() || undefined,
            type: form.type,
            component: typeToComponent(form.type),
            required: form.required,
            readOnly: false,
            classification: 'INTERNAL' as const,
            ...(options ? { options } : {}),
          },
        ],
        sections: [],
      };

      const response = await fetch('/api/control/configuration/change-sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          definition,
          reason: `Add custom attribute "${form.label.trim()}" to ${target.screenLabel}`,
          idempotencyKey: `studio-add-${form.key}-${Date.now()}`,
        }),
      });

      if (!response.ok) throw new Error(await responseMessage(response));
      const result = (await response.json()) as { id: string };

      setSaveResult({
        ok: true,
        changeSetId: result.id,
        message: `Draft created. Submit it for approval in the workbench to publish this attribute.`,
      });
      setShowAddForm(false);
      setForm({ label: '', key: '', type: 'TEXT', required: false, helpText: '', optionsText: '' });
      setActiveTab('custom');
    } catch (err) {
      setSaveResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Failed to create change-set.',
      });
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <dialog
      open
      aria-modal="true"
      aria-label={`${target.screenLabel} configuration`}
      className="fixed inset-y-0 right-0 z-[80] flex w-full max-w-[480px] flex-col border-l border-amber-200 bg-white shadow-2xl"
    >
      {/* Header */}
      <header className="flex-shrink-0 border-b border-ui-border-base">
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-600">
              Studio · {target.moduleLabel}
            </p>
            <h2 className="mt-1 text-base font-bold text-ui-fg-base">{target.screenLabel}</h2>
            {surface && !loading ? (
              <p className="mt-0.5 text-xs text-ui-fg-muted">
                {surface.coreFields.length} core · {customFields.length} custom
              </p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="mt-0.5 rounded-lg border border-ui-border-base p-2 text-ui-fg-subtle hover:bg-ui-bg-subtle"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        {surface && !loading ? (
          <div className="flex gap-0 border-t border-ui-border-base px-5">
            {(['core', 'custom'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`relative pb-3 pt-3 pr-4 text-xs font-semibold transition-colors ${
                  activeTab === tab
                    ? 'text-amber-700 after:absolute after:bottom-0 after:left-0 after:right-4 after:h-0.5 after:bg-amber-500'
                    : 'text-ui-fg-muted hover:text-ui-fg-subtle'
                }`}
              >
                {tab === 'core' ? `Core attributes (${surface.coreFields.length})` : `Custom attributes (${customFields.length})`}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col gap-2 p-5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-ui-bg-subtle" />
            ))}
          </div>
        ) : error ? (
          <div className="p-5">
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              {error}
            </div>
          </div>
        ) : surface ? (
          <div className="p-5">
            {/* Save result banner */}
            {saveResult ? (
              <div
                className={`mb-4 flex items-start gap-3 rounded-xl border p-4 ${
                  saveResult.ok
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-red-200 bg-red-50'
                }`}
              >
                {saveResult.ok ? (
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                )}
                <div className="min-w-0">
                  <p className={`text-xs font-semibold ${saveResult.ok ? 'text-emerald-900' : 'text-red-900'}`}>
                    {saveResult.ok ? 'Draft change-set created' : 'Failed to create draft'}
                  </p>
                  <p className={`mt-0.5 text-xs leading-5 ${saveResult.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                    {saveResult.message}
                  </p>
                  {saveResult.ok && saveResult.changeSetId ? (
                    <p className="mt-1 font-mono text-[10px] text-emerald-600">
                      ID: {saveResult.changeSetId}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setSaveResult(null)}
                  className="ml-auto shrink-0 rounded p-1 hover:bg-white/60"
                >
                  <X className="h-3 w-3 text-ui-fg-muted" />
                </button>
              </div>
            ) : null}

            {/* Core Attributes Tab */}
            {activeTab === 'core' ? (
              <section>
                <p className="mb-3 text-xs leading-5 text-ui-fg-muted">
                  These attributes are owned by the module and cannot be removed. You can inspect them and override their labels and help text in a change-set.
                </p>
                <div className="space-y-1.5">
                  {surface.coreFields.map((field) => {
                    const isExpanded = expandedCore === field.key;
                    return (
                      <div
                        key={field.key}
                        className="rounded-xl border border-ui-border-base bg-ui-bg-subtle"
                      >
                        <button
                          type="button"
                          onClick={() => setExpandedCore(isExpanded ? null : field.key)}
                          className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left"
                        >
                          <LockKeyhole className="h-3.5 w-3.5 shrink-0 text-ui-fg-muted" />
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ui-fg-base">
                            {field.label}
                          </span>
                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold ${typeBadgeColor(field.type)}`}
                          >
                            {field.type}
                          </span>
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ui-fg-muted" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ui-fg-muted" />
                          )}
                        </button>
                        {isExpanded ? (
                          <div className="border-t border-ui-border-base px-3.5 pb-3 pt-2.5">
                            <p className="font-mono text-[10px] text-ui-fg-muted">key: {field.key}</p>
                            {field.required ? (
                              <p className="mt-1 text-[10px] font-semibold text-ui-fg-muted">Required</p>
                            ) : null}
                            {field.lockReason ? (
                              <p className="mt-2 text-[11px] leading-4 text-ui-fg-subtle">
                                {field.lockReason}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {/* Custom Attributes Tab */}
            {activeTab === 'custom' ? (
              <section>
                {/* Add field inline form */}
                {showAddForm ? (
                  <div className="mb-4 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
                    <p className="mb-3 text-xs font-bold text-amber-900">Add custom attribute</p>

                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-ui-fg-subtle">
                          Label <span className="text-red-500">*</span>
                        </label>
                        <input
                          ref={labelInputRef}
                          type="text"
                          value={form.label}
                          onChange={(e) => {
                            const label = e.target.value;
                            setForm((f) => ({
                              ...f,
                              label,
                              key: f.key === labelToKey(f.label) ? labelToKey(label) : f.key,
                            }));
                          }}
                          placeholder="e.g. Customer tier"
                          className="w-full rounded-lg border border-ui-border-base bg-white px-3 py-2 text-xs text-ui-fg-base placeholder:text-ui-fg-muted focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-ui-fg-subtle">
                          Field key <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={form.key}
                          onChange={(e) => setForm((f) => ({ ...f, key: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                          placeholder="e.g. customer-tier"
                          className="w-full rounded-lg border border-ui-border-base bg-white px-3 py-2 font-mono text-xs text-ui-fg-base placeholder:text-ui-fg-muted focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
                        />
                        <p className="mt-1 text-[10px] text-ui-fg-muted">Stable identifier — cannot be changed after publishing.</p>
                      </div>

                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-ui-fg-subtle">Type</label>
                        <select
                          value={form.type}
                          onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as FieldType }))}
                          className="w-full rounded-lg border border-ui-border-base bg-white px-3 py-2 text-xs text-ui-fg-base focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
                        >
                          {FIELD_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {(form.type === 'SELECT' || form.type === 'MULTI_SELECT') ? (
                        <div>
                          <label className="mb-1 block text-[11px] font-semibold text-ui-fg-subtle">
                            Options (comma or newline separated) <span className="text-red-500">*</span>
                          </label>
                          <textarea
                            rows={2}
                            value={form.optionsText}
                            onChange={(e) => setForm((f) => ({ ...f, optionsText: e.target.value }))}
                            placeholder="e.g. Active, Inactive, Pending or act: Active Account"
                            className="w-full rounded-lg border border-ui-border-base bg-white p-2 font-mono text-xs text-ui-fg-base placeholder:text-ui-fg-muted focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
                          />
                          <p className="mt-1 text-[10px] text-ui-fg-muted">
                            Enter options separated by commas or line-by-line. Supports key:value format.
                          </p>
                        </div>
                      ) : null}

                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-ui-fg-subtle">Help text (optional)</label>
                        <input
                          type="text"
                          value={form.helpText}
                          onChange={(e) => setForm((f) => ({ ...f, helpText: e.target.value }))}
                          placeholder="Short description shown below the field"
                          className="w-full rounded-lg border border-ui-border-base bg-white px-3 py-2 text-xs text-ui-fg-base placeholder:text-ui-fg-muted focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          id="field-required"
                          type="checkbox"
                          checked={form.required}
                          onChange={(e) => setForm((f) => ({ ...f, required: e.target.checked }))}
                          className="h-4 w-4 rounded border-ui-border-base accent-amber-500"
                        />
                        <label htmlFor="field-required" className="text-xs font-medium text-ui-fg-base">
                          Required field
                        </label>
                      </div>
                    </div>

                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={handleAddField}
                        disabled={saving || !form.label.trim() || !form.key.trim()}
                        className="flex-1 rounded-lg bg-amber-500 px-3 py-2.5 text-xs font-bold text-white hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {saving ? 'Creating draft…' : 'Create draft change-set'}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowAddForm(false); setSaveResult(null); }}
                        className="rounded-lg border border-ui-border-base px-3 py-2.5 text-xs font-semibold text-ui-fg-subtle hover:bg-ui-bg-subtle"
                      >
                        Cancel
                      </button>
                    </div>

                    <p className="mt-3 text-[10px] leading-4 text-amber-700">
                      This creates a draft change-set. Submit it for approval in the workbench — once approved and published, the attribute becomes active on this screen.
                    </p>
                  </div>
                ) : null}

                {!showAddForm && surface.authoringEnabled && canDraft ? (
                  <button
                    type="button"
                    onClick={() => { setShowAddForm(true); setSaveResult(null); }}
                    className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-700 transition-colors hover:border-amber-400 hover:bg-amber-100"
                  >
                    <Plus className="h-4 w-4" />
                    Add custom attribute
                  </button>
                ) : null}

                {!surface.authoringEnabled ? (
                  <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800">
                    <p className="font-semibold">Inspection only</p>
                    <p className="mt-1">{surface.authoringDisabledReason ?? 'Custom attribute authoring is not available for this screen yet.'}</p>
                  </div>
                ) : null}

                {!canDraft && surface.authoringEnabled ? (
                  <div className="mb-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-600">
                    You need the <code className="rounded bg-zinc-200 px-1">configuration:draft</code> permission to add attributes.
                  </div>
                ) : null}

                {customFields.length > 0 ? (
                  <div className="space-y-1.5">
                    {customFields.map((field) => (
                      <div
                        key={field.key}
                        className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-emerald-950">{field.label}</p>
                          <p className="font-mono text-[10px] text-emerald-700">{field.key}</p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold ${typeBadgeColor(field.type)}`}
                        >
                          {field.type}
                        </span>
                        {field.required ? (
                          <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                            Required
                          </span>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  !showAddForm && (
                    <div className="rounded-xl border border-dashed border-ui-border-base p-6 text-center">
                      <p className="text-xs font-semibold text-ui-fg-subtle">No active custom attributes</p>
                      <p className="mt-1 text-[11px] leading-4 text-ui-fg-muted">
                        {surface.authoringEnabled
                          ? 'Add an attribute above to extend this screen with custom data.'
                          : 'Authoring is not enabled for this screen yet.'}
                      </p>
                    </div>
                  )
                )}
              </section>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Footer */}
      <footer className="flex-shrink-0 border-t border-ui-border-base p-4">
        <button
          type="button"
          onClick={onOpenDesigner}
          className="w-full rounded-lg bg-ui-button-inverted px-4 py-2.5 text-xs font-bold text-ui-fg-on-inverted hover:opacity-90"
        >
          Open full workbench →
        </button>
        <p className="mt-1.5 text-center text-[10px] text-ui-fg-muted">
          draft → submit → approve → publish → activate
        </p>
      </footer>
    </dialog>
  );
}
