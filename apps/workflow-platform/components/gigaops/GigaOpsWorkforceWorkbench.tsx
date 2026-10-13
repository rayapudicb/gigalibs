'use client';

import { workforceApi, type WorkforceApiError } from '@/lib/workforce-api';
import type {
  CapabilityDefinitionV1,
  WorkforceQualificationStatusV1,
  WorkforceResourceDetailV1,
  WorkforceResourcePageV1,
  WorkforceResourceTypeV1,
} from '@gigalibs/contracts';
import {
  ArrowPath,
  BadgeCheck,
  Calendar,
  Cash,
  CheckCircle,
  Clock,
  ExclamationCircle,
  IdBadge,
  Plus,
  ShieldCheck,
  Spinner,
  SquareTwoStack,
  Users,
} from '@medusajs/icons';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Container,
  Heading,
  Input,
  Label,
  StatusBadge,
  Table,
  Text,
  Textarea,
} from '@medusajs/ui';
import Link from 'next/link';
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { PlantOperationsHub } from './PlantOperationsHub';
import { AvailabilityAndAbsence } from './AvailabilityAndAbsence';
import { DispatchBoard } from './DispatchBoard';
import { JobsAndPositions } from './JobsAndPositions';
import { PayReadiness } from './PayReadiness';
import { TimeAndAttendance } from './TimeAndAttendance';
import { GIGAOPS_SECTIONS, type GigaOpsSection } from './sections';

const sectionMeta: Readonly<Record<GigaOpsSection, {
  label: string;
  description: string;
  available: boolean;
}>> = {
  overview: { label: 'Operations overview', description: 'Live tenant workforce foundation status.', available: true },
  resources: { label: 'Resource directory', description: 'People, teams and shared labor pools.', available: true },
  jobs: { label: 'Jobs & positions', description: 'Dated job profiles, positions at your sites and the people engaged in them.', available: true },
  capabilities: { label: 'Skills & qualifications', description: 'Reusable capabilities and verified assignments.', available: true },
  availability: { label: 'Availability', description: 'Working weeks, absences with a four-eyes decision, site calendars and who is available.', available: true },
  scheduling: { label: 'Scheduling & dispatch', description: 'Demand from any source, ranked qualified and available people, and guarded bookings.', available: true },
  time: { label: 'Time & attendance', description: 'Frontline clock-in, geofence muster, and operator rounds.', available: true },
  attendance: { label: 'Clock & timesheets', description: 'Punches checked against the site boundary, weekly timesheets, four-eyes approval and time exceptions.', available: true },
  pay: { label: 'Pay-ready outputs', description: 'Policy packs, dated pay rates and weekly earning lines with a rule trace and four-eyes approval.', available: true },
};

// Native selects keep FormData and empty-value options; this matches the Medusa Input field style.
const selectClass =
  'h-8 w-full rounded-md bg-ui-bg-field px-2 txt-compact-small text-ui-fg-base shadow-borders-base outline-none transition-fg hover:bg-ui-bg-field-hover focus-visible:shadow-borders-interactive-with-active';

const qualificationColor: Record<WorkforceQualificationStatusV1, 'green' | 'orange' | 'grey' | 'red'> = {
  ACTIVE: 'green',
  SUSPENDED: 'orange',
  EXPIRED: 'grey',
  REVOKED: 'red',
};

export function GigaOpsWorkforceWorkbench({ section }: { section: GigaOpsSection }) {
  const [resources, setResources] = useState<WorkforceResourcePageV1 | null>(null);
  const [capabilities, setCapabilities] = useState<readonly CapabilityDefinitionV1[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<WorkforceApiError | null>(null);

  const load = useCallback(async () => {
    if (!sectionMeta[section].available) {
      setLoading(false);
      setError(null);
      return;
    }
    if (section === 'scheduling' || section === 'time' || section === 'attendance' || section === 'pay') {
      setLoading(false);
      setError(null);
      workforceApi.listResources({ pageSize: 100 }).then((r) => setResources(r)).catch(() => {});
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [resourcePage, capabilityPage] = await Promise.all([
        workforceApi.listResources({ pageSize: 100 }),
        workforceApi.listCapabilities(),
      ]);
      setResources(resourcePage);
      setCapabilities(capabilityPage.items);
      setGeneratedAt(resourcePage.generatedAt > capabilityPage.generatedAt
        ? resourcePage.generatedAt
        : capabilityPage.generatedAt);
    } catch (reason) {
      setError(reason as WorkforceApiError);
    } finally {
      setLoading(false);
    }
  }, [section]);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="min-h-full bg-ui-bg-subtle px-[5px] py-5 text-ui-fg-base" aria-labelledby="gigaops-title">
      <div className="mx-auto w-full max-w-[1800px] space-y-5">
        <Container className="p-3">
          <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="GigaOps sections">
            {GIGAOPS_SECTIONS.map((item) => (
              <Button key={item} asChild size="small" variant={section === item ? 'primary' : 'secondary'} className="whitespace-nowrap">
                <Link href={item === 'overview' ? '/gigaops' : `/gigaops/${item}`} aria-current={section === item ? 'page' : undefined}>
                  {sectionMeta[item].label}
                </Link>
              </Button>
            ))}
          </nav>
        </Container>

        {loading ? <LoadingState /> : error ? <ErrorState error={error} retry={load} /> :
          section === 'overview' ? (
            <Overview resources={resources} capabilities={capabilities} generatedAt={generatedAt} />
          ) : section === 'resources' ? (
            <ResourceDirectory initial={resources} capabilities={capabilities} reload={load} />
          ) : section === 'capabilities' ? (
            <CapabilityDirectory capabilities={capabilities} reload={load} />
          ) : section === 'jobs' ? (
            <JobsAndPositions resources={resources?.items ?? []} capabilities={capabilities} />
          ) : section === 'availability' ? (
            <AvailabilityAndAbsence resources={resources?.items ?? []} />
          ) : section === 'scheduling' ? (
            <DispatchBoard capabilities={capabilities} />
          ) : section === 'time' ? (
            <PlantOperationsHub initialTab="time" />
          ) : section === 'attendance' ? (
            <TimeAndAttendance resources={resources?.items ?? []} />
          ) : section === 'pay' ? (
            <PayReadiness resources={resources?.items ?? []} />
          ) : (
            <PlannedSection section={section} />
          )}
      </div>
    </section>
  );
}

function Overview({ resources, capabilities, generatedAt }: {
  resources: WorkforceResourcePageV1 | null;
  capabilities: readonly CapabilityDefinitionV1[];
  generatedAt: string | null;
}) {
  const active = resources?.items.filter((item) => item.status === 'ACTIVE').length ?? 0;
  const qualified = resources?.items.filter((item) => item.qualificationCount > 0).length ?? 0;
  const cards = [
    { label: 'Total resources', value: resources?.total ?? 0, icon: Users },
    { label: 'Active resources', value: active, icon: CheckCircle },
    { label: 'Capability definitions', value: capabilities.length, icon: SquareTwoStack },
    { label: 'Resources with qualifications', value: qualified, icon: BadgeCheck },
  ];
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <Container key={label} className="p-5">
            <Icon className="text-ui-fg-subtle" />
            <p className="mt-4 text-3xl font-semibold tabular-nums text-ui-fg-base">{value}</p>
            <Text size="small" className="mt-1 text-ui-fg-subtle">{label}</Text>
          </Container>
        ))}
      </div>
      <Container className="p-6">
        <Heading level="h2">Start the workforce operating model</Heading>
        {(resources?.total ?? 0) === 0 && capabilities.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-ui-border-strong bg-ui-bg-subtle p-6">
            <Text weight="plus">This tenant has no workforce records yet.</Text>
            <Text size="small" className="mt-2 text-ui-fg-subtle">Create capability definitions first, then add people, teams or resource pools and assign their verified qualifications.</Text>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button asChild size="small"><Link href="/gigaops/capabilities">Define capabilities</Link></Button>
              <Button asChild size="small" variant="secondary"><Link href="/gigaops/resources">Add resources</Link></Button>
            </div>
          </div>
        ) : (
          <Text size="small" className="mt-3 text-ui-fg-subtle">The figures above are calculated from the current tenant’s persisted Workforce records. Scheduling and payroll values are not inferred.</Text>
        )}
        {generatedAt ? <Text size="xsmall" className="mt-5 text-ui-fg-subtle">Read from Workforce at {new Date(generatedAt).toLocaleString()}.</Text> : null}
      </Container>
    </div>
  );
}

function ResourceDirectory({ initial, capabilities, reload }: {
  initial: WorkforceResourcePageV1 | null;
  capabilities: readonly CapabilityDefinitionV1[];
  reload: () => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<WorkforceResourceTypeV1 | ''>('');
  const [selected, setSelected] = useState<WorkforceResourceDetailV1 | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [notice, setNotice] = useState('');
  const filtered = useMemo(() => (initial?.items ?? []).filter((resource) => {
    const matchesQuery = !query || `${resource.displayName} ${resource.referenceCode}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (!type || resource.resourceType === type);
  }), [initial, query, type]);

  async function selectResource(id: string) {
    setNotice('');
    try { setSelected(await workforceApi.getResource(id)); }
    catch (reason) { setNotice((reason as Error).message); }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Container className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Heading level="h2">Resources</Heading>
            <Text size="small" className="mt-1 text-ui-fg-subtle">Persisted people, teams and labor pools.</Text>
          </div>
          <Button type="button" size="small" onClick={() => setShowCreate((value) => !value)}><Plus /> Add resource</Button>
        </div>
        {showCreate ? <CreateResourceForm onCreated={async (resource) => { setShowCreate(false); setSelected(resource); await reload(); }} /> : null}
        <div className="mt-5 flex flex-wrap gap-3">
          <div className="min-w-[220px] flex-1">
            <Input type="text" inputMode="search" enterKeyHint="search" aria-label="Search resources" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or reference" />
          </div>
          <select aria-label="Resource type" value={type} onChange={(event) => setType(event.target.value as WorkforceResourceTypeV1 | '')} className={`${selectClass} w-auto min-w-[180px]`}>
            <option value="">All resource types</option>
            <option value="HUMAN">People</option>
            <option value="TEAM">Teams</option>
            <option value="POOL">Pools</option>
          </select>
        </div>
        {filtered.length === 0 ? <EmptyState title="No matching resources" text="Add the tenant's first resource or change the search filters." /> : (
          <div className="mt-4 overflow-x-auto">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Resource</Table.HeaderCell>
                  <Table.HeaderCell>Type</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                  <Table.HeaderCell>Qualifications</Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {filtered.map((resource) => (
                  <Table.Row key={resource.id} className="cursor-pointer" onClick={() => void selectResource(resource.id)}>
                    <Table.Cell className="py-2">
                      <span className="block txt-compact-small-plus">{resource.displayName}</span>
                      <span className="font-mono text-xs text-ui-fg-subtle">{resource.referenceCode}</span>
                    </Table.Cell>
                    <Table.Cell>{typeLabel(resource.resourceType)}</Table.Cell>
                    <Table.Cell><StatusBadge color={resource.status === 'ACTIVE' ? 'green' : 'grey'}>{statusLabel(resource.status)}</StatusBadge></Table.Cell>
                    <Table.Cell className="tabular-nums">{resource.qualificationCount}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        )}
      </Container>
      <ResourceDetail resource={selected} capabilities={capabilities} notice={notice} onChanged={async () => { if (selected) setSelected(await workforceApi.getResource(selected.id)); await reload(); }} />
    </div>
  );
}

// WI-OI-120n: a Workforce person is linked to the login of the workspace member who is that person, so they can see
// their own jobs, punch time and request absence (one person per login). Members come from the workspace's own list.
interface WorkspaceMember {
  readonly id: string;
  readonly user: { readonly id: string; readonly email: string; readonly name: string | null };
}

function useWorkspaceMembers(): { members: readonly WorkspaceMember[]; failure: string } {
  const [members, setMembers] = useState<readonly WorkspaceMember[]>([]);
  const [failure, setFailure] = useState('');
  useEffect(() => {
    let active = true;
    fetch('/api/control/tenants/current/members', { cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(async (response) => {
        if (!response.ok) throw new Error('Workspace members could not be loaded, so a login cannot be chosen.');
        const payload: unknown = await response.json();
        if (active) setMembers(Array.isArray(payload) ? (payload as WorkspaceMember[]) : []);
      })
      .catch((reason: Error) => active && setFailure(reason.message));
    return () => {
      active = false;
    };
  }, []);
  return { members, failure };
}

const memberLabel = (member: WorkspaceMember) => (member.user.name ? `${member.user.name} (${member.user.email})` : member.user.email);
const RESOURCE_TYPE_LABELS: Readonly<Record<string, string>> = { HUMAN: 'Person', TEAM: 'Team', POOL: 'Resource pool' };
const STATUS_LABELS: Readonly<Record<string, string>> = { ACTIVE: 'Active', INACTIVE: 'Inactive', ARCHIVED: 'Archived' };
const typeLabel = (value: string) => RESOURCE_TYPE_LABELS[value] ?? value;
const statusLabel = (value: string) => STATUS_LABELS[value] ?? value;

function Field({ id, label, className = '', children }: { id: string; label: string; className?: string; children: ReactNode }) {
  return (
    <div className={`flex flex-col gap-y-1.5 ${className}`}>
      <Label htmlFor={id} size="xsmall" weight="plus">{label}</Label>
      {children}
    </div>
  );
}

function CreateResourceForm({ onCreated }: { onCreated: (resource: WorkforceResourceDetailV1) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [resourceType, setResourceType] = useState<WorkforceResourceTypeV1>('HUMAN');
  const { members, failure } = useWorkspaceMembers();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError('');
    const data = new FormData(event.currentTarget);
    const platformUserId = resourceType === 'HUMAN' ? String(data.get('platformUserId') ?? '') : '';
    try {
      const resource = await workforceApi.createResource({
        referenceCode: String(data.get('referenceCode') ?? ''),
        displayName: String(data.get('displayName') ?? ''),
        resourceType,
        ...(platformUserId ? { platformUserId } : {}),
      });
      await onCreated(resource);
    } catch (reason) { setError((reason as Error).message); }
    finally { setSaving(false); }
  }
  return (
    <form onSubmit={submit} className="mt-5 grid gap-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4 md:grid-cols-3">
      <Field id="resource-reference" label="Reference code"><Input id="resource-reference" required name="referenceCode" maxLength={64} className="uppercase" /></Field>
      <Field id="resource-name" label="Display name"><Input id="resource-name" required name="displayName" maxLength={200} /></Field>
      <Field id="resource-type" label="Resource type">
        <select id="resource-type" name="resourceType" className={selectClass} value={resourceType} onChange={(event) => setResourceType(event.target.value as WorkforceResourceTypeV1)}>
          <option value="HUMAN">Person</option>
          <option value="TEAM">Team</option>
          <option value="POOL">Resource pool</option>
        </select>
      </Field>
      {resourceType === 'HUMAN' ? (
        <Field id="resource-login" label="Login (optional)" className="md:col-span-3">
          <select id="resource-login" name="platformUserId" className={selectClass} defaultValue="">
            <option value="">Not linked yet</option>
            {members.map((member) => (
              <option key={member.user.id} value={member.user.id}>{memberLabel(member)}</option>
            ))}
          </select>
          <Text size="xsmall" className="text-ui-fg-subtle">The workspace member who is this person. Linked people see their own jobs, punch time and request absence.</Text>
          {failure ? <Text size="xsmall" className="text-ui-fg-error">{failure}</Text> : null}
        </Field>
      ) : null}
      {error ? <Alert variant="error" role="alert" className="md:col-span-3">{error}</Alert> : null}
      <Button type="submit" isLoading={saving} className="md:col-span-3">Create persisted resource</Button>
    </form>
  );
}

/** Who this person is in the workspace: link, change or clear the login, with the version the screen read. */
function LoginLink({ resource, onChanged }: { resource: WorkforceResourceDetailV1; onChanged: () => Promise<void> }) {
  const { members, failure } = useWorkspaceMembers();
  const [choice, setChoice] = useState(resource.platformUserId ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  useEffect(() => setChoice(resource.platformUserId ?? ''), [resource.platformUserId]);
  const linked = members.find((member) => member.user.id === resource.platformUserId);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await workforceApi.updateResource(resource.id, { expectedVersion: resource.version, platformUserId: choice || null });
      setMessage({ tone: 'info', text: choice ? 'Login linked.' : 'Login unlinked.' });
      await onChanged();
    } catch (reason) {
      setMessage({ tone: 'error', text: (reason as Error).message });
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={(event) => void save(event)} className="mt-5 space-y-2" aria-label="Login">
      <Label htmlFor={`resource-login-${resource.id}`} size="xsmall" weight="plus">Login</Label>
      <Text size="xsmall" className="text-ui-fg-subtle">
        {resource.platformUserId ? `Linked to ${linked ? memberLabel(linked) : 'a member who has left the workspace'}.` : 'Not linked: this person cannot see their own jobs or punch time yet.'}
      </Text>
      <div className="flex gap-2">
        <select id={`resource-login-${resource.id}`} className={selectClass} value={choice} onChange={(event) => setChoice(event.target.value)}>
          <option value="">Not linked</option>
          {members.map((member) => (
            <option key={member.user.id} value={member.user.id}>{memberLabel(member)}</option>
          ))}
        </select>
        <Button type="submit" size="small" variant="secondary" isLoading={saving} disabled={choice === (resource.platformUserId ?? '')}>Save</Button>
      </div>
      {failure ? <Text size="xsmall" className="text-ui-fg-error">{failure}</Text> : null}
      {message ? <Text size="xsmall" role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'text-ui-fg-error' : 'text-ui-fg-subtle'}>{message.text}</Text> : null}
    </form>
  );
}

function ResourceDetail({ resource, capabilities, notice, onChanged }: { resource: WorkforceResourceDetailV1 | null; capabilities: readonly CapabilityDefinitionV1[]; notice: string; onChanged: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  if (!resource) {
    return (
      <aside aria-label="Resource details">
        <Container className="p-5">
          <Heading level="h2">Resource details</Heading>
          <Text size="small" className="mt-3 text-ui-fg-subtle">Select a resource to inspect its persisted status and qualifications.</Text>
          {notice ? <Alert variant="error" role="alert" className="mt-3">{notice}</Alert> : null}
        </Container>
      </aside>
    );
  }
  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage(''); const data = new FormData(event.currentTarget);
    try { await workforceApi.assignCapability(resource!.id, { capabilityDefinitionId: String(data.get('capabilityId')), proficiency: String(data.get('proficiency')) as 'STANDARD' | 'ADVANCED' | 'EXPERT' | 'MASTER', validFrom: new Date().toISOString() }); setMessage('Qualification assigned.'); await onChanged(); }
    catch (reason) { setMessage((reason as Error).message); } finally { setSaving(false); }
  }
  const assignable = capabilities.filter((item) => item.status === 'ACTIVE' && !resource.qualifications.some((qualification) => qualification.capabilityDefinitionId === item.id));
  return (
    <aside aria-label="Resource details">
      <Container className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Heading level="h2">{resource.displayName}</Heading>
            <p className="mt-1 font-mono text-xs text-ui-fg-subtle">{resource.referenceCode}</p>
          </div>
          <StatusBadge color={resource.status === 'ACTIVE' ? 'green' : 'grey'}>{statusLabel(resource.status)}</StatusBadge>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3 txt-compact-small">
          <div><dt className="text-ui-fg-subtle">Type</dt><dd className="mt-1 txt-compact-small-plus">{typeLabel(resource.resourceType)}</dd></div>
          <div><dt className="text-ui-fg-subtle">Version</dt><dd className="mt-1 txt-compact-small-plus">{resource.version}</dd></div>
        </dl>
        {resource.resourceType === 'HUMAN' ? <LoginLink resource={resource} onChanged={onChanged} /> : null}
        <Heading level="h3" className="mt-6">Qualifications</Heading>
        {resource.qualifications.length === 0 ? <Text size="small" className="mt-2 text-ui-fg-subtle">No qualifications assigned.</Text> : (
          <ul className="mt-3 space-y-2">
            {resource.qualifications.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 rounded-md border border-ui-border-base px-3 py-2">
                <div>
                  <Text size="small" weight="plus">{item.capabilityName}</Text>
                  <Text size="xsmall" className="text-ui-fg-subtle">{item.proficiency}</Text>
                </div>
                <StatusBadge color={qualificationColor[item.status]}>{item.status}</StatusBadge>
              </li>
            ))}
          </ul>
        )}
        {assignable.length > 0 ? (
          <form onSubmit={assign} className="mt-4 space-y-3 rounded-lg bg-ui-bg-subtle p-3">
            <select required name="capabilityId" aria-label="Capability" className={selectClass}>
              <option value="">Choose capability</option>
              {assignable.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <select name="proficiency" aria-label="Proficiency" className={selectClass}>
              <option value="STANDARD">Standard</option>
              <option value="ADVANCED">Advanced</option>
              <option value="EXPERT">Expert</option>
              <option value="MASTER">Master</option>
            </select>
            <Button type="submit" isLoading={saving} className="w-full">Assign qualification</Button>
          </form>
        ) : null}
        {message ? <Text size="small" role="status" className="mt-3 text-ui-fg-subtle">{message}</Text> : null}
      </Container>
    </aside>
  );
}

function CapabilityDirectory({ capabilities, reload }: { capabilities: readonly CapabilityDefinitionV1[]; reload: () => Promise<void> }) {
  const [saving, setSaving] = useState(false); const [message, setMessage] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); setMessage(''); const form = event.currentTarget; const data = new FormData(form); try { await workforceApi.createCapability({ code: String(data.get('code')), name: String(data.get('name')), description: String(data.get('description') || '') || null, evidenceRequired: data.get('evidenceRequired') === 'on' }); form.reset(); setMessage('Capability definition created.'); await reload(); } catch (reason) { setMessage((reason as Error).message); } finally { setSaving(false); } }
  return (
    <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
      <Container className="p-5">
        <Heading level="h2">Create capability</Heading>
        <Text size="small" className="mt-1 text-ui-fg-subtle">Define a reusable tenant qualification.</Text>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <Field id="capability-code" label="Code"><Input id="capability-code" required name="code" maxLength={64} className="uppercase" /></Field>
          <Field id="capability-name" label="Name"><Input id="capability-name" required name="name" maxLength={160} /></Field>
          <Field id="capability-description" label="Description"><Textarea id="capability-description" name="description" maxLength={1000} rows={3} /></Field>
          <div className="flex items-center gap-x-2">
            <Checkbox id="capability-evidence" name="evidenceRequired" />
            <Label htmlFor="capability-evidence" size="small">Evidence is required</Label>
          </div>
          <Button type="submit" isLoading={saving} className="w-full">Create definition</Button>
          {message ? <Text size="small" role="status" className="text-ui-fg-subtle">{message}</Text> : null}
        </form>
      </Container>
      <Container className="p-5">
        <Heading level="h2">Capability catalogue</Heading>
        {capabilities.length === 0 ? <EmptyState title="No capabilities defined" text="Use the form to define the tenant's first qualification." /> : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {capabilities.map((item) => (
              <div key={item.id} className="rounded-lg border border-ui-border-base p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Text size="small" weight="plus">{item.name}</Text>
                    <p className="mt-1 font-mono text-xs text-ui-fg-subtle">{item.code}</p>
                  </div>
                  <StatusBadge color={item.status === 'ACTIVE' ? 'green' : 'grey'}>{item.status}</StatusBadge>
                </div>
                <Text size="small" className="mt-3 text-ui-fg-subtle">{item.description || 'No description provided.'}</Text>
                <Text size="xsmall" className="mt-4 text-ui-fg-subtle">{item.assignedResourceCount} assigned · Evidence {item.evidenceRequired ? 'required' : 'optional'}</Text>
              </div>
            ))}
          </div>
        )}
      </Container>
    </div>
  );
}

function PlannedSection({ section }: { section: Exclude<GigaOpsSection, 'overview' | 'workers' | 'engagements' | 'resources' | 'capabilities' | 'jobs' | 'availability' | 'scheduling' | 'attendance' | 'pay' | 'expenses' | 'compliance' | 'analytics'> }) {
  const icons = { jobs: IdBadge, availability: Calendar, scheduling: Calendar, time: Clock, pay: Cash, compliance: ShieldCheck, analytics: SquareTwoStack };
  const Icon = icons[section];
  return (
    <Container className="p-7">
      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-ui-tag-orange-bg text-ui-tag-orange-icon"><Icon /></div>
      <Heading level="h2" className="mt-5">{sectionMeta[section].label} is visible but not activated</Heading>
      <Text size="small" className="mt-3 max-w-3xl text-ui-fg-subtle">This section depends on a separate persisted business vertical and certification gate. It will not display invented schedules, time, pay, compliance, or analytics values. The shared resource and capability foundation can be used now.</Text>
      <Alert variant="warning" className="mt-5"><strong>Current boundary:</strong> navigation and dependency contract are present; business actions remain unavailable until their stable work item is implemented and verified.</Alert>
    </Container>
  );
}

function LoadingState() {
  return (
    <Container className="flex min-h-72 items-center justify-center gap-x-3 text-ui-fg-subtle" role="status">
      <Spinner className="animate-spin" /> <Text size="small">Loading tenant Workforce records…</Text>
    </Container>
  );
}

function ErrorState({ error, retry }: { error: WorkforceApiError; retry: () => Promise<void> }) {
  const denied = error.status === 403;
  return (
    <Container className="p-7" role="alert">
      <ExclamationCircle className="text-ui-fg-error" />
      <Heading level="h2" className="mt-4">{denied ? 'Workforce access is not enabled' : 'Workforce data could not be loaded'}</Heading>
      <Text size="small" className="mt-2 text-ui-fg-subtle">{error.message}</Text>
      <Button type="button" variant="secondary" size="small" onClick={() => void retry()} className="mt-5"><ArrowPath /> Retry</Button>
    </Container>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="mt-5 rounded-lg border border-dashed border-ui-border-strong bg-ui-bg-subtle p-6">
      <Text weight="plus">{title}</Text>
      <Text size="small" className="mt-2 text-ui-fg-subtle">{text}</Text>
    </div>
  );
}
