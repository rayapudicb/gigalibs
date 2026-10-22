'use client';

import type {
  SpeedCriteriaSetV1,
  SpeedLibrarySetV1,
  SpeedRouteDetailV1,
} from '@gigalibs/contracts';
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { type Translate, speedText } from './messages/index.js';
import { type SpeedApi, createSpeedApi } from './speed-api.js';

// WI-OI-120bx/120by: what SPEED's panels share: the page's language, the module API, the route the panel is drawn for
// and the criteria and library sets in force.

export function useSpeedText(): Translate {
  return useMemo(
    () =>
      speedText(
        typeof document === 'undefined' ? 'en-US' : document.documentElement.lang || 'en-US',
      ),
    [],
  );
}

export function useSpeedApi(): SpeedApi {
  return useMemo(() => createSpeedApi(), []);
}

// WI-OI-120ce: a route's panels are drawn side by side (the summary tiles above the tabs), and a change to a step does
// not change the route record's version, so a panel that changes the route tells the others, which reload it.
const ROUTE_CHANGED = 'speed:route-changed';

/** Tells the route's other panels that it changed. */
export function announceRouteChange(routeId: string, source: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ROUTE_CHANGED, { detail: { routeId, source } }));
}

/** Calls `onChange` when another panel (not `source`) announces a change to this route. */
export function useRouteChanges(routeId: string, source: string, onChange: () => void): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ routeId?: string; source?: string }>).detail;
      if (detail?.routeId === routeId && detail.source !== source) onChange();
    };
    window.addEventListener(ROUTE_CHANGED, listener);
    return () => window.removeEventListener(ROUTE_CHANGED, listener);
  }, [routeId, source, onChange]);
}

/**
 * The route, reloaded when the record's version changes or another panel changes it; `reload` after a change of this
 * panel's own (it tells the others).
 */
export function useRoute(api: SpeedApi, routeId: string, version: unknown) {
  const source = useId();
  const [route, setRoute] = useState<SpeedRouteDetailV1 | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    const loaded = await api.route(routeId);
    setRoute(loaded);
    return loaded;
  }, [api, routeId]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new record version reloads the route.
  useEffect(() => {
    load().catch(() => setFailed(true));
  }, [load, version]);
  const quiet = useCallback(() => {
    load().catch(() => undefined);
  }, [load]);
  useRouteChanges(routeId, source, quiet);
  const reload = useCallback(async () => {
    const loaded = await load();
    announceRouteChange(routeId, source);
    return loaded;
  }, [load, routeId, source]);
  return { route, failed, reload };
}

export interface SetsInForce {
  readonly criteria: SpeedCriteriaSetV1 | null;
  readonly library: SpeedLibrarySetV1 | null;
}

/** The criteria and library sets in force (null while loading). */
export function useSetsInForce(api: SpeedApi): SetsInForce | null {
  const [sets, setSets] = useState<SetsInForce | null>(null);
  useEffect(() => {
    let live = true;
    api.setsInForce().then(
      (loaded) => live && setSets(loaded),
      () => live && setSets({ criteria: null, library: null }),
    );
    return () => {
      live = false;
    };
  }, [api]);
  return sets;
}
