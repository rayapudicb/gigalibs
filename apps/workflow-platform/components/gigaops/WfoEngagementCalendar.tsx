'use client';

import { workforceApi } from '@/lib/workforce-api';
import { Plus } from '@medusajs/icons';
import {
  Alert,
  Button,
  Container,
  Heading,
  Input,
  Label,
  StatusBadge,
  Table,
  Text,
} from '@medusajs/ui';
import { type FormEvent, useEffect, useState } from 'react';
import { BulkInviteModal } from './BulkInviteModal';

const selectClass =
  'h-8 w-full rounded-md bg-ui-bg-field px-2 txt-compact-small text-ui-fg-base shadow-borders-base outline-none transition-fg hover:bg-ui-bg-field-hover focus-visible:shadow-borders-interactive-with-active';

export function WfoEngagementCalendar() {
  const [engagements, setEngagements] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedEng, setSelectedEng] = useState<any | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await workforceApi.wfoListEngagements({});
      setEngagements(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load engagements');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_480px]">
      <Container className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Heading level="h2">Work Catalogue & Engagements</Heading>
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              Universal work containers: events, projects, work orders, routes, and duty rosters.
            </Text>
          </div>
          <Button type="button" size="small" onClick={() => setShowCreate((v) => !v)}>
            <Plus /> New engagement
          </Button>
        </div>

        {showCreate && (
          <CreateEngagementForm
            onCreated={async (eng) => {
              setShowCreate(false);
              setSelectedEng(eng);
              await load();
            }}
          />
        )}

        {error && <Alert variant="error" className="mt-4">{error}</Alert>}

        {engagements.length === 0 && !loading ? (
          <div className="mt-5 rounded-lg border border-dashed border-ui-border-strong p-6 text-center">
            <Text weight="plus">No engagements defined</Text>
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              Create an event, project, or work order to begin staffing positions.
            </Text>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Engagement</Table.HeaderCell>
                  <Table.HeaderCell>Type</Table.HeaderCell>
                  <Table.HeaderCell>Schedule</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {engagements.map((eng) => (
                  <Table.Row
                    key={eng.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedEng(eng)}
                  >
                    <Table.Cell className="py-2">
                      <span className="block txt-compact-small-plus">{eng.name}</span>
                      <span className="text-xs text-ui-fg-subtle">{eng.sourceType}</span>
                    </Table.Cell>
                    <Table.Cell>{eng.engagementType}</Table.Cell>
                    <Table.Cell className="text-xs text-ui-fg-subtle">
                      {eng.startsAt} → {eng.endsAt}
                    </Table.Cell>
                    <Table.Cell>
                      <StatusBadge color={eng.status === 'PUBLISHED' ? 'green' : 'grey'}>
                        {eng.status}
                      </StatusBadge>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        )}
      </Container>

      <EngagementPositionsPanel
        engagement={selectedEng}
        onChanged={async () => {
          if (selectedEng) {
            const updated = await workforceApi.wfoGetEngagement(selectedEng.id);
            setSelectedEng(updated);
          }
          await load();
        }}
      />
    </div>
  );
}

function CreateEngagementForm({ onCreated }: { onCreated: (e: any) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const fd = new FormData(e.currentTarget);
    try {
      const eng = await workforceApi.wfoCreateEngagement({
        name: String(fd.get('name') ?? ''),
        engagementType: String(fd.get('engagementType') ?? 'EVENT'),
        startsAt: String(fd.get('startsAt')),
        endsAt: String(fd.get('endsAt')),
        perDiemAllowed: fd.get('perDiemAllowed') === 'on',
        perDiemAmount: fd.get('perDiemAmount') ? Number(fd.get('perDiemAmount')) : undefined,
      });
      await onCreated(eng);
    } catch (err: any) {
      setError(err.message || 'Creation failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 grid gap-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <Label size="xsmall" weight="plus">Engagement name</Label>
        <Input required name="name" placeholder="Seattle Summer Festival / Plant A Overhaul" />
      </div>
      <div>
        <Label size="xsmall" weight="plus">Type</Label>
        <select name="engagementType" className={selectClass}>
          <option value="EVENT">Event</option>
          <option value="PROJECT">Project</option>
          <option value="WORK_ORDER">Work Order</option>
          <option value="ROSTER_PERIOD">Roster Period</option>
          <option value="SHOOT_DAY">Shoot Day</option>
          <option value="DUTY_ROSTER">Duty Roster</option>
        </select>
      </div>
      <div>
        <Label size="xsmall" weight="plus">Starts at</Label>
        <Input required type="date" name="startsAt" />
      </div>
      <div>
        <Label size="xsmall" weight="plus">Ends at</Label>
        <Input required type="date" name="endsAt" />
      </div>
      <div>
        <Label size="xsmall" weight="plus">Per diem amount (optional)</Label>
        <Input type="number" step="0.01" name="perDiemAmount" placeholder="50.00" />
      </div>
      {error && <Alert variant="error" className="md:col-span-2">{error}</Alert>}
      <Button type="submit" isLoading={saving} className="md:col-span-2">Create engagement</Button>
    </form>
  );
}

function EngagementPositionsPanel({ engagement, onChanged }: { engagement: any | null; onChanged: () => Promise<void> }) {
  const [positions, setPositions] = useState<any[]>([]);
  const [showAddPos, setShowAddPos] = useState(false);
  const [showBulkInvite, setShowBulkInvite] = useState(false);

  useEffect(() => {
    if (!engagement) return;
    workforceApi
      .wfoListEngagementPositions(engagement.id)
      .then(setPositions)
      .catch(() => {});
  }, [engagement]);

  if (!engagement) {
    return (
      <Container className="p-5">
        <Heading level="h2">Engagement details</Heading>
        <Text size="small" className="mt-3 text-ui-fg-subtle">
          Select an engagement to view staffing quotas, positions, and publishing options.
        </Text>
      </Container>
    );
  }

  async function publish() {
    try {
      await workforceApi.wfoPublishEngagement(engagement.id);
      await onChanged();
    } catch {}
  }

  return (
    <aside aria-label="Engagement details">
      <Container className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Heading level="h2">{engagement.name}</Heading>
            <p className="mt-1 text-xs text-ui-fg-subtle">{engagement.startsAt} to {engagement.endsAt}</p>
          </div>
          <StatusBadge color={engagement.status === 'PUBLISHED' ? 'green' : 'grey'}>
            {engagement.status}
          </StatusBadge>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {engagement.status !== 'PUBLISHED' && (
            <Button size="small" onClick={publish}>Publish engagement</Button>
          )}
          <Button size="small" variant="secondary" onClick={() => setShowAddPos((v) => !v)}>
            Add position
          </Button>
          <Button size="small" variant="secondary" onClick={() => setShowBulkInvite(true)}>
            Bulk invite crew
          </Button>
        </div>

        {showBulkInvite && (
          <BulkInviteModal
            engagementId={engagement.id}
            onClose={() => setShowBulkInvite(false)}
            onSuccess={async () => {
              setShowBulkInvite(false);
              await onChanged();
            }}
          />
        )}

        {showAddPos && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              await workforceApi.wfoCreateEngagementPosition(engagement.id, {
                title: String(fd.get('title')),
                quantity: Number(fd.get('quantity') || 1),
                rateType: String(fd.get('rateType') || 'HOURLY'),
                rateAmount: Number(fd.get('rateAmount') || 0),
              });
              setShowAddPos(false);
              const updated = await workforceApi.wfoListEngagementPositions(engagement.id);
              setPositions(updated);
              await onChanged();
            }}
            className="mt-4 space-y-2 rounded-lg bg-ui-bg-subtle p-3"
          >
            <Input required name="title" placeholder="Position title (e.g. Lead Rigger, Operator)" />
            <div className="grid grid-cols-2 gap-2">
              <Input required type="number" min="1" name="quantity" placeholder="Quota (e.g. 5)" />
              <Input required type="number" step="0.01" min="0" name="rateAmount" placeholder="Rate ($)" />
            </div>
            <select name="rateType" className={selectClass}>
              <option value="HOURLY">Hourly</option>
              <option value="DAILY">Daily</option>
              <option value="FLAT">Flat</option>
            </select>
            <Button size="small" type="submit" className="w-full">Save position</Button>
          </form>
        )}

        <Heading level="h3" className="mt-6">Positions & Staffing ({positions.length})</Heading>
        {positions.length === 0 ? (
          <Text size="small" className="mt-2 text-ui-fg-subtle">No positions defined for this engagement.</Text>
        ) : (
          <ul className="mt-3 space-y-2">
            {positions.map((p) => (
              <li key={p.id} className="rounded-md border border-ui-border-base p-3">
                <div className="flex items-center justify-between">
                  <Text size="small" weight="plus">{p.title}</Text>
                  <StatusBadge color={p.filled >= p.quantity ? 'green' : 'orange'}>
                    {p.filled} / {p.quantity} filled
                  </StatusBadge>
                </div>
                <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                  ${p.rateAmount} ({p.rateType.toLowerCase()})
                </Text>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </aside>
  );
}
