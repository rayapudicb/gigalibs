import {
  authenticatedUpstream,
  authenticationRequired,
  proxyUpstream,
  unavailable,
} from '@/lib/authenticated-upstream';
import { type PlatformLookupKey, isPlatformLookupKey } from '@gigalibs/contracts';
import { NextResponse } from 'next/server';

// WI-OI-120u (M-WF1): the platform lookups of the metadata windows (PLATFORM_LOOKUPS in @gigalibs/contracts). Each reads
// one control-plane list as the signed-in user, so the control plane's own permission decides who may read it, and
// answers the window's lookup shape `[{ value, label }]`: the active entries matching `search`, or the entries named by
// `ids` whatever their status (so a record shows the name of the login or unit it already holds).

const MAX_OPTIONS = 50;
const MAX_IDS = 100;
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

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

const SOURCES: Readonly<
  Record<
    PlatformLookupKey,
    { path(request: LookupRequest): string; options(body: unknown): Option[] }
  >
> = {
  // users:read. A person is linked to the login of a member, who is identified by their user id.
  'workspace-members': {
    path: () => '/api/v1/tenants/current/members',
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
    path: ({ search, ids }) => {
      const query = new URLSearchParams({ limit: '200' });
      if (ids?.length) query.set('ids', ids.join(','));
      else if (search) query.set('q', search);
      return `/api/v1/tenants/current/organization/units?${query.toString()}`;
    },
    options: (body) =>
      (
        (body && typeof body === 'object' && Array.isArray((body as { items?: unknown }).items)
          ? (body as { items: Unit[] }).items
          : []) as Unit[]
      ).flatMap((unit) => {
        const id = text(unit.id);
        const name = text(unit.name);
        if (!id || !name) return [];
        const code = text(unit.code);
        return [
          { value: id, label: code ? `${name} (${code})` : name, active: unit.status === 'ACTIVE' },
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
    if (typeof lookup === 'string')
      return NextResponse.json(
        { code: 'LOOKUP_QUERY_INVALID', message: lookup },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    const source = SOURCES[key];
    const response = await authenticatedUpstream('control', source.path(lookup));
    if (!response) return authenticationRequired();
    // A refusal (403 without the permission) or a failure reaches the window as the control plane gave it.
    if (!response.ok) return proxyUpstream(response);
    const body: unknown = await response.json().catch(() => null);
    return NextResponse.json(choose(source.options(body), lookup), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return unavailable(error);
  }
}
