import type { CompiledDictionaryManifestV1 } from '@gigalibs/contracts';
import { useEffect, useState } from 'react';

// WI-OI-120f (F0.2/F0.4, ADR-0033 D1): a window draws only the manifest its tenant has published and activated for
// the surface. There is no built-in copy to fall back to: a missing manifest is shown as such.

export type PublishedManifestState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly manifest: CompiledDictionaryManifestV1 }
  | { readonly status: 'missing'; readonly message: string }
  | { readonly status: 'forbidden'; readonly message: string }
  | { readonly status: 'error'; readonly message: string };

export interface ManifestSurface {
  readonly moduleKey: string;
  readonly entityKey: string;
  readonly surfaceKey: string;
}

export function manifestUrl(surface: ManifestSurface): string {
  const query = new URLSearchParams({ moduleKey: surface.moduleKey, entityKey: surface.entityKey, surfaceKey: surface.surfaceKey });
  return `/api/control/configuration/runtime/manifest/current?${query.toString()}`;
}

/** Turns the control plane's answer into a manifest state. */
export function manifestState(status: number, body: unknown): PublishedManifestState {
  if (status === 403) return { status: 'forbidden', message: 'You do not have access to this window.' };
  if (status === 404) {
    return {
      status: 'missing',
      message: 'This window has not been published for your organization yet. An administrator can activate it in Configuration Studio.',
    };
  }
  if (status < 200 || status >= 300) return { status: 'error', message: `The window definition could not be loaded (${status}).` };
  const manifest = body as Partial<CompiledDictionaryManifestV1> | null;
  if (!manifest || manifest.manifestVersion !== 1 || !Array.isArray(manifest.views) || manifest.views.length === 0) {
    return { status: 'missing', message: 'The published definition for this window declares no view.' };
  }
  return { status: 'ready', manifest: manifest as CompiledDictionaryManifestV1 };
}

export function usePublishedManifest(surface: ManifestSurface, load: typeof fetch = fetch): PublishedManifestState {
  const [state, setState] = useState<PublishedManifestState>({ status: 'loading' });
  const url = manifestUrl(surface);
  useEffect(() => {
    let active = true;
    setState({ status: 'loading' });
    load(url, { cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (active) setState(manifestState(response.status, body));
      })
      .catch(() => {
        if (active) setState({ status: 'error', message: 'The window definition could not be loaded.' });
      });
    return () => {
      active = false;
    };
  }, [url, load]);
  return state;
}
