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

const selectClass =
  'h-8 w-full rounded-md bg-ui-bg-field px-2 txt-compact-small text-ui-fg-base shadow-borders-base outline-none transition-fg hover:bg-ui-bg-field-hover focus-visible:shadow-borders-interactive-with-active';

export function WfoWorkerDirectory() {
  const [workers, setWorkers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<any | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await workforceApi.wfoListWorkers({
        search: search || undefined,
        status: statusFilter || undefined,
      });
      setWorkers(res.items);
      setTotal(res.total);
    } catch (err: any) {
      setError(err.message || 'Failed to load workers');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [search, statusFilter]);

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_450px]">
      <Container className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Heading level="h2">Universal Worker Registry</Heading>
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              Cross-industry worker identity, credentials, onboarding progress, and lifecycle status.
            </Text>
          </div>
          <Button type="button" size="small" onClick={() => setShowCreate((v) => !v)}>
            <Plus /> Add worker
          </Button>
        </div>

        {showCreate && (
          <CreateWorkerForm
            onCreated={async (w) => {
              setShowCreate(false);
              setSelectedWorker(w);
              await load();
            }}
          />
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <div className="min-w-[220px] flex-1">
            <Input
              type="text"
              placeholder="Search by name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            aria-label="Lifecycle status"
            className={`${selectClass} w-auto min-w-[180px]`}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="PROSPECT_LEAD">Prospect Lead</option>
            <option value="ONBOARDING">Onboarding</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </div>

        {error && (
          <Alert variant="error" className="mt-4">
            {error}
          </Alert>
        )}

        {workers.length === 0 && !loading ? (
          <div className="mt-5 rounded-lg border border-dashed border-ui-border-strong p-6 text-center">
            <Text weight="plus">No workers found</Text>
            <Text size="small" className="mt-1 text-ui-fg-subtle">
              Create the tenant's first universal worker profile or adjust filters.
            </Text>
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Worker</Table.HeaderCell>
                  <Table.HeaderCell>Type</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                  <Table.HeaderCell>Onboarding</Table.HeaderCell>
                  <Table.HeaderCell>Skills</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {workers.map((w) => (
                  <Table.Row
                    key={w.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedWorker(w)}
                  >
                    <Table.Cell className="py-2">
                      <span className="block txt-compact-small-plus">
                        {w.firstName} {w.lastName}
                      </span>
                      <span className="text-xs text-ui-fg-subtle">{w.email}</span>
                    </Table.Cell>
                    <Table.Cell>{w.workerType}</Table.Cell>
                    <Table.Cell>
                      <StatusBadge color={w.lifecycleStatus === 'ACTIVE' ? 'green' : 'grey'}>
                        {w.lifecycleStatus}
                      </StatusBadge>
                    </Table.Cell>
                    <Table.Cell className="tabular-nums">{w.onboardingPct}%</Table.Cell>
                    <Table.Cell className="tabular-nums">
                      {Array.isArray(w.skills) ? w.skills.length : 0}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        )}
      </Container>

      <WorkerDetailPanel
        worker={selectedWorker}
        onChanged={async () => {
          if (selectedWorker) {
            const updated = await workforceApi.wfoGetWorker(selectedWorker.id);
            setSelectedWorker(updated);
          }
          await load();
        }}
      />
    </div>
  );
}

function CreateWorkerForm({ onCreated }: { onCreated: (w: any) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const fd = new FormData(e.currentTarget);
    try {
      const skillsStr = String(fd.get('skills') || '');
      const skills = skillsStr
        ? skillsStr.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      const worker = await workforceApi.wfoCreateWorker({
        firstName: String(fd.get('firstName') ?? ''),
        lastName: String(fd.get('lastName') ?? ''),
        email: String(fd.get('email') ?? ''),
        phone: String(fd.get('phone') ?? '') || null,
        workerType: String(fd.get('workerType') ?? 'INDIVIDUAL'),
        skills,
      });
      await onCreated(worker);
    } catch (err: any) {
      setError(err.message || 'Creation failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 grid gap-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4 md:grid-cols-2">
      <div>
        <Label size="xsmall" weight="plus">First name</Label>
        <Input required name="firstName" placeholder="Jane" />
      </div>
      <div>
        <Label size="xsmall" weight="plus">Last name</Label>
        <Input required name="lastName" placeholder="Doe" />
      </div>
      <div>
        <Label size="xsmall" weight="plus">Email address</Label>
        <Input required type="email" name="email" placeholder="jane.doe@example.com" />
      </div>
      <div>
        <Label size="xsmall" weight="plus">Worker type</Label>
        <select name="workerType" className={selectClass}>
          <option value="INDIVIDUAL">Individual (Direct)</option>
          <option value="AGENCY">Agency</option>
          <option value="TPV">Third-Party Vendor</option>
          <option value="CONTINGENT">Contingent</option>
        </select>
      </div>
      <div className="md:col-span-2">
        <Label size="xsmall" weight="plus">Skills (comma-separated)</Label>
        <Input name="skills" placeholder="Rigging, Audio Engineering, Forklift" />
      </div>
      {error && <Alert variant="error" className="md:col-span-2">{error}</Alert>}
      <Button type="submit" isLoading={saving} className="md:col-span-2">Create universal worker</Button>
    </form>
  );
}

function WorkerDetailPanel({ worker, onChanged }: { worker: any | null; onChanged: () => Promise<void> }) {
  const [docs, setDocs] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [showAddDoc, setShowAddDoc] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!worker) return;
    setLoadingDocs(true);
    workforceApi
      .wfoListComplianceDocs(worker.id)
      .then(setDocs)
      .catch(() => {})
      .finally(() => setLoadingDocs(false));
  }, [worker]);

  if (!worker) {
    return (
      <Container className="p-5">
        <Heading level="h2">Worker details</Heading>
        <Text size="small" className="mt-3 text-ui-fg-subtle">
          Select a worker to inspect compliance documents, identity records, and lifecycle actions.
        </Text>
      </Container>
    );
  }

  async function approveWorker() {
    try {
      await workforceApi.wfoApproveWorker(worker.id);
      await onChanged();
    } catch {}
  }

  async function verifyDoc(docId: string, decision: 'APPROVE' | 'REJECT') {
    setVerifying(true);
    try {
      await workforceApi.wfoVerifyComplianceDoc(worker.id, docId, { decision });
      const updatedDocs = await workforceApi.wfoListComplianceDocs(worker.id);
      setDocs(updatedDocs);
      await onChanged();
    } catch {}
    finally {
      setVerifying(false);
    }
  }

  return (
    <aside aria-label="Worker details">
      <Container className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Heading level="h2">{worker.firstName} {worker.lastName}</Heading>
            <p className="mt-1 font-mono text-xs text-ui-fg-subtle">{worker.email}</p>
          </div>
          <StatusBadge color={worker.lifecycleStatus === 'ACTIVE' ? 'green' : 'grey'}>
            {worker.lifecycleStatus}
          </StatusBadge>
        </div>

        <div className="mt-4 flex gap-2">
          {worker.lifecycleStatus !== 'ACTIVE' && (
            <Button size="small" onClick={approveWorker}>Activate worker</Button>
          )}
          <Button size="small" variant="secondary" onClick={() => setShowAddDoc((v) => !v)}>
            Add compliance doc
          </Button>
        </div>

        {showAddDoc && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              await workforceApi.wfoAddComplianceDoc(worker.id, {
                docType: String(fd.get('docType')),
                fileUrl: String(fd.get('fileUrl')),
                expiresAt: String(fd.get('expiresAt')) || undefined,
              });
              setShowAddDoc(false);
              const updatedDocs = await workforceApi.wfoListComplianceDocs(worker.id);
              setDocs(updatedDocs);
              await onChanged();
            }}
            className="mt-4 space-y-2 rounded-lg bg-ui-bg-subtle p-3"
          >
            <Input required name="docType" placeholder="Document type (e.g. I9, OSHA)" />
            <Input required type="url" name="fileUrl" placeholder="https://storage.../file.pdf" />
            <Input type="date" name="expiresAt" />
            <Button size="small" type="submit" className="w-full">Upload document</Button>
          </form>
        )}

        <Heading level="h3" className="mt-6">Compliance documents ({docs.length})</Heading>
        {docs.length === 0 ? (
          <Text size="small" className="mt-2 text-ui-fg-subtle">No compliance documents uploaded.</Text>
        ) : (
          <ul className="mt-3 space-y-2">
            {docs.map((d) => (
              <li key={d.id} className="rounded-md border border-ui-border-base p-3">
                <div className="flex items-center justify-between">
                  <Text size="small" weight="plus">{d.docType}</Text>
                  <StatusBadge color={d.status === 'APPROVED' ? 'green' : d.status === 'REJECTED' ? 'red' : 'grey'}>
                    {d.status}
                  </StatusBadge>
                </div>
                {d.expiresAt && <Text size="xsmall" className="text-ui-fg-subtle">Expires: {d.expiresAt}</Text>}
                {d.status === 'PENDING' && (
                  <div className="mt-2 flex gap-2">
                    <Button size="small" isLoading={verifying} onClick={() => verifyDoc(d.id, 'APPROVE')}>Verify</Button>
                    <Button size="small" variant="secondary" isLoading={verifying} onClick={() => verifyDoc(d.id, 'REJECT')}>Reject</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Container>
    </aside>
  );
}
