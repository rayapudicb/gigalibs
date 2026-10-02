'use client';

import type {
  CmmsAssetV1,
  CmmsSpaceTreeV1,
  CmmsSpaceTypeV1,
  CmmsSpaceV1,
} from '@gigalibs/contracts';
import {
  ArrowPath,
  Buildings,
  BuildingStorefront,
  MapPin,
  PencilSquare,
  Plus,
  Trash,
} from '@medusajs/icons';
import { Badge, Button, Container, Heading, Input, StatusBadge, Table, Text } from '@medusajs/ui';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { type CmmsApiError, cmmsApi } from '../api';
import {
  ActionError,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  optionalNumber,
  optionalText,
  selectClass,
} from './CmmsShared';

const spaceTypeColor: Record<CmmsSpaceTypeV1, 'blue' | 'purple' | 'orange' | 'green' | 'grey'> = {
  SITE: 'blue',
  BUILDING: 'purple',
  FLOOR: 'orange',
  ROOM: 'green',
  ZONE: 'grey',
};

const assetStatusColor: Record<string, 'green' | 'orange' | 'red' | 'grey'> = {
  OPERATIONAL: 'green',
  UNDER_MAINTENANCE: 'orange',
  OFFLINE: 'red',
  DECOMMISSIONED: 'grey',
};

export function CmmsSpaceExplorer() {
  const [tree, setTree] = useState<CmmsSpaceTreeV1[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [selectedSpace, setSelectedSpace] = useState<CmmsSpaceV1 | null>(null);
  const [containedAssets, setContainedAssets] = useState<CmmsAssetV1[]>([]);
  const [loading, setLoading] = useState(true);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [error, setError] = useState<CmmsApiError | null>(null);
  const [actionError, setActionError] = useState<CmmsApiError | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [editingSpace, setEditingSpace] = useState<CmmsSpaceV1 | null>(null);
  const [showCadModal, setShowCadModal] = useState(false);

  const loadTree = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await cmmsApi.listSpaceTree();
      setTree(res.items);
      if (res.items.length > 0 && !selectedSpaceId) {
        setSelectedSpaceId(res.items[0].id);
      }
    } catch (err) {
      setError(err as CmmsApiError);
    } finally {
      setLoading(false);
    }
  }, [selectedSpaceId]);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  // Load selected space detail and contained equipment
  useEffect(() => {
    if (!selectedSpaceId) {
      setSelectedSpace(null);
      setContainedAssets([]);
      return;
    }
    let cancelled = false;
    async function loadDetail() {
      setAssetsLoading(true);
      setActionError(null);
      try {
        const [space, assetsRes] = await Promise.all([
          cmmsApi.getSpace(selectedSpaceId!),
          cmmsApi.getSpaceAssets(selectedSpaceId!),
        ]);
        if (!cancelled) {
          setSelectedSpace(space);
          setContainedAssets(assetsRes.items);
        }
      } catch (err) {
        if (!cancelled) setActionError(err as CmmsApiError);
      } finally {
        if (!cancelled) setAssetsLoading(false);
      }
    }
    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedSpaceId]);

  async function handleDelete(space: CmmsSpaceV1) {
    if (!confirm(`Are you sure you want to delete spatial node "${space.name}" (${space.code})?`)) {
      return;
    }
    setActionError(null);
    try {
      await cmmsApi.deleteSpace(space.id);
      setSelectedSpaceId(null);
      setSelectedSpace(null);
      await loadTree();
    } catch (err) {
      setActionError(err as CmmsApiError);
    }
  }

  // Flatten tree for parent selection options
  const flatSpaces = flattenTree(tree);

  if (loading && tree.length === 0) return <LoadingState label="Loading spatial topology…" />;
  if (error && tree.length === 0) return <ErrorState error={error} retry={() => void loadTree()} />;

  return (
    <div className="space-y-4">
      {/* Top Banner / Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Heading level="h2">Spatial Hierarchy & CAFM Topology</Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            Manage physical asset spaces, buildings, floors, rooms, CAD 2D boundaries, and 3D BIM GUID linkages.
          </Text>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="small"
            variant="secondary"
            onClick={() => void loadTree()}
          >
            <ArrowPath /> Refresh
          </Button>
          <Button
            type="button"
            size="small"
            onClick={() => {
              setCreateParentId(null);
              setShowCreateModal(true);
            }}
          >
            <Plus /> New Top-Level Site
          </Button>
        </div>
      </div>

      <ActionError error={actionError} />

      {/* Main Grid: Tree Explorer on Left, Details & Assets on Right */}
      <div className="grid gap-5 xl:grid-cols-[400px_minmax(0,1fr)]">
        {/* Left: Spatial Tree Hierarchy */}
        <Container className="p-4 space-y-4">
          <div className="flex items-center justify-between border-b pb-3">
            <Text weight="plus" size="small">
              Spatial Tree ({flatSpaces.length} nodes)
            </Text>
            {selectedSpace ? (
              <Button
                type="button"
                size="small"
                variant="transparent"
                onClick={() => {
                  setCreateParentId(selectedSpace.id);
                  setShowCreateModal(true);
                }}
              >
                <Plus /> Add Child
              </Button>
            ) : null}
          </div>

          {tree.length === 0 ? (
            <EmptyState
              title="No spatial hierarchy defined"
              text="Create your first Site node to begin organizing buildings, floors, and rooms."
              action={
                <Button
                  size="small"
                  onClick={() => {
                    setCreateParentId(null);
                    setShowCreateModal(true);
                  }}
                >
                  <Plus /> Create First Site
                </Button>
              }
            />
          ) : (
            <div className="space-y-1 max-h-[750px] overflow-y-auto pr-1">
              {tree.map((node) => (
                <TreeNode
                  key={node.id}
                  node={node}
                  selectedId={selectedSpaceId}
                  onSelect={(id) => setSelectedSpaceId(id)}
                />
              ))}
            </div>
          )}
        </Container>

        {/* Right: Selected Space Details, CAD Layer, Contained Assets */}
        <div className="space-y-5">
          {selectedSpace ? (
            <>
              {/* Space Information Card */}
              <Container className="p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge color={spaceTypeColor[selectedSpace.spaceType]}>
                        {selectedSpace.spaceType}
                      </Badge>
                      <span className="font-mono text-xs text-ui-fg-subtle">
                        {selectedSpace.code}
                      </span>
                    </div>
                    <Heading level="h2">{selectedSpace.name}</Heading>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="small"
                      variant="secondary"
                      onClick={() => setEditingSpace(selectedSpace)}
                    >
                      <PencilSquare /> Edit
                    </Button>
                    <Button
                      type="button"
                      size="small"
                      variant="danger"
                      onClick={() => void handleDelete(selectedSpace)}
                    >
                      <Trash /> Delete
                    </Button>
                  </div>
                </div>

                {/* Spatial Attributes */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 txt-compact-small">
                  <div className="rounded-md bg-ui-bg-subtle p-3">
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      Floor Number
                    </Text>
                    <p className="mt-1 font-semibold">
                      {selectedSpace.floorNumber !== null ? selectedSpace.floorNumber : '—'}
                    </p>
                  </div>
                  <div className="rounded-md bg-ui-bg-subtle p-3">
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      Gross Area
                    </Text>
                    <p className="mt-1 font-semibold">
                      {selectedSpace.grossAreaSqm ? `${selectedSpace.grossAreaSqm} m²` : '—'}
                    </p>
                  </div>
                  <div className="rounded-md bg-ui-bg-subtle p-3">
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      Net Usable Area
                    </Text>
                    <p className="mt-1 font-semibold">
                      {selectedSpace.netAreaSqm ? `${selectedSpace.netAreaSqm} m²` : '—'}
                    </p>
                  </div>
                  <div className="rounded-md bg-ui-bg-subtle p-3">
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      BIM GUID Anchor
                    </Text>
                    <p className="mt-1 font-mono text-xs truncate" title={selectedSpace.bimGuid ?? ''}>
                      {selectedSpace.bimGuid ?? 'No IFC GUID linked'}
                    </p>
                  </div>
                </div>

                {/* CAD 2D Layer / Boundary Section */}
                <div className="rounded-lg border p-4 bg-ui-bg-base space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Text weight="plus" size="small">
                        2D CAD Floor Plan Layer (GeoJSON)
                      </Text>
                      <Text size="xsmall" className="text-ui-fg-subtle">
                        Spatial boundaries imported from openMAINT / AutoCAD DXF floorplans.
                      </Text>
                    </div>
                    <Button
                      type="button"
                      size="small"
                      variant="secondary"
                      onClick={() => setShowCadModal(true)}
                    >
                      {selectedSpace.cadLayer ? 'Update CAD Layer' : 'Upload CAD Layer'}
                    </Button>
                  </div>

                  {selectedSpace.cadLayer ? (
                    <div className="rounded border bg-ui-bg-subtle p-3 text-xs font-mono space-y-2">
                      <div className="flex items-center justify-between text-ui-fg-subtle">
                        <span>Geometry Type: {String((selectedSpace.cadLayer as Record<string, unknown>).type ?? 'Geometry')}</span>
                        <span>
                          Coordinates count:{' '}
                          {Array.isArray((selectedSpace.cadLayer as Record<string, unknown>).coordinates)
                            ? ((selectedSpace.cadLayer as Record<string, unknown>).coordinates as unknown[]).length
                            : 0}
                        </span>
                      </div>
                      <pre className="max-h-24 overflow-x-auto text-ui-fg-subtle bg-ui-bg-field p-2 rounded">
                        {JSON.stringify(selectedSpace.cadLayer, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <Text size="xsmall" className="text-ui-fg-subtle italic">
                      No CAD vector layer uploaded for this space. Upload GeoJSON to enable 2D floorplan visualization.
                    </Text>
                  )}
                </div>
              </Container>

              {/* Contained Equipment Register */}
              <Container className="p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Heading level="h3">
                      Contained Equipment & Assets ({containedAssets.length})
                    </Heading>
                    <Text size="small" className="mt-1 text-ui-fg-subtle">
                      Technical assets stationed within this physical space boundary.
                    </Text>
                  </div>
                </div>

                {assetsLoading ? (
                  <LoadingState label="Loading equipment in this space…" />
                ) : containedAssets.length === 0 ? (
                  <EmptyState
                    title="No equipment stationed in this space"
                    text="When creating or editing assets in the Asset Register, select this space to station equipment here."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <Table.Header>
                        <Table.Row>
                          <Table.HeaderCell>Tag / Serial</Table.HeaderCell>
                          <Table.HeaderCell>Asset Name</Table.HeaderCell>
                          <Table.HeaderCell>Category</Table.HeaderCell>
                          <Table.HeaderCell>Status</Table.HeaderCell>
                          <Table.HeaderCell>Criticality</Table.HeaderCell>
                        </Table.Row>
                      </Table.Header>
                      <Table.Body>
                        {containedAssets.map((asset) => (
                          <Table.Row key={asset.id}>
                            <Table.Cell className="font-mono text-xs font-medium">
                              {asset.assetTag}
                              {asset.serialNumber ? (
                                <span className="block text-ui-fg-subtle">
                                  SN: {asset.serialNumber}
                                </span>
                              ) : null}
                            </Table.Cell>
                            <Table.Cell>
                              <span className="font-semibold block">{asset.name}</span>
                              {asset.model ? (
                                <span className="text-xs text-ui-fg-subtle">{asset.model}</span>
                              ) : null}
                            </Table.Cell>
                            <Table.Cell className="capitalize">
                              {asset.category ? asset.category.toLowerCase().replace('_', ' ') : '—'}
                            </Table.Cell>
                            <Table.Cell>
                              <StatusBadge color={assetStatusColor[asset.status] ?? 'grey'}>
                                {asset.status.replace('_', ' ')}
                              </StatusBadge>
                            </Table.Cell>
                            <Table.Cell>
                              <Badge>{asset.criticality}</Badge>
                            </Table.Cell>
                          </Table.Row>
                        ))}
                      </Table.Body>
                    </Table>
                  </div>
                )}
              </Container>
            </>
          ) : (
            <Container className="p-8 text-center">
              <Heading level="h3">Select a space to view CAFM topology</Heading>
              <Text size="small" className="mt-2 text-ui-fg-subtle">
                Choose a site, building, floor, or room in the spatial tree on the left.
              </Text>
            </Container>
          )}
        </div>
      </div>

      {/* Modal: Create Space */}
      {showCreateModal ? (
        <SpaceFormModal
          title={createParentId ? 'Add Child Space' : 'New Top-Level Site'}
          parentSpaceId={createParentId}
          flatSpaces={flatSpaces}
          onClose={() => setShowCreateModal(false)}
          onSuccess={async (newSpace) => {
            setShowCreateModal(false);
            setSelectedSpaceId(newSpace.id);
            await loadTree();
          }}
        />
      ) : null}

      {/* Modal: Edit Space */}
      {editingSpace ? (
        <SpaceFormModal
          title={`Edit Space: ${editingSpace.name}`}
          existingSpace={editingSpace}
          flatSpaces={flatSpaces}
          onClose={() => setEditingSpace(null)}
          onSuccess={async (updatedSpace) => {
            setEditingSpace(null);
            setSelectedSpace(updatedSpace);
            await loadTree();
          }}
        />
      ) : null}

      {/* Modal: Upload CAD Layer */}
      {showCadModal && selectedSpace ? (
        <CadLayerModal
          space={selectedSpace}
          onClose={() => setShowCadModal(false)}
          onSuccess={async (updatedSpace) => {
            setShowCadModal(false);
            setSelectedSpace(updatedSpace);
            await loadTree();
          }}
        />
      ) : null}
    </div>
  );
}

// Tree Node Recursive Component
function TreeNode({
  node,
  selectedId,
  onSelect,
  level = 0,
}: {
  node: CmmsSpaceTreeV1;
  selectedId: string | null;
  onSelect: (id: string) => void;
  level?: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const isSelected = selectedId === node.id;
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="select-none">
      <div
        className={`flex items-center justify-between rounded px-2 py-1.5 cursor-pointer text-sm transition-colors ${
          isSelected
            ? 'bg-ui-bg-base-pressed text-ui-fg-base font-semibold border-l-4 border-ui-border-interactive'
            : 'hover:bg-ui-bg-subtle text-ui-fg-subtle'
        }`}
        style={{ paddingLeft: `${Math.max(8, level * 20)}px` }}
        onClick={() => onSelect(node.id)}
      >
        <div className="flex items-center gap-2 truncate">
          {hasChildren ? (
            <button
              type="button"
              className="text-xs text-ui-fg-muted p-0.5 hover:text-ui-fg-base"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
            >
              {expanded ? '▼' : '►'}
            </button>
          ) : (
            <span className="w-3" />
          )}
          {node.spaceType === 'SITE' && <BuildingStorefront className="w-4 h-4 text-ui-fg-subtle" />}
          {node.spaceType === 'BUILDING' && <Buildings className="w-4 h-4 text-ui-fg-subtle" />}
          {(node.spaceType === 'FLOOR' || node.spaceType === 'ROOM' || node.spaceType === 'ZONE') && (
            <MapPin className="w-4 h-4 text-ui-fg-subtle" />
          )}
          <span className="truncate">{node.name}</span>
        </div>
        <div className="flex items-center gap-1.5 ml-2">
          <Badge size="small" color={spaceTypeColor[node.spaceType]}>
            {node.spaceType}
          </Badge>
          <span className="font-mono text-xs text-ui-fg-muted">{node.code}</span>
        </div>
      </div>

      {expanded && hasChildren ? (
        <div className="space-y-0.5">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              level={level + 1}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Modal for Create / Edit Space
function SpaceFormModal({
  title,
  existingSpace,
  parentSpaceId,
  flatSpaces,
  onClose,
  onSuccess,
}: {
  title: string;
  existingSpace?: CmmsSpaceV1;
  parentSpaceId?: string | null;
  flatSpaces: Array<{ id: string; name: string; code: string; spaceType: CmmsSpaceTypeV1 }>;
  onClose: () => void;
  onSuccess: (space: CmmsSpaceV1) => Promise<void>;
}) {
  const [error, setError] = useState<CmmsApiError | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {
      code: String(form.get('code')).trim(),
      name: String(form.get('name')).trim(),
      spaceType: String(form.get('spaceType')),
      parentSpaceId: optionalText(form.get('parentSpaceId')),
      floorNumber: optionalNumber(form.get('floorNumber')),
      grossAreaSqm: optionalNumber(form.get('grossAreaSqm')),
      netAreaSqm: optionalNumber(form.get('netAreaSqm')),
      bimGuid: optionalText(form.get('bimGuid')),
    };

    try {
      let result: CmmsSpaceV1;
      if (existingSpace) {
        result = await cmmsApi.updateSpace(existingSpace.id, payload);
      } else {
        result = await cmmsApi.createSpace(payload);
      }
      await onSuccess(result);
    } catch (err) {
      setError(err as CmmsApiError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ui-bg-overlay/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-lg border bg-ui-bg-base p-6 shadow-elevation-modal space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <Heading level="h2">{title}</Heading>
          <button
            type="button"
            className="text-ui-fg-subtle hover:text-ui-fg-base text-lg font-bold"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field id="space-code" label="Space Code *">
              <Input
                id="space-code"
                name="code"
                required
                placeholder="e.g. BLD-01, RM-101"
                defaultValue={existingSpace?.code ?? ''}
              />
            </Field>
            <Field id="space-type" label="Space Type *">
              <select
                id="space-type"
                name="spaceType"
                className={selectClass}
                defaultValue={existingSpace?.spaceType ?? (parentSpaceId ? 'BUILDING' : 'SITE')}
              >
                <option value="SITE">SITE (Campus / Facility)</option>
                <option value="BUILDING">BUILDING</option>
                <option value="FLOOR">FLOOR</option>
                <option value="ROOM">ROOM</option>
                <option value="ZONE">ZONE</option>
              </select>
            </Field>
          </div>

          <Field id="space-name" label="Space Name *">
            <Input
              id="space-name"
              name="name"
              required
              placeholder="e.g. Manufacturing Plant 1, Electrical Switchgear Room"
              defaultValue={existingSpace?.name ?? ''}
            />
          </Field>

          <Field id="parent-space" label="Parent Space">
            <select
              id="parent-space"
              name="parentSpaceId"
              className={selectClass}
              defaultValue={existingSpace?.parentSpaceId ?? parentSpaceId ?? ''}
            >
              <option value="">(None - Top-level root)</option>
              {flatSpaces
                .filter((s) => !existingSpace || s.id !== existingSpace.id)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    [{s.spaceType}] {s.name} ({s.code})
                  </option>
                ))}
            </select>
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field id="floor-number" label="Floor Number">
              <Input
                id="floor-number"
                name="floorNumber"
                type="number"
                placeholder="e.g. 1, 2, -1"
                defaultValue={existingSpace?.floorNumber ?? ''}
              />
            </Field>
            <Field id="gross-area" label="Gross Area (m²)">
              <Input
                id="gross-area"
                name="grossAreaSqm"
                type="number"
                step="0.01"
                placeholder="e.g. 450.5"
                defaultValue={existingSpace?.grossAreaSqm ?? ''}
              />
            </Field>
            <Field id="net-area" label="Net Area (m²)">
              <Input
                id="net-area"
                name="netAreaSqm"
                type="number"
                step="0.01"
                placeholder="e.g. 380.0"
                defaultValue={existingSpace?.netAreaSqm ?? ''}
              />
            </Field>
          </div>

          <Field id="bim-guid" label="BIM IFC GUID">
            <Input
              id="bim-guid"
              name="bimGuid"
              placeholder="e.g. 2O2_b$Bl15$qXWde$n4VLj"
              defaultValue={existingSpace?.bimGuid ?? ''}
            />
          </Field>

          <ActionError error={error} />

          <div className="flex items-center justify-end gap-2 border-t pt-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={saving}>
              {existingSpace ? 'Save Changes' : 'Create Space'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Modal for uploading GeoJSON CAD Layer
function CadLayerModal({
  space,
  onClose,
  onSuccess,
}: {
  space: CmmsSpaceV1;
  onClose: () => void;
  onSuccess: (space: CmmsSpaceV1) => Promise<void>;
}) {
  const [error, setError] = useState<CmmsApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const [jsonText, setJsonText] = useState(
    space.cadLayer
      ? JSON.stringify(space.cadLayer, null, 2)
      : JSON.stringify(
          {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [10, 0],
                [10, 10],
                [0, 10],
                [0, 0],
              ],
            ],
          },
          null,
          2,
        ),
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const parsed = JSON.parse(jsonText);
      const res = await cmmsApi.uploadCadLayer(space.id, { cadLayer: parsed });
      await onSuccess(res);
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError(new Error(`Invalid JSON syntax: ${err.message}`) as CmmsApiError);
      } else {
        setError(err as CmmsApiError);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ui-bg-overlay/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-lg border bg-ui-bg-base p-6 shadow-elevation-modal space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <Heading level="h2">Upload CAD 2D Layer ({space.name})</Heading>
          <button
            type="button"
            className="text-ui-fg-subtle hover:text-ui-fg-base text-lg font-bold"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <Field id="cad-json" label="GeoJSON Geometry or Feature (Polygon / MultiPolygon)">
            <textarea
              id="cad-json"
              rows={8}
              className="w-full rounded-md border bg-ui-bg-field p-2 font-mono text-xs text-ui-fg-base outline-none focus:border-ui-border-interactive"
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              required
            />
          </Field>

          <ActionError error={error} />

          <div className="flex items-center justify-end gap-2 border-t pt-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={saving}>
              Save CAD Layer
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function flattenTree(
  nodes: readonly CmmsSpaceTreeV1[],
): Array<{ id: string; name: string; code: string; spaceType: CmmsSpaceTypeV1 }> {
  const result: Array<{ id: string; name: string; code: string; spaceType: CmmsSpaceTypeV1 }> = [];
  function recurse(items: readonly CmmsSpaceTreeV1[]) {
    for (const item of items) {
      result.push({ id: item.id, name: item.name, code: item.code, spaceType: item.spaceType });
      if (item.children && item.children.length > 0) {
        recurse(item.children);
      }
    }
  }
  recurse(nodes);
  return result;
}
