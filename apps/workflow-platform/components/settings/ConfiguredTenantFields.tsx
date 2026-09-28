'use client';

import {
  FormEngineConfigurationForm,
  type ConfigurationValues,
} from '@gigalibs/configuration-react';
import type { ConfigurationDefinition, ConfigurationRuntimeScopeV1 } from '@gigalibs/contracts';
import { Button } from '@medusajs/ui';
import { RefreshCw, Save } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

type RuntimeManifest = {
  publishedVersionId: string;
  checksum: string;
  manifest: ConfigurationDefinition;
  scope: ConfigurationRuntimeScopeV1;
  adapter: { adapterKey: string; descriptorVersion: '1.0' };
};

type ExtensionRecord = {
  version: number;
  values: ConfigurationValues;
  manifestChecksum: string;
} | null;

type ViewState =
  | { kind: 'loading'; message: string }
  | { kind: 'absent'; message: string }
  | { kind: 'denied'; message: string }
  | { kind: 'invalid-scope'; message: string }
  | { kind: 'retryable-error'; message: string }
  | { kind: 'ready'; message: string }
  | { kind: 'saving'; message: string }
  | { kind: 'conflict'; message: string }
  | { kind: 'saved'; message: string };

type RuntimeFailure = {
  message: string;
  errors: Record<string, string>;
  code?: string;
  retryable: boolean;
};

class RuntimeRequestError extends Error {
  constructor(
    readonly status: number,
    readonly failure: RuntimeFailure,
  ) {
    super(failure.message);
  }
}

export function ConfiguredTenantFields({
  tenantId,
  canUpdate,
}: {
  tenantId: string;
  canUpdate: boolean;
}) {
  const [runtime, setRuntime] = useState<RuntimeManifest | null>(null);
  const [record, setRecord] = useState<ExtensionRecord>(null);
  const [values, setValues] = useState<ConfigurationValues>({});
  const [state, setState] = useState<ViewState>({
    kind: 'loading',
    message: 'Loading configured tenant fields…',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const loadController = useRef<AbortController | null>(null);
  const loadSequence = useRef(0);
  const announcement = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (): Promise<boolean> => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    const sequence = ++loadSequence.current;
    setState({ kind: 'loading', message: 'Loading configured tenant fields…' });
    setFieldErrors({});

    try {
      const query = new URLSearchParams({
        moduleKey: 'tenant-settings',
        entityKey: 'tenant-profile',
        surfaceKey: 'profile-extension',
      });
      const manifestResponse = await fetch(
        `/api/control/configuration/runtime/manifest/current?${query}`,
        { cache: 'no-store', signal: controller.signal },
      );
      if (!manifestResponse.ok) {
        throw new RuntimeRequestError(
          manifestResponse.status,
          await responseFailure(manifestResponse),
        );
      }
      const loadedRuntime = (await manifestResponse.json()) as RuntimeManifest;
      const valuesResponse = await fetch(
        `/api/control/configuration/extension-values/tenant-profile/${encodeURIComponent(tenantId)}`,
        { cache: 'no-store', signal: controller.signal },
      );
      if (!valuesResponse.ok) {
        throw new RuntimeRequestError(valuesResponse.status, await responseFailure(valuesResponse));
      }
      const loadedRecord = (await valuesResponse.json()) as ExtensionRecord;
      if (controller.signal.aborted || sequence !== loadSequence.current) return false;

      setRuntime(loadedRuntime);
      setRecord(loadedRecord);
      setValues(loadedRecord?.values ?? {});
      setState({ kind: 'ready', message: 'Configured tenant fields are ready.' });
      return true;
    } catch (error) {
      if (controller.signal.aborted || sequence !== loadSequence.current) return false;
      setRuntime(null);
      setRecord(null);
      setValues({});
      setState(classifyLoadFailure(error));
      return false;
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
    return () => loadController.current?.abort();
  }, [load]);

  useEffect(() => {
    if (
      state.kind === 'absent' ||
      state.kind === 'denied' ||
      state.kind === 'invalid-scope' ||
      state.kind === 'retryable-error' ||
      state.kind === 'conflict'
    ) {
      announcement.current?.focus();
    }
  }, [state.kind]);

  async function save() {
    if (!runtime || state.kind === 'saving') return;
    setState({ kind: 'saving', message: 'Saving configured tenant fields…' });
    setFieldErrors({});
    try {
      const response = await fetch(
        `/api/control/configuration/extension-values/tenant-profile/${encodeURIComponent(tenantId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            publishedVersionId: runtime.publishedVersionId,
            expectedVersion: record?.version ?? 0,
            values,
            reason: 'Update configured tenant profile fields',
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      if (!response.ok) {
        const failure = await responseFailure(response);
        setFieldErrors(failure.errors);
        if (response.status === 409) {
          setState({
            kind: 'conflict',
            message:
              'These fields changed elsewhere. Reload the latest values before saving again.',
          });
          return;
        }
        throw new RuntimeRequestError(response.status, failure);
      }
      if (await load()) {
        setState({
          kind: 'saved',
          message: 'Configured tenant fields were saved with the active manifest version.',
        });
      }
    } catch (error) {
      setState(classifyLoadFailure(error));
    }
  }

  const busy = state.kind === 'loading' || state.kind === 'saving';
  const hasRuntime = runtime !== null;

  return (
    <section
      className="mt-6 border-t border-ui-border-base pt-6"
      aria-labelledby="configured-fields-title"
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 id="configured-fields-title" className="text-base font-semibold text-ui-fg-base">
            Configured tenant fields
          </h2>
          {runtime ? (
            <p className="mt-1 text-xs text-ui-fg-muted">
              Runtime scope {runtime.scope.environmentKey} / {runtime.scope.cohortKey}; active
              checksum <span className="font-mono">{runtime.checksum.slice(0, 24)}…</span>
            </p>
          ) : null}
        </div>
        {hasRuntime ? (
          <Button variant="primary" disabled={!canUpdate || busy} onClick={() => void save()}>
            <Save className="h-4 w-4" aria-hidden="true" />
            {state.kind === 'saving' ? 'Saving…' : 'Save configured fields'}
          </Button>
        ) : null}
      </div>

      <div
        ref={announcement}
        role={state.kind === 'denied' || state.kind === 'invalid-scope' ? 'alert' : 'status'}
        aria-live={state.kind === 'saving' || state.kind === 'loading' ? 'polite' : 'assertive'}
        tabIndex={-1}
        className="mb-4 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-3 text-sm text-ui-fg-subtle focus:outline-none focus:ring-2 focus:ring-ui-fg-interactive"
      >
        <p>{state.message}</p>
        {state.kind === 'absent' ||
        state.kind === 'invalid-scope' ||
        state.kind === 'retryable-error' ||
        state.kind === 'conflict' ? (
          <Button className="mt-3" variant="secondary" onClick={() => void load()}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {state.kind === 'conflict' ? 'Reload latest values' : 'Retry'}
          </Button>
        ) : null}
      </div>

      {runtime ? (
        <FormEngineConfigurationForm
          key={`${runtime.checksum}:${record?.version ?? 0}`}
          definition={runtime.manifest}
          values={values}
          errors={fieldErrors}
          onChange={setValues}
          disabled={!canUpdate || busy}
        />
      ) : null}
    </section>
  );
}

function classifyLoadFailure(error: unknown): ViewState {
  if (!(error instanceof RuntimeRequestError)) {
    return {
      kind: 'retryable-error',
      message: error instanceof Error ? error.message : 'Configured fields could not be loaded.',
    };
  }
  if (error.failure.code === 'CONFIGURATION_MANIFEST_UNAVAILABLE' || error.status === 404) {
    return {
      kind: 'absent',
      message: 'No active configured tenant fields are available for this workspace.',
    };
  }
  if (
    error.failure.code === 'CONFIGURATION_RUNTIME_SCOPE_DENIED' ||
    error.status === 401 ||
    error.status === 403
  ) {
    return {
      kind: 'denied',
      message: 'You do not have access to configured tenant fields in this workspace.',
    };
  }
  if (
    error.failure.code === 'CONFIGURATION_RUNTIME_SCOPE_MISSING' ||
    error.failure.code === 'CONFIGURATION_ADAPTER_NOT_FOUND' ||
    error.failure.code === 'CONFIGURATION_ADAPTER_INCOMPATIBLE'
  ) {
    return {
      kind: 'invalid-scope',
      message: 'Configured tenant fields are not available for the current runtime scope.',
    };
  }
  return {
    kind: 'retryable-error',
    message: error.failure.retryable
      ? error.failure.message
      : 'Configured tenant fields could not be loaded. Try again.',
  };
}

async function responseFailure(response: Response): Promise<RuntimeFailure> {
  const payload = (await response.json().catch(() => null)) as {
    message?: string | string[];
    detail?: string;
    errors?: Record<string, string>;
    code?: string;
    retryable?: boolean;
  } | null;
  return {
    message: Array.isArray(payload?.message)
      ? payload.message.join(' ')
      : (payload?.message ?? payload?.detail ?? `Request failed (${response.status}).`),
    errors: payload?.errors ?? {},
    ...(payload?.code === undefined ? {} : { code: payload.code }),
    retryable: payload?.retryable ?? response.status >= 500,
  };
}
