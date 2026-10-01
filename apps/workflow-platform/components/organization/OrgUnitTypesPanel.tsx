'use client';

import { ORG_UNIT_CAPABILITIES, type OrgUnitTypeV1 } from '@gigalibs/contracts';
import { Badge, Button, Checkbox, Container, Heading, Input, Label, Table, Text } from '@medusajs/ui';
import { useId, useState } from 'react';
import { describeOrgError, orgRequest, type OrgErrorView, type OrgPermissions } from './organization-client';
import { OrgErrorAlert, OrgSuccess, ReasonField } from './OrgShared';

const CAPABILITY_LABELS: Record<string, string> = {
  LEGAL_ENTITY: 'Legal entity',
  OPERATIONAL: 'Operational',
  REPORTING: 'Reporting',
  WORKFORCE: 'Workforce',
  COST_ACCOUNTING: 'Cost accounting',
  PLACE_OPERATING: 'Operates places',
};

interface Draft {
  code: string;
  one: string;
  other: string;
  holdsRecords: boolean;
  capabilities: string[];
  parents: string[];
  allowAsRoot: boolean;
  description: string;
  reason: string;
}

const emptyDraft: Draft = { code: '', one: '', other: '', holdsRecords: true, capabilities: [], parents: [], allowAsRoot: false, description: '', reason: '' };

/** The levels a tenant uses (Company, Region, Store, Ministry, Estate…), named and ruled by the tenant itself. */
export function OrgUnitTypesPanel({ unitTypes, permissions, onChanged }: { unitTypes: OrgUnitTypeV1[]; permissions: OrgPermissions; onChanged: () => void }) {
  const [editing, setEditing] = useState<OrgUnitTypeV1 | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<OrgErrorView | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const ids = { code: useId(), one: useId(), other: useId(), description: useId() };

  const open = (type: OrgUnitTypeV1 | 'new') => {
    setEditing(type);
    setError(null);
    setSuccess(null);
    setDraft(
      type === 'new'
        ? emptyDraft
        : {
            code: type.code,
            one: type.labels.one,
            other: type.labels.other,
            holdsRecords: type.holdsRecords,
            capabilities: [...type.capabilities],
            parents: [...type.allowedParentTypeCodes],
            allowAsRoot: type.allowAsRoot,
            description: type.description ?? '',
            reason: '',
          },
    );
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const shared = {
        labels: { one: draft.one.trim(), other: draft.other.trim() },
        holdsRecords: draft.holdsRecords,
        capabilities: draft.capabilities,
        allowedParentTypeCodes: draft.parents,
        allowAsRoot: draft.allowAsRoot,
      };
      if (editing === 'new') {
        await orgRequest('/unit-types', {
          method: 'POST',
          body: { code: draft.code.trim(), ...shared, ...(draft.description.trim() ? { description: draft.description.trim() } : {}) },
        });
        setSuccess(`Unit type ${draft.code.trim()} created.`);
      } else if (editing) {
        await orgRequest(`/unit-types/${editing.id}`, {
          method: 'PATCH',
          body: { expectedVersion: editing.version, ...shared, description: draft.description.trim() || null, reason: draft.reason },
        });
        setSuccess(`Unit type ${editing.code} saved.`);
      }
      setEditing(null);
      onChanged();
    } catch (caught) {
      setError(describeOrgError(caught));
    } finally {
      setSaving(false);
    }
  };

  const setArchived = async (type: OrgUnitTypeV1, archived: boolean) => {
    setError(null);
    setSuccess(null);
    try {
      await orgRequest(`/unit-types/${type.id}/${archived ? 'archive' : 'restore'}`, {
        method: 'POST',
        body: { expectedVersion: type.version, reason: archived ? 'No longer used' : 'Used again' },
      });
      setSuccess(`Unit type ${type.code} ${archived ? 'archived' : 'restored'}.`);
      onChanged();
    } catch (caught) {
      setError(describeOrgError(caught));
    }
  };

  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  const otherCodes = unitTypes.filter((type) => type.status === 'ACTIVE').map((type) => type.code);

  return (
    <Container className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Heading level="h2">Unit types</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            The levels your organization uses and where each may sit. Grouping types only hold other units.
          </Text>
        </div>
        {permissions.draft && !editing && <Button size="small" onClick={() => open('new')}>Add unit type</Button>}
      </div>
      <OrgSuccess message={success} />
      <OrgErrorAlert error={error} onReload={onChanged} onRetry={() => void save()} />

      {editing && (
        <form
          className="flex flex-col gap-4 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4"
          aria-label={editing === 'new' ? 'New unit type' : `Edit ${editing.code}`}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-1">
              <Label size="small" htmlFor={ids.code}>Code</Label>
              <Input id={ids.code} size="small" value={draft.code} disabled={editing !== 'new'} placeholder="STORE"
                onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })} />
            </div>
            <div className="flex flex-col gap-1">
              <Label size="small" htmlFor={ids.one}>Name (one)</Label>
              <Input id={ids.one} size="small" value={draft.one} placeholder="Store" onChange={(event) => setDraft({ ...draft, one: event.target.value })} />
            </div>
            <div className="flex flex-col gap-1">
              <Label size="small" htmlFor={ids.other}>Name (many)</Label>
              <Input id={ids.other} size="small" value={draft.other} placeholder="Stores" onChange={(event) => setDraft({ ...draft, other: event.target.value })} />
            </div>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1"><Text size="small" weight="plus">Records</Text></legend>
            <label className="flex items-center gap-2">
              <Checkbox checked={draft.holdsRecords} onCheckedChange={(checked) => setDraft({ ...draft, holdsRecords: checked === true })} />
              <Text size="small">Units of this type own records (clear it for grouping levels such as Region)</Text>
            </label>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1"><Text size="small" weight="plus">Capabilities</Text></legend>
            <div className="flex flex-wrap gap-4">
              {ORG_UNIT_CAPABILITIES.map((capability) => (
                <label key={capability} className="flex items-center gap-2">
                  <Checkbox checked={draft.capabilities.includes(capability)}
                    onCheckedChange={() => setDraft({ ...draft, capabilities: toggle(draft.capabilities, capability) })} />
                  <Text size="small">{CAPABILITY_LABELS[capability]}</Text>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1"><Text size="small" weight="plus">Where it sits</Text></legend>
            <label className="flex items-center gap-2">
              <Checkbox checked={draft.allowAsRoot} onCheckedChange={(checked) => setDraft({ ...draft, allowAsRoot: checked === true })} />
              <Text size="small">Allowed at the top of a tree</Text>
            </label>
            <Text size="small" className="text-ui-fg-subtle">Allowed under:</Text>
            <div className="flex flex-wrap gap-4">
              {[...new Set([...otherCodes, ...(draft.code ? [draft.code] : [])])].map((code) => (
                <label key={code} className="flex items-center gap-2">
                  <Checkbox checked={draft.parents.includes(code)} onCheckedChange={() => setDraft({ ...draft, parents: toggle(draft.parents, code) })} />
                  <Text size="small">{code}</Text>
                </label>
              ))}
              {otherCodes.length === 0 && !draft.code && <Text size="small" className="text-ui-fg-muted">No other types yet.</Text>}
            </div>
          </fieldset>
          <div className="flex flex-col gap-1">
            <Label size="small" htmlFor={ids.description}>Description</Label>
            <Input id={ids.description} size="small" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </div>
          {editing !== 'new' && <ReasonField value={draft.reason} onChange={(reason) => setDraft({ ...draft, reason })} />}
          <div className="flex gap-2">
            <Button size="small" type="submit" isLoading={saving}>Save</Button>
            <Button size="small" variant="secondary" type="button" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </form>
      )}

      {unitTypes.length === 0 ? (
        <Text size="small" className="text-ui-fg-subtle">
          No unit types yet. Start with your top level (for example Company or Department) and allow it at the top.
        </Text>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Code</Table.HeaderCell>
                <Table.HeaderCell>Name</Table.HeaderCell>
                <Table.HeaderCell>Kind</Table.HeaderCell>
                <Table.HeaderCell>Sits under</Table.HeaderCell>
                <Table.HeaderCell>Capabilities</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell><span className="sr-only">Actions</span></Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {unitTypes.map((type) => (
                <Table.Row key={type.id}>
                  <Table.Cell><Text size="small" weight="plus">{type.code}</Text></Table.Cell>
                  <Table.Cell>{type.labels.one} / {type.labels.other}</Table.Cell>
                  <Table.Cell>{type.holdsRecords ? 'Holds records' : 'Grouping'}</Table.Cell>
                  <Table.Cell>{[type.allowAsRoot ? 'Top' : null, ...type.allowedParentTypeCodes].filter(Boolean).join(', ')}</Table.Cell>
                  <Table.Cell>
                    <div className="flex flex-wrap gap-1">
                      {type.capabilities.map((capability) => <Badge key={capability} size="2xsmall">{CAPABILITY_LABELS[capability] ?? capability}</Badge>)}
                    </div>
                  </Table.Cell>
                  <Table.Cell><Badge size="2xsmall" color={type.status === 'ACTIVE' ? 'green' : 'grey'}>{type.status === 'ACTIVE' ? 'Active' : 'Archived'}</Badge></Table.Cell>
                  <Table.Cell>
                    {permissions.draft && (
                      <div className="flex justify-end gap-2">
                        {type.status === 'ACTIVE' && <Button size="small" variant="secondary" onClick={() => open(type)}>Edit</Button>}
                        <Button size="small" variant="transparent" onClick={() => void setArchived(type, type.status === 'ACTIVE')}>
                          {type.status === 'ACTIVE' ? 'Archive' : 'Restore'}
                        </Button>
                      </div>
                    )}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}
    </Container>
  );
}
