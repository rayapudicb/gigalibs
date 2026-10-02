'use client';

import type {
  OrgActiveVersionV1,
  OrgDepartmentImportV1,
  OrgEdgeViewV1,
  OrgHierarchyActivationV1,
  OrgHierarchyVersionDetailV1,
  OrgHierarchyVersionV1,
  OrgImpactV1,
  OrgSyncRequestV1,
  OrgTreeV1,
  OrgUnitV1,
  OrgValidationResultV1,
} from '@gigalibs/contracts';
import { Badge, Button, Checkbox, Container, Heading, Input, Label, Table, Text } from '@medusajs/ui';
import { useCallback, useEffect, useId, useState } from 'react';
import {
  describeOrgError,
  localDateTimeToIso,
  newIdempotencyKey,
  orgRequest,
  OrgRequestError,
  type OrgErrorView,
  type OrgPermissions,
  type OrgWorkflowAction,
  VERSION_STATUS_COLOR,
  workflowSteps,
} from './organization-client';
import { OrgErrorAlert, OrgProblemList, OrgSuccess, OrgUnitPicker, ReasonField, selectClassName, useUnitNames } from './OrgShared';
import { OrgTreeView } from './OrgTreeView';

const OPEN = new Set(['DRAFT', 'VALIDATED', 'SUBMITTED', 'APPROVED']);
const STEP_LABEL: Record<OrgWorkflowAction, string> = {
  edit: 'Edit',
  validate: 'Validate',
  submit: 'Submit for approval',
  withdraw: 'Withdraw draft',
  approve: 'Approve',
  reject: 'Reject',
  publish: 'Publish',
  activate: 'Activate',
};

/**
 * The organization tree: the version in force (or as of any past moment), and the one draft moving through
 * validate → submit → approve (a second person) → publish → activate. Nothing here changes access until activation.
 */
export function OrgStructurePanel({ permissions, userId, userNames, onChanged }: {
  permissions: OrgPermissions;
  userId: string;
  userNames: Record<string, string>;
  onChanged: () => void;
}) {
  const ids = { tree: useId(), asOf: useId(), effective: useId(), treeCode: useId(), treeName: useId(), treePurpose: useId(), sort: useId() };
  const [trees, setTrees] = useState<OrgTreeV1[] | null>(null);
  const [treeId, setTreeId] = useState('');
  const [active, setActive] = useState<OrgActiveVersionV1 | null>(null);
  const [asOf, setAsOf] = useState('');
  const [versions, setVersions] = useState<OrgHierarchyVersionV1[]>([]);
  const [activations, setActivations] = useState<OrgHierarchyActivationV1[]>([]);
  const [work, setWork] = useState<OrgHierarchyVersionDetailV1 | null>(null);
  const [loadError, setLoadError] = useState<OrgErrorView | null>(null);
  const [error, setError] = useState<OrgErrorView | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [validation, setValidation] = useState<OrgValidationResultV1 | null>(null);
  const [impact, setImpact] = useState<OrgImpactV1 | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [placing, setPlacing] = useState<{ unit: OrgUnitV1 | null; parent: OrgUnitV1 | null; topLevel: boolean; sortOrder: string; moving: OrgEdgeViewV1 | null } | null>(null);
  const [newTree, setNewTree] = useState<{ code: string; name: string; purpose: 'REPORTING' | 'COST' | 'LEGAL' | 'OTHER' } | null>(null);

  const tree = trees?.find((candidate) => candidate.id === treeId) ?? null;

  const loadTrees = useCallback(async () => {
    setLoadError(null);
    try {
      const list = await orgRequest<OrgTreeV1[]>('/trees');
      setTrees(list);
      setTreeId((current) => (current && list.some((candidate) => candidate.id === current) ? current : (list.find((candidate) => candidate.kind === 'PRIMARY') ?? list[0])?.id ?? ''));
    } catch (caught) {
      setLoadError(describeOrgError(caught));
    }
  }, []);

  const loadTree = useCallback(async () => {
    if (!treeId) return;
    setLoadError(null);
    try {
      const at = localDateTimeToIso(asOf);
      const [activeResult, versionList, history] = await Promise.all([
        orgRequest<OrgActiveVersionV1>(`/trees/${treeId}/active${at ? `?asOf=${encodeURIComponent(at)}` : ''}`).catch((caught: unknown) => {
          if (caught instanceof OrgRequestError && caught.status === 404) return null;
          throw caught;
        }),
        orgRequest<OrgHierarchyVersionV1[]>(`/trees/${treeId}/versions`),
        orgRequest<OrgHierarchyActivationV1[]>(`/trees/${treeId}/activations`),
      ]);
      setActive(activeResult);
      setVersions(versionList);
      setActivations(history);
      const activated = new Set(history.map((activation) => activation.versionId));
      const latest = versionList[0];
      const current = latest && (OPEN.has(latest.status) || (latest.status === 'PUBLISHED' && !activated.has(latest.id))) ? latest : null;
      setWork(current ? await orgRequest<OrgHierarchyVersionDetailV1>(`/versions/${current.id}`) : null);
      setRefreshKey((key) => key + 1);
    } catch (caught) {
      setLoadError(describeOrgError(caught));
    }
  }, [treeId, asOf]);

  useEffect(() => {
    void loadTrees();
  }, [loadTrees]);
  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  const act = async (label: string | ((result: unknown) => string), request: () => Promise<unknown>, after?: (result: unknown) => void) => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await request();
      after?.(result);
      setSuccess(typeof label === 'function' ? label(result) : label);
      setReason('');
      await loadTree();
      onChanged();
    } catch (caught) {
      setError(describeOrgError(caught));
    } finally {
      setBusy(false);
    }
  };

  const runStep = (action: OrgWorkflowAction) => {
    if (!work) return;
    const body = { expectedVersion: work.lockVersion, reason };
    if (action === 'validate')
      return act('Validation finished.', () => orgRequest<OrgValidationResultV1>(`/versions/${work.id}/validate`, { method: 'POST', body: { expectedVersion: work.lockVersion } }), (result) =>
        setValidation(result as OrgValidationResultV1),
      );
    if (action === 'activate')
      return act('Version activated.', () =>
        orgRequest('/activations', {
          method: 'POST',
          body: { versionId: work.id, reason, idempotencyKey: newIdempotencyKey('activate'), ...(localDateTimeToIso(effectiveFrom) ? { effectiveFrom: localDateTimeToIso(effectiveFrom) } : {}) },
        }),
      );
    const messages: Partial<Record<OrgWorkflowAction, string>> = {
      submit: 'Submitted for approval.',
      withdraw: 'Draft withdrawn.',
      approve: 'Approved.',
      reject: 'Rejected.',
      publish: 'Published. Activate it to put it in force.',
    };
    return act(messages[action] ?? 'Done.', () => orgRequest(`/versions/${work.id}/${action}`, { method: 'POST', body }), () => setValidation(null));
  };

  const startDraft = () =>
    act('Draft started from the version in force.', () => orgRequest(`/trees/${treeId}/versions`, { method: 'POST', body: {} }), () => {
      setValidation(null);
      setImpact(null);
    });

  const editEdges = (label: string, body: { upsert?: Array<{ unitId: string; parentUnitId: string | null; sortOrder: number }>; remove?: string[] }) =>
    work && act(label, () => orgRequest(`/versions/${work.id}/edges`, { method: 'PATCH', body: { expectedVersion: work.lockVersion, upsert: body.upsert ?? [], remove: body.remove ?? [] } }), () => {
      setPlacing(null);
      setValidation(null);
      setImpact(null);
    });

  // ADR-0018 §4: departments become units with the same ids, placed in this draft, with member grants.
  const importDepartments = () =>
    act(
      (result) => {
        const summary = result as OrgDepartmentImportV1;
        return summary.departments === 0
          ? 'There are no departments to bring in.'
          : `${summary.departments} departments placed in the draft (${summary.unitsCreated} new units, ${summary.grantsCreated} member grants). Review, validate and submit it; departments become read-only when it is activated.`;
      },
      () => orgRequest<OrgDepartmentImportV1>('/departments/import', { method: 'POST', body: { reason: 'Bring departments into the organization' } }),
    );

  const resend = () =>
    act(
      (result) => `Sent again: ${(result as OrgSyncRequestV1).activations} version(s) queued for the modules.`,
      () => orgRequest<OrgSyncRequestV1>(`/trees/${treeId}/sync`, { method: 'POST', body: { reason: 'Send the organization to the modules again' } }),
    );

  const loadImpact = () => work && act('Impact calculated.', () => orgRequest<OrgImpactV1>(`/versions/${work.id}/impact`), (result) => setImpact(result as OrgImpactV1));

  const createTree = (kind: 'PRIMARY' | 'ALTERNATE') =>
    act(kind === 'PRIMARY' ? 'Primary tree created.' : 'Alternate tree created.', () =>
      orgRequest<OrgTreeV1>('/trees', {
        method: 'POST',
        body: kind === 'PRIMARY'
          ? { code: 'primary', name: 'Organization', kind, purpose: 'AUTHORITY' }
          : { code: newTree?.code ?? '', name: newTree?.name ?? '', kind, purpose: newTree?.purpose ?? 'REPORTING' },
      }), (created) => {
        setNewTree(null);
        setTreeId((created as OrgTreeV1).id);
        void loadTrees();
      });

  const names = useUnitNames([
    ...(validation?.problems.map((problem) => problem.unitId) ?? []),
    ...(impact ? [...impact.added, ...impact.removed, ...impact.moved.flatMap((move) => [move.unitId, move.fromParentUnitId ?? '', move.toParentUnitId ?? ''])] : []),
    ...(impact?.affectedGrants.map((grant) => grant.unitId) ?? []),
  ].filter(Boolean));
  const editable = !!work && (work.status === 'DRAFT' || work.status === 'VALIDATED') && permissions.draft;
  const steps = work ? workflowSteps(work, permissions, userId).filter((step) => step.action !== 'edit') : [];
  const person = (id: string | null) => (id ? userNames[id] ?? id : '—');

  if (loadError && !trees) return <Container className="p-6"><OrgErrorAlert error={loadError} onRetry={() => void loadTrees()} onReload={() => void loadTrees()} /></Container>;
  if (!trees) return <Container className="p-6"><Text size="small" className="text-ui-fg-subtle" role="status">Loading the organization…</Text></Container>;

  if (trees.length === 0)
    return (
      <Container className="flex flex-col gap-3 p-6">
        <Heading level="h2">Structure</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          There is no organization tree yet. The primary tree is the one that decides who can see what; create it, then place units in a draft.
        </Text>
        <OrgErrorAlert error={error} onRetry={() => void createTree('PRIMARY')} onReload={() => void loadTrees()} />
        {permissions.draft ? (
          <div><Button size="small" isLoading={busy} onClick={() => void createTree('PRIMARY')}>Create the primary tree</Button></div>
        ) : (
          <Text size="small" className="text-ui-fg-subtle">Ask an organization administrator to create it.</Text>
        )}
      </Container>
    );

  return (
    <div className="flex flex-col gap-4">
      <Container className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <Label size="small" htmlFor={ids.tree}>Tree</Label>
            <select id={ids.tree} className={selectClassName} value={treeId} onChange={(event) => { setTreeId(event.target.value); setValidation(null); setImpact(null); }}>
              {trees.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name} ({candidate.kind === 'PRIMARY' ? 'primary — grants access' : `${candidate.purpose.toLowerCase()} rollup`})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label size="small" htmlFor={ids.asOf}>View as of</Label>
              <Input id={ids.asOf} size="small" type="datetime-local" value={asOf} onChange={(event) => setAsOf(event.target.value)} />
            </div>
            {asOf && <Button size="small" variant="secondary" onClick={() => setAsOf('')}>Now</Button>}
            {permissions.draft && !newTree && <Button size="small" variant="secondary" onClick={() => setNewTree({ code: '', name: '', purpose: 'REPORTING' })}>Add rollup tree</Button>}
          </div>
        </div>
        {newTree && (
          <form className="flex flex-wrap items-end gap-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4" aria-label="New rollup tree"
            onSubmit={(event) => { event.preventDefault(); void createTree('ALTERNATE'); }}>
            <div className="flex flex-col gap-1">
              <Label size="small" htmlFor={ids.treeCode}>Code</Label>
              <Input id={ids.treeCode} size="small" placeholder="cost-centres" value={newTree.code} onChange={(event) => setNewTree({ ...newTree, code: event.target.value.toLowerCase() })} />
            </div>
            <div className="flex flex-col gap-1">
              <Label size="small" htmlFor={ids.treeName}>Name</Label>
              <Input id={ids.treeName} size="small" value={newTree.name} onChange={(event) => setNewTree({ ...newTree, name: event.target.value })} />
            </div>
            <div className="flex flex-col gap-1">
              <Label size="small" htmlFor={ids.treePurpose}>Purpose</Label>
              <select id={ids.treePurpose} className={selectClassName} value={newTree.purpose} onChange={(event) => setNewTree({ ...newTree, purpose: event.target.value as typeof newTree.purpose })}>
                <option value="REPORTING">Reporting</option>
                <option value="COST">Cost</option>
                <option value="LEGAL">Legal</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <Button size="small" type="submit" isLoading={busy}>Create</Button>
            <Button size="small" variant="secondary" type="button" onClick={() => setNewTree(null)}>Cancel</Button>
            <Text size="small" className="w-full text-ui-fg-subtle">Rollup trees group units for reports and costs; they never grant access.</Text>
          </form>
        )}
        <OrgErrorAlert error={loadError} onRetry={() => void loadTree()} onReload={() => void loadTree()} />

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Heading level="h3">{asOf ? 'In force at that time' : 'In force now'}</Heading>
            {active && <Badge size="2xsmall" color="green">Version {active.version.versionNumber}</Badge>}
            {active && <Text size="small" className="text-ui-fg-subtle">since {new Date(active.activation.effectiveFrom).toLocaleString()}</Text>}
          </div>
          {active ? (
            <OrgTreeView versionId={active.version.id} label={`Version ${active.version.versionNumber} in force`} refreshKey={refreshKey} />
          ) : (
            <Text size="small" className="text-ui-fg-subtle">
              {asOf ? 'No version was in force at that time.' : 'No version is in force yet: build a draft, have a second person approve it, then publish and activate it.'}
            </Text>
          )}
        </div>
      </Container>

      <Container className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Heading level="h3">Changes</Heading>
            {work && <Badge size="2xsmall" color={VERSION_STATUS_COLOR[work.status]}>Version {work.versionNumber} · {work.status.toLowerCase()}</Badge>}
            {work && <Text size="small" className="text-ui-fg-subtle">{work.unitCount} units · drafted by {person(work.createdBy)}{work.submittedBy ? ` · submitted by ${person(work.submittedBy)}` : ''}{work.approvedBy ? ` · approved by ${person(work.approvedBy)}` : ''}</Text>}
          </div>
          <div className="flex gap-2">
            {permissions.draft && tree?.kind === 'PRIMARY' && (!work || work.status === 'DRAFT' || work.status === 'VALIDATED') && (
              <Button size="small" variant="secondary" disabled={busy} onClick={() => void importDepartments()}>Bring in departments</Button>
            )}
            {!work && permissions.draft && <Button size="small" isLoading={busy} onClick={() => void startDraft()}>Start a draft</Button>}
          </div>
        </div>
        <OrgSuccess message={success} />
        <OrgErrorAlert error={error} unitNames={names} onReload={() => void loadTree()} onRetry={() => void loadTree()} />
        {!work && <Text size="small" className="text-ui-fg-subtle">No changes in progress. A draft starts as a copy of the version in force.</Text>}

        {work && (
          <>
            {steps.length > 0 && (
              <div className="flex flex-col gap-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
                {steps.some((step) => step.action !== 'validate' && step.allowed) && <ReasonField value={reason} onChange={setReason} />}
                {work.status === 'PUBLISHED' && (
                  <div className="flex flex-col gap-1">
                    <Label size="small" htmlFor={ids.effective}>Effective from (empty means now)</Label>
                    <Input id={ids.effective} size="small" type="datetime-local" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} />
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {steps.map((step) => (
                    <Button key={step.action} size="small" variant={step.action === 'reject' || step.action === 'withdraw' ? 'secondary' : 'primary'}
                      disabled={!step.allowed || busy} onClick={() => void runStep(step.action)} title={step.reason ?? undefined}>
                      {STEP_LABEL[step.action]}
                    </Button>
                  ))}
                  <Button size="small" variant="secondary" disabled={busy} onClick={() => void loadImpact()}>Preview impact</Button>
                </div>
                {steps.filter((step) => step.reason).map((step) => (
                  <Text key={step.action} size="small" className="text-ui-fg-subtle">{STEP_LABEL[step.action]}: {step.reason}</Text>
                ))}
              </div>
            )}

            {validation && (
              <div className="flex flex-col gap-2" aria-live="polite">
                {validation.valid ? (
                  <Text size="small">The draft passes every rule and is ready to submit.</Text>
                ) : (
                  <>
                    <Text size="small" weight="plus">Fix these before submitting:</Text>
                    <OrgProblemList problems={validation.problems} unitNames={names} />
                  </>
                )}
              </div>
            )}

            {impact && (
              <div className="flex flex-col gap-2 rounded-lg border border-ui-border-base p-4" aria-live="polite">
                <Text size="small" weight="plus">
                  Against {impact.comparedWithVersionId ? 'the version in force' : 'nothing yet in force'}: {impact.totals.added} added, {impact.totals.removed} removed, {impact.totals.moved} moved; {impact.totals.affectedGrants} member grants touched.
                </Text>
                {impact.added.length > 0 && <Text size="small">Added: {impact.added.map((id) => names[id] ?? id).join(', ')}</Text>}
                {impact.removed.length > 0 && <Text size="small">Removed: {impact.removed.map((id) => names[id] ?? id).join(', ')}</Text>}
                {impact.moved.map((move) => (
                  <Text key={move.unitId} size="small">
                    Moved: {names[move.unitId] ?? move.unitId} from {move.fromParentUnitId ? names[move.fromParentUnitId] ?? move.fromParentUnitId : 'the top'} to {move.toParentUnitId ? names[move.toParentUnitId] ?? move.toParentUnitId : 'the top'}
                  </Text>
                ))}
                {impact.affectedGrants.map((grant) => (
                  <Text key={grant.grantId} size="small" className="text-ui-fg-subtle">
                    Access changes for {userNames[grant.userId] ?? grant.userId} ({grant.access === 'READ' ? 'read' : 'read and write'} on {names[grant.unitId] ?? grant.unitId})
                  </Text>
                ))}
              </div>
            )}

            {editable && !placing && (
              <div><Button size="small" variant="secondary" onClick={() => setPlacing({ unit: null, parent: null, topLevel: false, sortOrder: '0', moving: null })}>Place a unit</Button></div>
            )}
            {placing && (
              <form className="flex flex-col gap-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4" aria-label={placing.moving ? `Move ${placing.moving.name}` : 'Place a unit'}
                onSubmit={(event) => {
                  event.preventDefault();
                  const unitId = placing.moving?.unitId ?? placing.unit?.id;
                  if (!unitId) return;
                  void editEdges(placing.moving ? 'Unit moved in the draft.' : 'Unit placed in the draft.', {
                    upsert: [{ unitId, parentUnitId: placing.topLevel ? null : placing.parent?.id ?? null, sortOrder: Number(placing.sortOrder) || 0 }],
                  });
                }}>
                {placing.moving ? (
                  <Text size="small" weight="plus">Move {placing.moving.code} · {placing.moving.name}</Text>
                ) : (
                  <OrgUnitPicker label="Unit" value={placing.unit} onChange={(unit) => setPlacing({ ...placing, unit })} />
                )}
                <label className="flex items-center gap-2">
                  <Checkbox checked={placing.topLevel} onCheckedChange={(checked) => setPlacing({ ...placing, topLevel: checked === true })} />
                  <Text size="small">At the top of the tree</Text>
                </label>
                {!placing.topLevel && <OrgUnitPicker label="Under" value={placing.parent} onChange={(parent) => setPlacing({ ...placing, parent })} />}
                <div className="flex w-32 flex-col gap-1">
                  <Label size="small" htmlFor={ids.sort}>Order</Label>
                  <Input id={ids.sort} size="small" type="number" min={0} value={placing.sortOrder} onChange={(event) => setPlacing({ ...placing, sortOrder: event.target.value })} />
                </div>
                <div className="flex gap-2">
                  <Button size="small" type="submit" isLoading={busy} disabled={!(placing.moving || placing.unit) || (!placing.topLevel && !placing.parent)}>
                    {placing.moving ? 'Move' : 'Place'}
                  </Button>
                  <Button size="small" variant="secondary" type="button" onClick={() => setPlacing(null)}>Cancel</Button>
                </div>
              </form>
            )}

            <OrgTreeView
              versionId={work.id}
              label={`Version ${work.versionNumber} draft`}
              refreshKey={refreshKey}
              {...(editable
                ? {
                    actions: {
                      onMove: (edge: OrgEdgeViewV1) => setPlacing({ unit: null, parent: null, topLevel: false, sortOrder: String(edge.sortOrder), moving: edge }),
                      onRemove: (edge: OrgEdgeViewV1) => void editEdges(`${edge.code} removed from the draft.`, { remove: [edge.unitId] }),
                    },
                  }
                : {})}
            />
          </>
        )}
      </Container>

      <Container className="flex flex-col gap-3 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Heading level="h3">Activation history</Heading>
          {permissions.activate && activations.length > 0 && (
            <Button size="small" variant="secondary" disabled={busy} onClick={() => void resend()}>Send to modules again</Button>
          )}
        </div>
        <Text size="small" className="text-ui-fg-subtle">Modules keep their own copy of each activated version; send it again after adding a module.</Text>
        {activations.length === 0 ? (
          <Text size="small" className="text-ui-fg-subtle">Nothing has been activated for this tree.</Text>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Effective from</Table.HeaderCell>
                  <Table.HeaderCell>Version</Table.HeaderCell>
                  <Table.HeaderCell>Reason</Table.HeaderCell>
                  <Table.HeaderCell>By</Table.HeaderCell>
                  <Table.HeaderCell><span className="sr-only">Actions</span></Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {activations.map((activation) => (
                  <Table.Row key={activation.id}>
                    <Table.Cell>{new Date(activation.effectiveFrom).toLocaleString()}</Table.Cell>
                    <Table.Cell>{versions.find((version) => version.id === activation.versionId)?.versionNumber ?? '—'}</Table.Cell>
                    <Table.Cell>{activation.reason}</Table.Cell>
                    <Table.Cell>{person(activation.activatedBy)}</Table.Cell>
                    <Table.Cell>
                      <Button size="small" variant="transparent" onClick={() => setAsOf(toLocalInput(activation.effectiveFrom))}>View</Button>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        )}
      </Container>
    </div>
  );
}

/** ISO instant → `datetime-local` value in the viewer's time zone, a minute after so the activation is included. */
function toLocalInput(iso: string): string {
  const at = new Date(new Date(iso).getTime() + 60_000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`;
}
