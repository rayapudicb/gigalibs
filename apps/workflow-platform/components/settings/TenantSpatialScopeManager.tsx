'use client';

import { requestJson } from '@/lib/client-api';
import { geospatialApi } from '@/lib/geospatial-api';
import { MAX_SPATIAL_SCOPE_PLACES, type SpatialNodeV1 } from '@gigalibs/contracts';
import { MapPin } from '@medusajs/icons';
import { Alert, Badge, Button, Checkbox, Container, Heading, Input, Label, StatusBadge, Table, Text } from '@medusajs/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface ScopedMember {
  id: string;
  role: string;
  status: string;
  updatedAt: string;
  spatialScopePlaceIds?: string[];
  user: { id: string; name: string | null; email: string };
}

type PlaceLabel = Pick<SpatialNodeV1, 'id' | 'displayName' | 'path' | 'depth' | 'status'>;

const TENANT_WIDE_ROLES = new Set(['SUPER_ADMIN', 'TENANT_ADMIN']);
const SETTINGS_URL = '/api/control/tenants/current/organization/settings';

// WI-OI-063b: opt-in spatial scoping. Geospatial enforces it; this screen only records the choice.
// WI-OI-120x: only an administrator changes their own places; `currentUserId` and `isAdministrator` say who is looking.
export function TenantSpatialScopeManager({ canToggle, canAssign, currentUserId, isAdministrator }: {
  canToggle: boolean;
  canAssign: boolean;
  currentUserId: string;
  isAdministrator: boolean;
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [members, setMembers] = useState<ScopedMember[]>([]);
  const [places, setPlaces] = useState<Map<string, PlaceLabel>>(new Map());
  const [placesError, setPlacesError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [editing, setEditing] = useState<ScopedMember | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settings, memberList] = await Promise.all([
        requestJson<{ spatialScopingEnabled?: boolean }>(SETTINGS_URL),
        requestJson<ScopedMember[]>('/api/control/tenants/current/members'),
      ]);
      setEnabled(Boolean(settings.spatialScopingEnabled));
      setMembers(memberList);
      try {
        const page = await geospatialApi.listNodes({ pageSize: 200 });
        const known = new Map(page.items.map((node) => [node.id, node] as const));
        // Assigned places beyond the first page are fetched individually so every badge has a name.
        const missing = [...new Set(memberList.flatMap((member) => member.spatialScopePlaceIds ?? []))]
          .filter((id) => !known.has(id));
        const fetched = await Promise.allSettled(missing.map((id) => geospatialApi.getNode(id)));
        for (const result of fetched) if (result.status === 'fulfilled') known.set(result.value.id, result.value);
        setPlaces(known);
        setPlacesError(null);
      } catch (reason) {
        setPlacesError((reason as Error).message);
      }
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const scopedMembers = members.filter((member) => member.status === 'ACTIVE' && !TENANT_WIDE_ROLES.has(member.role));
  const unassigned = scopedMembers.filter((member) => (member.spatialScopePlaceIds ?? []).length === 0).length;

  async function toggle() {
    setToggling(true);
    setError(null);
    setNotice(null);
    try {
      const next = await requestJson<{ spatialScopingEnabled: boolean }>(SETTINGS_URL, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spatialScopingEnabled: !enabled }),
      });
      setEnabled(next.spatialScopingEnabled);
      setNotice(next.spatialScopingEnabled
        ? 'Spatial scoping is on. Members now reach only their assigned places within five minutes.'
        : 'Spatial scoping is off. Every member with place access can reach every place again.');
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setToggling(false);
    }
  }

  if (loading && enabled === null) {
    return <Container className="p-5"><Text size="small" className="text-ui-fg-subtle">Loading spatial scope…</Text></Container>;
  }

  return (
    <Container className="space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2">
            <Heading level="h2">Spatial scope</Heading>
            <StatusBadge color={enabled ? 'green' : 'grey'}>{enabled ? 'On' : 'Off'}</StatusBadge>
          </div>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            When on, members other than workspace administrators reach only the places assigned to them, and
            everything inside those places. A member with no assigned places reaches none. Assignments follow a
            place when it is moved.
          </Text>
          {!enabled && unassigned > 0 ? (
            <Text size="small" className="mt-2 text-ui-fg-subtle">
              {unassigned} active {unassigned === 1 ? 'member has' : 'members have'} no places yet and would reach
              none until you assign some.
            </Text>
          ) : null}
        </div>
        {canToggle ? (
          <Button type="button" size="small" variant={enabled ? 'secondary' : 'primary'} isLoading={toggling} onClick={() => void toggle()}>
            {enabled ? 'Turn off spatial scope' : 'Turn on spatial scope'}
          </Button>
        ) : null}
      </div>

      {error ? <Alert variant="error" role="alert">{error}</Alert> : null}
      {notice ? <Alert variant="success" role="status">{notice}</Alert> : null}
      {placesError ? <Alert variant="warning">Places could not be loaded from Geospatial Studio: {placesError}</Alert> : null}

      <div className="overflow-x-auto">
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Member</Table.HeaderCell>
              <Table.HeaderCell>Role</Table.HeaderCell>
              <Table.HeaderCell>Places</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {members.map((member) => {
              const tenantWide = TENANT_WIDE_ROLES.has(member.role);
              const assigned = member.spatialScopePlaceIds ?? [];
              return (
                <Table.Row key={member.id}>
                  <Table.Cell className="py-2">
                    <span className="block txt-compact-small-plus">{member.user.name ?? member.user.email}</span>
                    <span className="text-xs text-ui-fg-muted">{member.user.email}</span>
                  </Table.Cell>
                  <Table.Cell>{member.role}</Table.Cell>
                  <Table.Cell className="py-2">
                    {tenantWide ? <Badge size="2xsmall" color="blue">All places</Badge> : assigned.length === 0 ? (
                      <Text size="xsmall" className="text-ui-fg-muted">{enabled ? 'None — no place access' : 'None'}</Text>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {assigned.map((id) => {
                          const place = places.get(id);
                          return (
                            <Badge key={id} size="2xsmall" color="grey" title={place?.path}>
                              {place ? place.displayName : 'Unavailable place'}
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                  </Table.Cell>
                  <Table.Cell className="text-right">
                    {canAssign && (isAdministrator || member.user.id !== currentUserId) && !tenantWide && member.status === 'ACTIVE' && !placesError ? (
                      <Button type="button" size="small" variant="secondary" onClick={() => { setNotice(null); setEditing(member); }}>
                        Assign places
                      </Button>
                    ) : null}
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table>
      </div>

      {editing ? (
        <AssignPlacesPanel
          key={editing.id}
          member={editing}
          places={places}
          onCancel={() => setEditing(null)}
          onSaved={async (name) => {
            setEditing(null);
            setNotice(`Updated the places for ${name}.`);
            await load();
          }}
        />
      ) : null}
    </Container>
  );
}

function AssignPlacesPanel({ member, places, onCancel, onSaved }: {
  member: ScopedMember;
  places: ReadonlyMap<string, PlaceLabel>;
  onCancel: () => void;
  onSaved: (name: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set(member.spatialScopePlaceIds ?? []));
  const [query, setQuery] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = member.user.name ?? member.user.email;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...places.values()]
      .filter((place) => !needle || `${place.displayName} ${place.path}`.toLowerCase().includes(needle))
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [places, query]);

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await requestJson(`/api/control/tenants/current/members/${encodeURIComponent(member.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedUpdatedAt: member.updatedAt, spatialScopePlaceIds: [...selected], reason: reason.trim() }),
      });
      await onSaved(name);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const full = selected.size >= MAX_SPATIAL_SCOPE_PLACES;
  return (
    <div className="space-y-4 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4" aria-label={`Assign places to ${name}`}>
      <div>
        <Heading level="h3">Assign places to {name}</Heading>
        <Text size="small" className="mt-1 text-ui-fg-subtle">
          Each selected place includes everything inside it. {selected.size} of {MAX_SPATIAL_SCOPE_PLACES} selected.
        </Text>
      </div>
      <Input type="search" aria-label="Search places" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name or path" />
      <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-ui-border-base bg-ui-bg-base p-2" aria-label="Places">
        {visible.length === 0 ? <li><Text size="small" className="p-2 text-ui-fg-muted">No places match.</Text></li> : visible.map((place) => {
          const checked = selected.has(place.id);
          const id = `scope-place-${place.id}`;
          return (
            <li key={place.id} className="flex items-center gap-x-2 rounded-md py-1 pr-2 hover:bg-ui-bg-base-hover" style={{ paddingLeft: 8 + (place.depth - 1) * 16 }}>
              <Checkbox id={id} checked={checked} disabled={!checked && full} onCheckedChange={(value) => toggle(place.id, value === true)} />
              <MapPin className="text-ui-fg-muted" />
              <Label htmlFor={id} size="small">{place.displayName}</Label>
              <span className="font-mono text-xs text-ui-fg-muted">{place.path}</span>
              {place.status === 'INACTIVE' ? <Badge size="2xsmall" color="grey">Inactive</Badge> : null}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-y-1.5">
        <Label htmlFor="scope-reason" size="xsmall" weight="plus">Reason (recorded in the audit log)</Label>
        <Input id="scope-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="For example: covers the Bengaluru sites" />
      </div>
      {error ? <Alert variant="error" role="alert">{error}</Alert> : null}
      <div className="flex justify-end gap-2">
        <Button type="button" size="small" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="button" size="small" isLoading={saving} disabled={reason.trim().length < 3} onClick={() => void save()}>
          Save places
        </Button>
      </div>
    </div>
  );
}
