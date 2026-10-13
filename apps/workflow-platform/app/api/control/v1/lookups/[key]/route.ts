import {
  authenticatedUpstream,
  authenticationRequired,
  proxyUpstream,
  unavailable,
} from '@/lib/authenticated-upstream';
import { proxyGeospatial } from '@/lib/geospatial-proxy';
import { type PlatformLookupKey, isPlatformLookupKey } from '@gigalibs/contracts';
import { NextResponse } from 'next/server';

// WI-OI-120u (M-WF1): the platform lookups of the metadata windows (PLATFORM_LOOKUPS in @gigalibs/contracts). Each reads
// one list of the service that owns it (the control plane, or Geospatial through its signed proxy) as the signed-in
// user, so that service's own permission decides who may read it, and answers the window's lookup shape
// `[{ value, label }]`: the active entries matching `search`, or the entries named by `ids` whatever their status (so a
// record shows the name of the login, unit or place it already holds).

const MAX_OPTIONS = 50;
const MAX_IDS = 100;
/** A window page names at most this many places; more is refused rather than silently dropped. */
const MAX_PLACE_IDS = 25;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

interface Option {
  readonly value: string;
  readonly label: string;
  readonly active: boolean;
}

interface LookupRequest {
  readonly search?: string;
  readonly ids?: readonly string[];
}

interface Member {
  readonly status?: unknown;
  readonly user?: { readonly id?: unknown; readonly email?: unknown; readonly name?: unknown };
}

interface Unit {
  readonly id?: unknown;
  readonly code?: unknown;
  readonly name?: unknown;
  readonly status?: unknown;
}

interface Place {
  readonly id?: unknown;
  readonly code?: unknown;
  readonly displayName?: unknown;
  readonly status?: unknown;
}

interface Source {
  /** The owning service's answer, as the signed-in user; null without a session. */
  load(lookup: LookupRequest, request: Request): Promise<Response | null>;
  options(body: unknown): Option[];
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const itemsOf = <T>(body: unknown): T[] =>
  body && typeof body === 'object' && Array.isArray((body as { items?: unknown }).items)
    ? (body as { items: T[] }).items
    : [];
const control = (path: string) => authenticatedUpstream('control', path);

/** Geospatial's own route, through the signed proxy the Maps screens use (maps.nodes.read, the Geospatial entitlement). */
const geospatial = (request: Request, path: readonly string[], query = '') =>
  proxyGeospatial(
    new Request(new URL(`/api/maps/${path.join('/')}${query}`, request.url), {
      headers: request.headers,
    }),
    {
      params: Promise.resolve({ path: [...path] }),
    },
  );

/** The places named by id; the first refusal or failure is passed on, a place that is gone is left out. */
/**
 * The places named by id. Security review L2: one list of up to 200 places first; any not on it are read one at a time,
 * so a session near expiry is refreshed once, not by many calls at the same moment. A refusal is passed on; a place
 * that is gone is left out.
 */
async function placesById(request: Request, ids: readonly string[]): Promise<Response> {
  const listed = await geospatial(request, ['nodes'], '?pageSize=200');
  if (!listed.ok) return listed;
  const known = new Map(
    itemsOf<Place>(await listed.json()).map((place) => [text(place.id), place]),
  );
  const items: Place[] = [];
  for (const id of ids) {
    const place = known.get(id);
    if (place) {
      items.push(place);
      continue;
    }
    const answer = await geospatial(request, ['nodes', id]);
    if (answer.ok) items.push((await answer.json()) as Place);
    else if (answer.status !== 404) return answer;
  }
  return NextResponse.json({ items });
}

const SOURCES: Readonly<Record<PlatformLookupKey, Source>> = {
  // users:read. A person is linked to the login of a member, who is identified by their user id.
  'workspace-members': {
    load: () => control('/api/v1/tenants/current/members'),
    options: (body) =>
      (Array.isArray(body) ? (body as Member[]) : []).flatMap((member) => {
        const id = text(member.user?.id);
        if (!id) return [];
        const email = text(member.user?.email);
        const name = text(member.user?.name);
        return [
          {
            value: id,
            label: name && email ? `${name} (${email})` : (name ?? email ?? id),
            active: member.status === 'ACTIVE',
          },
        ];
      }),
  },
  // organization:read.
  'organization-units': {
    load: ({ search, ids }) => {
      const query = new URLSearchParams({ limit: '200' });
      if (ids?.length) query.set('ids', ids.join(','));
      else if (search) query.set('q', search);
      return control(`/api/v1/tenants/current/organization/units?${query.toString()}`);
    },
    options: (body) =>
      itemsOf<Unit>(body).flatMap((unit) => {
        const id = text(unit.id);
        const name = text(unit.name);
        if (!id || !name) return [];
        const code = text(unit.code);
        return [
          { value: id, label: code ? `${name} (${code})` : name, active: unit.status === 'ACTIVE' },
        ];
      }),
  },
  // maps.nodes.read, through Geospatial's signed proxy. Sites and the places within them.
  'workspace-sites': {
    load: ({ search, ids }, request) => {
      if (ids?.length) return placesById(request, ids);
      const query = new URLSearchParams({ status: 'ACTIVE', pageSize: '50' });
      if (search) query.set('q', search);
      return geospatial(request, ['nodes'], `?${query.toString()}`);
    },
    options: (body) =>
      itemsOf<Place>(body).flatMap((place) => {
        const id = text(place.id);
        const name = text(place.displayName);
        if (!id || !name) return [];
        const code = text(place.code);
        return [
          {
            value: id,
            label: code ? `${name} (${code})` : name,
            active: place.status === 'ACTIVE',
          },
        ];
      }),
  },
};

function lookupRequest(url: URL): LookupRequest | string {
  const search = url.searchParams.get('search')?.trim();
  const ids = url.searchParams.get('ids');
  if (search && search.length > 100) return 'search is at most 100 characters.';
  if (ids) {
    const list = ids.split(',');
    if (list.length > MAX_IDS || list.some((id) => !ID.test(id)))
      return `ids must be up to ${MAX_IDS} comma-separated ids.`;
    return { ids: list };
  }
  return search ? { search } : {};
}

function choose(
  options: readonly Option[],
  request: LookupRequest,
): { value: string; label: string }[] {
  const named = request.ids ? new Set(request.ids) : null;
  const search = request.search?.toLowerCase();
  return options
    .filter((option) =>
      named
        ? named.has(option.value)
        : option.active && (!search || option.label.toLowerCase().includes(search)),
    )
    .slice(0, named ? MAX_IDS : MAX_OPTIONS)
    .map(({ value, label }) => ({ value, label }));
}

export async function GET(request: Request, context: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await context.params;
    if (!isPlatformLookupKey(key))
      return NextResponse.json(
        { detail: 'Unknown lookup.' },
        { status: 404, headers: { 'Cache-Control': 'no-store' } },
      );
    const lookup = lookupRequest(new URL(request.url));
    if (
      typeof lookup !== 'string' &&
      key === 'workspace-sites' &&
      (lookup.ids?.length ?? 0) > MAX_PLACE_IDS
    )
      return NextResponse.json(
        {
          code: 'LOOKUP_QUERY_INVALID',
          message: `Name at most ${MAX_PLACE_IDS} places at a time.`,
        },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    if (typeof lookup === 'string')
      return NextResponse.json(
        { code: 'LOOKUP_QUERY_INVALID', message: lookup },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    const source = SOURCES[key];
    const response = await source.load(lookup, request);
    if (!response) return authenticationRequired();
    // A refusal (403 without the permission) or a failure reaches the window as the owning service gave it.
    if (!response.ok) return proxyUpstream(response);
    const body: unknown = await response.json().catch(() => null);
    return NextResponse.json(choose(source.options(body), lookup), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return unavailable(error);
  }
}
