'use client';

import {
  type ConfigurationSurface,
  decodeConfigurationSurfaces,
} from '@/lib/configuration-surface-registry';
import type { ConfigurationField } from '@gigalibs/contracts';
import { LockKeyhole, PanelRightOpen, Settings2, ShieldCheck, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ConfigurationStudioWorkbench } from './ConfigurationStudioWorkbench';

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

const StudioModeContext = createContext<StudioModeContextValue | null>(null);

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
      {target ? (
        <StudioSurfacePanel
          target={target}
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
      {studio.enabled ? 'Exit Studio mode' : 'Studio mode'}
    </button>
  );
}

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
      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-amber-300 bg-amber-50 px-6 py-2 text-xs text-amber-950">
        <span className="font-semibold">
          Studio mode · {moduleLabel} · {screenLabel}
        </span>
        <span>
          {registrationKey
            ? 'Open Config to inspect this screen.'
            : 'This screen has not been registered for configuration.'}
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
        className="fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-500 px-5 py-3 text-sm font-bold text-amber-950 shadow-xl hover:bg-amber-400 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
      >
        <PanelRightOpen className="h-4 w-4" /> Config
      </button>
    </div>
  );
}

function StudioSurfacePanel({
  target,
  onClose,
  onOpenDesigner,
}: {
  target: SurfaceTarget;
  onClose: () => void;
  onOpenDesigner: () => void;
}) {
  const [surface, setSurface] = useState<ConfigurationSurface | null>(null);
  const [customFields, setCustomFields] = useState<ConfigurationField[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setSurface(null);
    setCustomFields([]);

    void fetch('/api/control/configuration/surfaces', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await responseMessage(response));
        const surfaces = decodeConfigurationSurfaces(await response.json());
        const selected = surfaces.find(
          (candidate) => candidate.registrationKey === target.registrationKey,
        );
        if (!selected) throw new Error('This module screen is not in the configuration registry.');
        setSurface(selected);
        if (!selected.authoringEnabled) return;

        const query = new URLSearchParams({
          moduleKey: selected.moduleKey,
          entityKey: selected.entityKey,
          surfaceKey: selected.surfaceKey,
          environmentKey: 'local-uat',
          cohortKey: 'all-users',
        });
        const manifestResponse = await fetch(
          `/api/control/configuration/runtime/manifest?${query}`,
          { cache: 'no-store', signal: controller.signal },
        );
        if (manifestResponse.status === 404) return;
        if (!manifestResponse.ok) throw new Error(await responseMessage(manifestResponse));
        const runtime = (await manifestResponse.json()) as {
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

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <dialog
      open
      aria-modal="true"
      aria-label={`${target.screenLabel} configuration`}
      className="fixed inset-y-0 right-0 z-[80] flex w-full max-w-[460px] flex-col border-l border-amber-300 bg-white shadow-2xl"
    >
      <header className="flex items-start justify-between gap-4 border-b border-ui-border-base p-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700">
            {target.moduleLabel}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-ui-fg-base">{target.screenLabel}</h2>
          <p className="mt-1 text-xs text-ui-fg-muted">Current screen configuration</p>
        </div>
        <button
          type="button"
          aria-label="Close configuration panel"
          onClick={onClose}
          className="rounded-lg border border-ui-border-base p-2 text-ui-fg-subtle hover:bg-ui-bg-subtle"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
        {loading ? (
          <p className="text-sm text-ui-fg-muted">Loading registered attributes…</p>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {error}
          </p>
        ) : null}
        {surface ? (
          <>
            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-ui-fg-base">Core attributes</h3>
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-semibold text-zinc-600">
                  {surface.coreFields.length} locked
                </span>
              </div>
              <p className="mb-3 text-xs leading-5 text-ui-fg-muted">
                Defined by the module. They can be inspected here but cannot be replaced or deleted.
              </p>
              <div className="space-y-2">
                {surface.coreFields.map((field) => (
                  <div
                    key={field.key}
                    className="rounded-xl border border-ui-border-base bg-ui-bg-subtle p-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <LockKeyhole className="h-3.5 w-3.5 shrink-0 text-ui-fg-muted" />
                        <span className="truncate text-xs font-semibold text-ui-fg-base">
                          {field.label}
                        </span>
                      </div>
                      <span className="font-mono text-[10px] text-ui-fg-muted">{field.type}</span>
                    </div>
                    <p className="mt-1 pl-5 font-mono text-[10px] text-ui-fg-muted">{field.key}</p>
                    <p className="mt-2 text-[11px] leading-4 text-ui-fg-subtle">
                      {field.lockReason}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="border-t border-ui-border-base pt-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-ui-fg-base">Custom attributes</h3>
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                  {customFields.length}
                </span>
              </div>
              {customFields.length > 0 ? (
                <div className="space-y-2">
                  {customFields.map((field) => (
                    <div
                      key={field.key}
                      className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"
                    >
                      <p className="text-xs font-semibold text-emerald-950">{field.label}</p>
                      <p className="mt-1 font-mono text-[10px] text-emerald-800">
                        {field.key} · {field.type}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-ui-border-base p-4 text-xs leading-5 text-ui-fg-muted">
                  No active custom attributes exist for this screen.
                </p>
              )}
            </section>

            {!surface.authoringEnabled ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs leading-5 text-amber-950">
                <div className="mb-1 flex items-center gap-2 font-semibold">
                  <ShieldCheck className="h-4 w-4" /> Inspection only
                </div>
                {surface.authoringDisabledReason}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <footer className="border-t border-ui-border-base p-5">
        <button
          type="button"
          disabled={!surface?.authoringEnabled}
          onClick={onOpenDesigner}
          className="w-full rounded-lg bg-ui-button-inverted px-4 py-3 text-sm font-semibold text-ui-fg-on-inverted disabled:cursor-not-allowed disabled:opacity-40"
        >
          Edit fields and layout
        </button>
        <p className="mt-2 text-center text-[10px] text-ui-fg-muted">
          Draft → review → approve → publish → activate
        </p>
      </footer>
    </dialog>
  );
}

async function responseMessage(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as {
    detail?: string;
    message?: string | string[];
  } | null;
  if (Array.isArray(payload?.message)) return payload.message.join(' ');
  return payload?.message ?? payload?.detail ?? `Request failed (${response.status}).`;
}
