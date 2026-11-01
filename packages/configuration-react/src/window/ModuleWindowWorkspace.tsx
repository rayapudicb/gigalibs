'use client';

import { useMemo } from 'react';
import { MetadataWindow } from './MetadataWindow.js';
import { createRecordClient } from './record-client.js';
import { usePublishedManifest } from './use-published-manifest.js';

export interface ModuleWindowWorkspaceProps {
  /** The module whose published window to show (its catalogue key). */
  readonly moduleKey: string;
  readonly entityKey: string;
  readonly surfaceKey: string;
  /** The module's web gateway, e.g. /api/business-partners; records go to `${basePath}/v1/records/...`. */
  readonly basePath: string;
  readonly title: string;
  readonly description?: string;
  /** The signed-in user's permissions; the window denies by default and the module enforces every write. */
  readonly permissions?: readonly string[];
}

/**
 * A module page made of one published metadata window (ADR-0033 D1), for modules whose screens are their dictionary
 * windows. It replaces the generic records placeholder once a module serves the SDK record routes.
 */
export function ModuleWindowWorkspace({
  moduleKey,
  entityKey,
  surfaceKey,
  basePath,
  title,
  description,
  permissions = [],
}: ModuleWindowWorkspaceProps) {
  const client = useMemo(() => createRecordClient({ basePath }), [basePath]);
  const state = usePublishedManifest({ moduleKey, entityKey, surfaceKey });
  return (
    <div className="space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-ui-fg-base">{title}</h1>
        {description ? <p className="text-sm text-ui-fg-subtle">{description}</p> : null}
      </header>
      {state.status === 'loading' ? (
        <p className="text-sm text-ui-fg-muted">Loading the window…</p>
      ) : state.status !== 'ready' ? (
        <div role="alert" className="rounded-lg border border-ui-border-base bg-ui-bg-base p-4">
          <p className="text-sm font-medium text-ui-fg-error">
            {state.status === 'forbidden' ? 'No access' : 'This window is not available'}
          </p>
          <p className="mt-1 text-sm text-ui-fg-subtle">{state.message}</p>
        </div>
      ) : (
        <MetadataWindow manifest={state.manifest} client={client} permissions={permissions} />
      )}
    </div>
  );
}
