'use client';

import { SiteSelect, useSites } from '@/components/geospatial/SitePicker';
import { type WorkforceApiError, workforceApi } from '@/lib/workforce-api';
import type {
  CapabilityDefinitionV1,
  JobProfileDetailV1,
  JobProfileV1,
  PositionDetailV1,
  PositionV1,
  WorkerCategoryV1,
  WorkforceResourceV1,
} from '@gigalibs/contracts';
import { ArrowPath, Plus, Spinner } from '@medusajs/icons';
import { Alert, Button, Container, Heading, Input, Label, StatusBadge, Table, Text, Textarea } from '@medusajs/ui';
import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';

// Native selects keep FormData and empty options; this matches the Medusa Input field style.
const selectClass =
  'h-8 w-full rounded-md bg-ui-bg-field px-2 txt-compact-small text-ui-fg-base shadow-borders-base outline-none transition-fg hover:bg-ui-bg-field-hover focus-visible:shadow-borders-interactive-with-active';
const CATEGORIES: readonly WorkerCategoryV1[] = ['EMPLOYEE', 'CONTRACTOR', 'AGENCY', 'VOLUNTEER'];
const categoryLabel: Record<WorkerCategoryV1, string> = { EMPLOYEE: 'Employee', CONTRACTOR: 'Contractor', AGENCY: 'Agency', VOLUNTEER: 'Volunteer' };
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Jobs & positions (WI-OI-065): effective-dated job profiles, positions at Geospatial sites and the people
 * engaged in them. Everything shown is read from the tenant's Workforce records as of the chosen date.
 */
export function JobsAndPositions({ resources, capabilities }: {
  resources: readonly WorkforceResourceV1[];
  capabilities: readonly CapabilityDefinitionV1[];
}) {
  const [asOf, setAsOf] = useState(today());
  const [profiles, setProfiles] = useState<readonly JobProfileV1[] | null>(null);
  const [positions, setPositions] = useState<readonly PositionV1[] | null>(null);
  const [vacantOnly, setVacantOnly] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<JobProfileDetailV1 | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<PositionDetailV1 | null>(null);
  const [error, setError] = useState<WorkforceApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const { sites, siteName } = useSites();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profilePage, positionPage] = await Promise.all([
        workforceApi.listJobProfiles(asOf),
        workforceApi.listPositions({ asOf, vacantOnly }),
      ]);
      setProfiles(profilePage.items);
      setPositions(positionPage.items);
    } catch (reason) {
      setError(reason as WorkforceApiError);
    } finally {
      setLoading(false);
    }
  }, [asOf, vacantOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !profiles) {
    return (
      <Container className="flex items-center gap-3 p-6" aria-busy="true">
        <Spinner className="animate-spin text-ui-fg-subtle" />
        <Text size="small" className="text-ui-fg-subtle">Loading jobs and positions…</Text>
      </Container>
    );
  }
  if (error && !profiles) {
    return (
      <Container className="p-6" role="alert">
        <Heading level="h2">{error.status === 403 ? 'You do not have access to jobs and positions' : 'Could not load jobs and positions'}</Heading>
        <Text size="small" className="mt-1 text-ui-fg-subtle">{error.status === 403 ? 'Ask a tenant administrator for Workforce job access.' : error.message}</Text>
        {error.status === 403 ? null : <Button type="button" size="small" variant="secondary" className="mt-4" onClick={() => void load()}><ArrowPath /> Try again</Button>}
      </Container>
    );
  }

  const people = resources.filter((resource) => resource.resourceType === 'HUMAN' && resource.status === 'ACTIVE');
  const filled = (positions ?? []).filter((position) => position.incumbent).length;

  return (
    <div className="space-y-5">
      <Container className="flex flex-wrap items-end justify-between gap-4 p-5">
        <div>
          <Heading level="h2">Organisation as of {asOf}</Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            {profiles?.length ?? 0} job profile(s) · {positions?.length ?? 0} position(s) · {filled} filled, {(positions?.length ?? 0) - filled} vacant
          </Text>
        </div>
        <div className="flex flex-col gap-y-1.5">
          <Label htmlFor="jobs-as-of" size="xsmall" weight="plus">View as of</Label>
          <Input id="jobs-as-of" type="date" value={asOf} onChange={(event) => event.target.value && setAsOf(event.target.value)} />
        </div>
      </Container>

      <div className="grid gap-5 xl:grid-cols-2">
        <ProfilesPanel
          profiles={profiles ?? []}
          capabilities={capabilities}
          selected={selectedProfile}
          onSelect={async (id) => setSelectedProfile(await workforceApi.getJobProfile(id))}
          onChanged={async (profile) => {
            setSelectedProfile(profile);
            await load();
          }}
        />
        <PositionsPanel
          positions={positions ?? []}
          profiles={profiles ?? []}
          sites={sites}
          siteName={siteName}
          vacantOnly={vacantOnly}
          setVacantOnly={setVacantOnly}
          onSelect={async (id) => setSelectedPosition(await workforceApi.getPosition(id))}
          onCreated={async (position) => {
            setSelectedPosition(position);
            await load();
          }}
        />
      </div>
      {selectedPosition ? (
        <PositionDetail
          position={selectedPosition}
          people={people}
          siteName={siteName}
          onChanged={async (position) => {
            setSelectedPosition(position);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function ProfilesPanel({ profiles, capabilities, selected, onSelect, onChanged }: {
  profiles: readonly JobProfileV1[];
  capabilities: readonly CapabilityDefinitionV1[];
  selected: JobProfileDetailV1 | null;
  onSelect: (id: string) => Promise<void>;
  onChanged: (profile: JobProfileDetailV1) => Promise<void>;
}) {
  const [showCreate, setShowCreate] = useState(false);
  return (
    <Container className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Heading level="h2">Job profiles</Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">What each role is and what it requires, dated.</Text>
        </div>
        <Button type="button" size="small" onClick={() => setShowCreate((value) => !value)}><Plus /> New profile</Button>
      </div>
      {showCreate ? (
        <ProfileForm capabilities={capabilities} onSaved={async (profile) => { setShowCreate(false); await onChanged(profile); }} />
      ) : null}
      {profiles.length === 0 ? (
        <Empty title="No job profiles" text="Define the roles you staff, with the capabilities each requires, then create positions for them." />
      ) : (
        <div className="mt-4 overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Profile</Table.HeaderCell>
                <Table.HeaderCell>Category</Table.HeaderCell>
                <Table.HeaderCell>Requires</Table.HeaderCell>
                <Table.HeaderCell>Positions</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {profiles.map((profile) => (
                <Table.Row key={profile.id} className={`cursor-pointer ${selected?.id === profile.id ? 'bg-ui-bg-highlight' : ''}`} onClick={() => void onSelect(profile.id)}>
                  <Table.Cell className="py-2">
                    <span className="block txt-compact-small-plus">{profile.current?.title ?? 'Not in force on this date'}</span>
                    <span className="font-mono text-xs text-ui-fg-subtle">{profile.code}{profile.status === 'INACTIVE' ? ' · inactive' : ''}</span>
                  </Table.Cell>
                  <Table.Cell>{profile.current ? categoryLabel[profile.current.workerCategory] : '—'}</Table.Cell>
                  <Table.Cell>{profile.current?.requiredCapabilities.length ?? 0} capability(ies)</Table.Cell>
                  <Table.Cell className="tabular-nums">{profile.positionCount}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}
      {selected ? <ProfileDetail profile={selected} capabilities={capabilities} onChanged={onChanged} /> : null}
    </Container>
  );
}

function CapabilityPicker({ capabilities, selected }: { capabilities: readonly CapabilityDefinitionV1[]; selected?: readonly string[] }) {
  const active = capabilities.filter((capability) => capability.status === 'ACTIVE');
  if (active.length === 0) return <Text size="xsmall" className="text-ui-fg-subtle">No active capabilities yet; define them under Skills & qualifications.</Text>;
  return (
    <fieldset className="grid gap-1 sm:grid-cols-2">
      <legend className="sr-only">Required capabilities</legend>
      {active.map((capability) => (
        <label key={capability.id} className="flex items-center gap-2 txt-compact-small">
          <input type="checkbox" name="capability" value={capability.id} defaultChecked={selected?.includes(capability.id)} />
          {capability.name} <span className="font-mono text-xs text-ui-fg-subtle">{capability.code}</span>
        </label>
      ))}
    </fieldset>
  );
}

function ProfileForm({ profile, capabilities, onSaved }: {
  profile?: JobProfileDetailV1;
  capabilities: readonly CapabilityDefinitionV1[];
  onSaved: (profile: JobProfileDetailV1) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<WorkforceApiError | null>(null);
  const base = profile?.revisions.at(-1);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const fields = {
      effectiveFrom: String(data.get('effectiveFrom')),
      title: String(data.get('title') ?? ''),
      description: String(data.get('description') ?? '').trim() || null,
      workerCategory: String(data.get('workerCategory')) as WorkerCategoryV1,
      requiredCapabilities: data.getAll('capability').map((id) => ({ capabilityDefinitionId: String(id), minimumProficiency: 'STANDARD' as const })),
    };
    try {
      const saved = profile
        ? await workforceApi.reviseJobProfile(profile.id, { expectedVersion: profile.version, ...fields })
        : await workforceApi.createJobProfile({ code: String(data.get('code') ?? ''), ...fields });
      await onSaved(saved);
    } catch (reason) {
      setError(reason as WorkforceApiError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 grid gap-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4 md:grid-cols-2">
      {profile ? null : <Field id="profile-code" label="Code"><Input id="profile-code" name="code" required maxLength={64} className="uppercase" /></Field>}
      <Field id={`profile-from-${profile?.id ?? 'new'}`} label={profile ? 'New definition takes effect' : 'Effective from'}>
        <Input id={`profile-from-${profile?.id ?? 'new'}`} name="effectiveFrom" type="date" required defaultValue={today()} />
      </Field>
      <Field id={`profile-title-${profile?.id ?? 'new'}`} label="Title"><Input id={`profile-title-${profile?.id ?? 'new'}`} name="title" required maxLength={200} defaultValue={base?.title} /></Field>
      <Field id={`profile-category-${profile?.id ?? 'new'}`} label="Worker category">
        <select id={`profile-category-${profile?.id ?? 'new'}`} name="workerCategory" defaultValue={base?.workerCategory ?? 'EMPLOYEE'} className={selectClass}>
          {CATEGORIES.map((category) => <option key={category} value={category}>{categoryLabel[category]}</option>)}
        </select>
      </Field>
      <Field id={`profile-description-${profile?.id ?? 'new'}`} label="Description" className="md:col-span-2">
        <Textarea id={`profile-description-${profile?.id ?? 'new'}`} name="description" rows={2} maxLength={2000} defaultValue={base?.description ?? ''} />
      </Field>
      <div className="md:col-span-2">
        <Text size="xsmall" weight="plus" className="mb-1.5">Required capabilities</Text>
        <CapabilityPicker capabilities={capabilities} selected={base?.requiredCapabilities.map((item) => item.capabilityDefinitionId)} />
      </div>
      {error ? <Alert variant={error.status === 409 ? 'warning' : 'error'} role="alert" className="md:col-span-2">{error.message}</Alert> : null}
      <Button type="submit" size="small" isLoading={saving} className="md:col-span-2">{profile ? 'Save new definition' : 'Create job profile'}</Button>
    </form>
  );
}

function ProfileDetail({ profile, capabilities, onChanged }: {
  profile: JobProfileDetailV1;
  capabilities: readonly CapabilityDefinitionV1[];
  onChanged: (profile: JobProfileDetailV1) => Promise<void>;
}) {
  const [revising, setRevising] = useState(false);
  useEffect(() => setRevising(false), [profile.id, profile.version]);
  return (
    <section className="mt-5 border-t border-ui-border-base pt-4" aria-label={`Job profile ${profile.code}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Heading level="h3">{profile.code} history</Heading>
        <Button type="button" size="small" variant="secondary" onClick={() => setRevising((value) => !value)}>{revising ? 'Close' : 'Change from a date…'}</Button>
      </div>
      {revising ? <ProfileForm profile={profile} capabilities={capabilities} onSaved={onChanged} /> : null}
      <ol className="mt-3 space-y-2">
        {[...profile.revisions].reverse().map((revision) => (
          <li key={revision.id} className="rounded-md border border-ui-border-base p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Text size="small" weight="plus">{revision.title}</Text>
              <Text size="xsmall" className="text-ui-fg-subtle">{revision.effectiveFrom} → {revision.effectiveTo ?? 'open'}</Text>
            </div>
            <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
              {categoryLabel[revision.workerCategory]}
              {revision.requiredCapabilities.length ? ` · requires ${revision.requiredCapabilities.map((item) => item.capabilityName ?? item.capabilityCode ?? 'capability').join(', ')}` : ''}
            </Text>
          </li>
        ))}
      </ol>
    </section>
  );
}

function PositionsPanel({ positions, profiles, sites, siteName, vacantOnly, setVacantOnly, onSelect, onCreated }: {
  positions: readonly PositionV1[];
  profiles: readonly JobProfileV1[];
  sites: ReturnType<typeof useSites>['sites'];
  siteName: (siteRef: string | null) => string;
  vacantOnly: boolean;
  setVacantOnly: (value: boolean) => void;
  onSelect: (id: string) => Promise<void>;
  onCreated: (position: PositionDetailV1) => Promise<void>;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<WorkforceApiError | null>(null);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      const position = await workforceApi.createPosition({
        code: String(data.get('code') ?? ''),
        jobProfileId: String(data.get('jobProfileId')),
        siteRef: String(data.get('siteRef') ?? '') || null,
        fte: Number(data.get('fte') || 1),
        effectiveFrom: String(data.get('effectiveFrom')),
        effectiveTo: String(data.get('effectiveTo') ?? '') || null,
      });
      setShowCreate(false);
      await onCreated(position);
    } catch (reason) {
      setError(reason as WorkforceApiError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Container className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Heading level="h2">Positions</Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">Seats at your sites; one incumbent at a time.</Text>
        </div>
        <Button type="button" size="small" disabled={profiles.length === 0} onClick={() => setShowCreate((value) => !value)}><Plus /> New position</Button>
      </div>
      {showCreate ? (
        <form onSubmit={create} className="mt-4 grid gap-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4 md:grid-cols-2">
          <Field id="position-code" label="Code"><Input id="position-code" name="code" required maxLength={64} className="uppercase" /></Field>
          <Field id="position-profile" label="Job profile">
            <select id="position-profile" name="jobProfileId" required defaultValue="" className={selectClass}>
              <option value="" disabled>Select a profile</option>
              {profiles.filter((profile) => profile.status === 'ACTIVE').map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.current?.title ?? profile.code} ({profile.code})</option>
              ))}
            </select>
          </Field>
          <Field id="position-site" label="Site"><SiteSelect id="position-site" name="siteRef" sites={sites} /></Field>
          <Field id="position-fte" label="FTE"><Input id="position-fte" name="fte" type="number" min="0.05" max="1" step="0.05" defaultValue="1" /></Field>
          <Field id="position-from" label="From"><Input id="position-from" name="effectiveFrom" type="date" required defaultValue={today()} /></Field>
          <Field id="position-to" label="Until (optional)"><Input id="position-to" name="effectiveTo" type="date" /></Field>
          {error ? <Alert variant="error" role="alert" className="md:col-span-2">{error.message}</Alert> : null}
          <Button type="submit" size="small" isLoading={saving} className="md:col-span-2">Create position</Button>
        </form>
      ) : null}
      <label className="mt-4 flex items-center gap-2 txt-compact-small">
        <input type="checkbox" checked={vacantOnly} onChange={(event) => setVacantOnly(event.target.checked)} /> Vacant only
      </label>
      {positions.length === 0 ? (
        <Empty title={vacantOnly ? 'No vacant positions' : 'No positions'} text={profiles.length === 0 ? 'Create a job profile first.' : 'Create positions for your job profiles at their sites.'} />
      ) : (
        <div className="mt-3 overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Position</Table.HeaderCell>
                <Table.HeaderCell>Site</Table.HeaderCell>
                <Table.HeaderCell>Incumbent</Table.HeaderCell>
                <Table.HeaderCell>State</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {positions.map((position) => (
                <Table.Row key={position.id} className="cursor-pointer" onClick={() => void onSelect(position.id)}>
                  <Table.Cell className="py-2">
                    <span className="block txt-compact-small-plus">{position.title ?? position.jobProfileCode}</span>
                    <span className="font-mono text-xs text-ui-fg-subtle">{position.code} · {position.fte} FTE</span>
                  </Table.Cell>
                  <Table.Cell>{siteName(position.siteRef)}</Table.Cell>
                  <Table.Cell>{position.incumbent ? position.incumbent.resourceName : '—'}</Table.Cell>
                  <Table.Cell>
                    {position.status !== 'OPEN' ? <StatusBadge color="grey">{position.status}</StatusBadge> : position.incumbent ? <StatusBadge color="green">Filled</StatusBadge> : <StatusBadge color="orange">Vacant</StatusBadge>}
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

function PositionDetail({ position, people, siteName, onChanged }: {
  position: PositionDetailV1;
  people: readonly WorkforceResourceV1[];
  siteName: (siteRef: string | null) => string;
  onChanged: (position: PositionDetailV1) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<WorkforceApiError | null>(null);
  useEffect(() => setError(null), [position.id]);

  async function run(action: () => Promise<PositionDetailV1>, form?: HTMLFormElement) {
    setBusy(true);
    setError(null);
    try {
      await onChanged(await action());
      form?.reset();
    } catch (reason) {
      setError(reason as WorkforceApiError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container className="p-5" aria-label={`Position ${position.code}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Text size="xsmall" className="font-mono text-ui-fg-subtle">{position.code} · v{position.version}</Text>
          <Heading level="h2" className="mt-1">{position.title ?? position.jobProfileCode}</Heading>
          <Text size="small" className="mt-1 text-ui-fg-subtle">
            {siteName(position.siteRef)} · {position.fte} FTE · {position.effectiveFrom} → {position.effectiveTo ?? 'open'} · {position.status.toLowerCase()}
          </Text>
        </div>
      </div>
      {error ? <Alert variant={error.status === 409 ? 'warning' : 'error'} role="alert" className="mt-3">{error.message}</Alert> : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section aria-label="Engagements">
          <Heading level="h3">Engagements</Heading>
          {position.engagements.length === 0 ? <Text size="small" className="mt-2 text-ui-fg-subtle">Nobody has held this position.</Text> : (
            <ul className="mt-3 space-y-2">
              {position.engagements.map((engagement) => (
                <li key={engagement.id} className="rounded-md border border-ui-border-base p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Text size="small" weight="plus">{engagement.resourceName}</Text>
                    <StatusBadge color={engagement.status === 'ACTIVE' ? 'green' : engagement.status === 'ENDED' ? 'grey' : 'red'}>{engagement.status}</StatusBadge>
                  </div>
                  <Text size="xsmall" className="mt-1 text-ui-fg-subtle">
                    {categoryLabel[engagement.engagementType]} · {engagement.fte} FTE · {engagement.startDate} → {engagement.endDate ?? 'open'}
                    {engagement.endReason ? ` · ${engagement.endReason}` : ''}
                  </Text>
                  {engagement.status === 'ACTIVE' ? (
                    <form
                      className="mt-2 flex flex-wrap gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const form = event.currentTarget;
                        const data = new FormData(form);
                        const cancel = engagement.startDate > today();
                        void run(
                          () =>
                            cancel
                              ? workforceApi.cancelEngagement(engagement.id, { expectedVersion: engagement.version, reason: String(data.get('reason') ?? '') })
                              : workforceApi.endEngagement(engagement.id, {
                                  expectedVersion: engagement.version,
                                  endDate: String(data.get('endDate')),
                                  reason: String(data.get('reason') ?? ''),
                                }),
                          form,
                        );
                      }}
                    >
                      {engagement.startDate > today() ? null : <Input name="endDate" type="date" required aria-label="Last day plus one (end date)" className="w-40" />}
                      <Input name="reason" required placeholder="Reason" aria-label="Reason" maxLength={500} className="min-w-[140px] flex-1" />
                      <Button type="submit" size="small" variant="secondary" isLoading={busy}>{engagement.startDate > today() ? 'Withdraw' : 'End engagement'}</Button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label="Engage a person">
          <Heading level="h3">Engage a person</Heading>
          {position.status !== 'OPEN' ? (
            <Text size="small" className="mt-2 text-ui-fg-subtle">The position is {position.status.toLowerCase()}; reopen it to engage someone.</Text>
          ) : people.length === 0 ? (
            <Text size="small" className="mt-2 text-ui-fg-subtle">Add people in the resource directory first.</Text>
          ) : (
            <form
              className="mt-3 grid gap-3 md:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const data = new FormData(form);
                void run(
                  () =>
                    workforceApi.createEngagement({
                      resourceId: String(data.get('resourceId')),
                      positionId: position.id,
                      engagementType: String(data.get('engagementType')) as WorkerCategoryV1,
                      fte: Number(data.get('fte') || position.fte),
                      startDate: String(data.get('startDate')),
                      endDate: String(data.get('endDate') ?? '') || null,
                    }),
                  form,
                );
              }}
            >
              <Field id={`engage-person-${position.id}`} label="Person" className="md:col-span-2">
                <select id={`engage-person-${position.id}`} name="resourceId" required defaultValue="" className={selectClass}>
                  <option value="" disabled>Select a person</option>
                  {people.map((person) => <option key={person.id} value={person.id}>{person.displayName} ({person.referenceCode})</option>)}
                </select>
              </Field>
              <Field id={`engage-type-${position.id}`} label="Engagement">
                <select id={`engage-type-${position.id}`} name="engagementType" defaultValue="EMPLOYEE" className={selectClass}>
                  {CATEGORIES.map((category) => <option key={category} value={category}>{categoryLabel[category]}</option>)}
                </select>
              </Field>
              <Field id={`engage-fte-${position.id}`} label="FTE"><Input id={`engage-fte-${position.id}`} name="fte" type="number" min="0.05" max={position.fte} step="0.05" defaultValue={position.fte} /></Field>
              <Field id={`engage-start-${position.id}`} label="Start"><Input id={`engage-start-${position.id}`} name="startDate" type="date" required defaultValue={today() < position.effectiveFrom ? position.effectiveFrom : today()} /></Field>
              <Field id={`engage-end-${position.id}`} label="End (optional)"><Input id={`engage-end-${position.id}`} name="endDate" type="date" /></Field>
              <Button type="submit" size="small" isLoading={busy} className="md:col-span-2">Engage</Button>
            </form>
          )}
        </section>
      </div>
    </Container>
  );
}

function Field({ id, label, className = '', children }: { id: string; label: string; className?: string; children: ReactNode }) {
  return (
    <div className={`flex flex-col gap-y-1.5 ${className}`}>
      <Label htmlFor={id} size="xsmall" weight="plus">{label}</Label>
      {children}
    </div>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-ui-border-strong bg-ui-bg-subtle p-6">
      <Text weight="plus">{title}</Text>
      <Text size="small" className="mt-2 text-ui-fg-subtle">{text}</Text>
    </div>
  );
}
