'use client';

import type {
  SpeedCriteriaSetV1,
  SpeedLibrarySetV1,
  SpeedRouteDetailV1,
} from '@gigalibs/contracts';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

/** The route, reloaded when the record's version changes; `reload` after a change. */
export function useRoute(api: SpeedApi, routeId: string, version: unknown) {
  const [route, setRoute] = useState<SpeedRouteDetailV1 | null>(null);
  const [failed, setFailed] = useState(false);
  const reload = useCallback(async () => {
    const loaded = await api.route(routeId);
    setRoute(loaded);
    return loaded;
  }, [api, routeId]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new record version reloads the route.
  useEffect(() => {
    reload().catch(() => setFailed(true));
  }, [reload, version]);
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
