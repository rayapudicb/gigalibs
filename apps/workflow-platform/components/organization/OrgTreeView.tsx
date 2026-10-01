'use client';

import type { OrgEdgeViewV1, OrgPage } from '@gigalibs/contracts';
import { Badge, Button, Text } from '@medusajs/ui';
import { useCallback, useEffect, useState } from 'react';
import { describeOrgError, orgRequest, type OrgErrorView } from './organization-client';

export interface OrgTreeActions {
  onMove: (edge: OrgEdgeViewV1) => void;
  onRemove: (edge: OrgEdgeViewV1) => void;
}

/**
 * One version's tree, loaded a level at a time (5,000 stores or 20,000 offices never load at once). Nested lists with
 * disclosure buttons keep it usable by keyboard and screen readers.
 */
export function OrgTreeView({ versionId, label, actions, refreshKey }: { versionId: string; label: string; actions?: OrgTreeActions; refreshKey: number }) {
  return (
    <nav aria-label={label}>
      <OrgTreeLevel versionId={versionId} parentUnitId={null} depth={0} actions={actions} refreshKey={refreshKey} />
    </nav>
  );
}

function OrgTreeLevel({ versionId, parentUnitId, depth, actions, refreshKey }: {
  versionId: string;
  parentUnitId: string | null;
  depth: number;
  actions: OrgTreeActions | undefined;
  refreshKey: number;
}) {
  const [items, setItems] = useState<OrgEdgeViewV1[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<OrgErrorView | null>(null);

  const load = useCallback(
    async (cursor?: string) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ limit: '100' });
        if (parentUnitId) params.set('parentUnitId', parentUnitId);
        if (cursor) params.set('cursor', cursor);
        const page = await orgRequest<OrgPage<OrgEdgeViewV1>>(`/versions/${versionId}/edges?${params}`);
        setItems((current) => (cursor ? [...current, ...page.items] : page.items));
        setNextCursor(page.nextCursor);
      } catch (caught) {
        setError(describeOrgError(caught));
      } finally {
        setLoading(false);
      }
    },
    [versionId, parentUnitId],
  );

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (error)
    return (
      <div className="flex items-center gap-2 py-1" role="alert">
        <Text size="small" className="text-ui-fg-error">{error.message}</Text>
        <Button size="small" variant="transparent" onClick={() => void load()}>Try again</Button>
      </div>
    );
  if (loading && items.length === 0) return <Text size="small" className="py-1 text-ui-fg-subtle" role="status">Loading…</Text>;
  if (items.length === 0 && depth === 0) return <Text size="small" className="text-ui-fg-subtle">Nothing is placed in this version yet.</Text>;
  return (
    <ul className={depth === 0 ? 'flex flex-col' : 'ml-5 flex flex-col border-l border-ui-border-base pl-3'}>
      {items.map((edge) => (
        <OrgTreeNode key={edge.unitId} edge={edge} versionId={versionId} depth={depth} actions={actions} refreshKey={refreshKey} />
      ))}
      {nextCursor && (
        <li>
          <Button size="small" variant="transparent" isLoading={loading} onClick={() => void load(nextCursor)}>Show more</Button>
        </li>
      )}
    </ul>
  );
}

function OrgTreeNode({ edge, versionId, depth, actions, refreshKey }: {
  edge: OrgEdgeViewV1;
  versionId: string;
  depth: number;
  actions: OrgTreeActions | undefined;
  refreshKey: number;
}) {
  const [open, setOpen] = useState(depth === 0);
  const childListId = `org-children-${versionId}-${edge.unitId}`;
  return (
    <li className="py-0.5">
      <div className="flex flex-wrap items-center gap-2">
        {edge.childCount > 0 ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={childListId}
            onClick={() => setOpen(!open)}
            className="flex h-6 w-6 items-center justify-center rounded text-ui-fg-subtle hover:bg-ui-bg-base-hover focus:outline-none focus-visible:shadow-borders-focus"
          >
            <span aria-hidden>{open ? '▾' : '▸'}</span>
            <span className="sr-only">{open ? `Collapse ${edge.name}` : `Expand ${edge.name} (${edge.childCount})`}</span>
          </button>
        ) : (
          <span className="inline-block h-6 w-6" aria-hidden />
        )}
        <Text size="small" weight="plus">{edge.code}</Text>
        <Text size="small">{edge.name}</Text>
        <Badge size="2xsmall" color="grey">{edge.typeCode}</Badge>
        {!edge.holdsRecords && <Badge size="2xsmall" color="blue">Grouping</Badge>}
        {edge.status !== 'ACTIVE' && <Badge size="2xsmall" color="orange">{edge.status === 'INACTIVE' ? 'Inactive' : 'Archived'}</Badge>}
        {edge.childCount > 0 && <Text size="xsmall" className="text-ui-fg-muted">{edge.childCount} below</Text>}
        {actions && (
          <span className="ml-auto flex gap-1">
            <Button size="small" variant="transparent" onClick={() => actions.onMove(edge)} aria-label={`Move ${edge.name}`}>Move</Button>
            <Button size="small" variant="transparent" onClick={() => actions.onRemove(edge)} aria-label={`Remove ${edge.name}`}>Remove</Button>
          </span>
        )}
      </div>
      {open && edge.childCount > 0 && (
        <div id={childListId}>
          <OrgTreeLevel versionId={versionId} parentUnitId={edge.unitId} depth={depth + 1} actions={actions} refreshKey={refreshKey} />
        </div>
      )}
    </li>
  );
}
