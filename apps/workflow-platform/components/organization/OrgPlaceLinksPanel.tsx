'use client';

import type { OrgUnitPlaceLinkV1, OrgUnitV1 } from '@gigalibs/contracts';
import { Badge, Button, Heading, Input, Label, Table, Text } from '@medusajs/ui';
import { useCallback, useEffect, useId, useState } from 'react';
import { useSites } from '@/components/geospatial/SitePicker';
import { describeOrgError, orgRequest, type OrgErrorView, reasonProblem } from './organization-client';
import { OrgErrorAlert, OrgSuccess, ReasonField, selectClassName } from './OrgShared';

const today = () => new Date().toISOString().slice(0, 10);

/** Which places a unit operates or owns, by period. A link never grants access to the place (ADR-0018 D6). */
export function OrgPlaceLinksPanel({ unit, canEdit, onClose }: { unit: OrgUnitV1; canEdit: boolean; onClose: () => void }) {
  const ids = { place: useId(), placeId: useId(), relation: useId(), from: useId(), to: useId(), endDate: useId() };
  const { sites, siteName } = useSites();
  const [links, setLinks] = useState<OrgUnitPlaceLinkV1[] | null>(null);
  const [error, setError] = useState<OrgErrorView | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ placeId: string; relation: 'OPERATES' | 'OWNS'; from: string; to: string; reason: string } | null>(null);
  const [ending, setEnding] = useState<{ link: OrgUnitPlaceLinkV1; date: string; reason: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setLinks(await orgRequest<OrgUnitPlaceLinkV1[]>(`/units/${unit.id}/place-links`));
    } catch (caught) {
      setError(describeOrgError(caught));
    }
  }, [unit.id]);
  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (label: string, request: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await request();
      setSuccess(label);
      setForm(null);
      setEnding(null);
      await load();
    } catch (caught) {
      setError(describeOrgError(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-ui-border-base p-4" aria-label={`Places of ${unit.code}`}>
      <div className="flex items-center justify-between gap-2">
        <Heading level="h3">Places of {unit.code} · {unit.name}</Heading>
        <div className="flex gap-2">
          {canEdit && !form && (
            <Button size="small" onClick={() => setForm({ placeId: sites[0]?.id ?? '', relation: 'OPERATES', from: today(), to: '', reason: '' })}>Link a place</Button>
          )}
          <Button size="small" variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
      <Text size="small" className="text-ui-fg-subtle">Links show where the unit works; they never give anyone access to the place.</Text>
      <OrgSuccess message={success} />
      <OrgErrorAlert error={error} onReload={() => void load()} onRetry={() => void load()} />

      {form && (
        <form className="flex flex-col gap-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4" aria-label="Link a place"
          onSubmit={(event) => {
            event.preventDefault();
            void submit('Place linked.', () =>
              orgRequest(`/units/${unit.id}/place-links`, {
                method: 'POST',
                body: { placeId: form.placeId.trim(), relation: form.relation, effectiveFrom: form.from, effectiveTo: form.to || null, reason: form.reason },
              }),
            );
          }}>
          <div className="grid gap-3 md:grid-cols-4">
            {sites.length > 0 ? (
              <div className="flex flex-col gap-1">
                <Label size="small" htmlFor={ids.place}>Place</Label>
                <select id={ids.place} className={selectClassName} value={form.placeId} onChange={(event) => setForm({ ...form, placeId: event.target.value })}>
                  {sites.map((site) => <option key={site.id} value={site.id}>{site.label}</option>)}
                </select>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <Label size="small" htmlFor={ids.placeId}>Place id</Label>
                <Input id={ids.placeId} size="small" value={form.placeId} placeholder="From Maps" onChange={(event) => setForm({ ...form, placeId: event.target.value })} />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <Label size="small" htmlFor={ids.relation}>Relation</Label>
              <select id={ids.relation} className={selectClassName} value={form.relation} onChange={(event) => setForm({ ...form, relation: event.target.value as 'OPERATES' | 'OWNS' })}>
                <option value="OPERATES">Operates</option>
                <option value="OWNS">Owns</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <Label size="small" htmlFor={ids.from}>From</Label>
              <Input id={ids.from} size="small" type="date" value={form.from} onChange={(event) => setForm({ ...form, from: event.target.value })} />
            </div>
            <div className="flex flex-col gap-1">
              <Label size="small" htmlFor={ids.to}>Until (optional)</Label>
              <Input id={ids.to} size="small" type="date" value={form.to} onChange={(event) => setForm({ ...form, to: event.target.value })} />
            </div>
          </div>
          <ReasonField value={form.reason} onChange={(reason) => setForm({ ...form, reason })} />
          <div className="flex gap-2">
            <Button size="small" type="submit" isLoading={busy} disabled={!form.placeId.trim() || reasonProblem(form.reason) !== null} title={reasonProblem(form.reason) ?? undefined}>Link</Button>
            <Button size="small" variant="secondary" type="button" onClick={() => setForm(null)}>Cancel</Button>
          </div>
        </form>
      )}

      {!links ? (
        <Text size="small" className="text-ui-fg-subtle" role="status">Loading places…</Text>
      ) : links.length === 0 ? (
        <Text size="small" className="text-ui-fg-subtle">No places linked.</Text>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Place</Table.HeaderCell>
                <Table.HeaderCell>Relation</Table.HeaderCell>
                <Table.HeaderCell>From</Table.HeaderCell>
                <Table.HeaderCell>Until</Table.HeaderCell>
                <Table.HeaderCell><span className="sr-only">Actions</span></Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {links.map((link) => (
                <Table.Row key={link.id}>
                  <Table.Cell>{siteName(link.placeId)}</Table.Cell>
                  <Table.Cell><Badge size="2xsmall">{link.relation === 'OPERATES' ? 'Operates' : 'Owns'}</Badge></Table.Cell>
                  <Table.Cell>{link.effectiveFrom}</Table.Cell>
                  <Table.Cell>{link.effectiveTo ?? '—'}</Table.Cell>
                  <Table.Cell>
                    {canEdit && !link.effectiveTo && (
                      <Button size="small" variant="transparent" onClick={() => setEnding({ link, date: today(), reason: '' })}>End</Button>
                    )}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      )}

      {ending && (
        <div className="flex flex-col gap-3 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4" role="dialog" aria-label="End place link">
          <div className="flex w-48 flex-col gap-1">
            <Label size="small" htmlFor={ids.endDate}>Ends on</Label>
            <Input id={ids.endDate} size="small" type="date" value={ending.date} onChange={(event) => setEnding({ ...ending, date: event.target.value })} />
          </div>
          <ReasonField value={ending.reason} onChange={(reason) => setEnding({ ...ending, reason })} />
          <div className="flex gap-2">
            <Button size="small" variant="danger" isLoading={busy} disabled={reasonProblem(ending.reason) !== null} title={reasonProblem(ending.reason) ?? undefined}
              onClick={() => void submit('Place link ended.', () => orgRequest(`/place-links/${ending.link.id}/end`, { method: 'POST', body: { effectiveTo: ending.date, reason: ending.reason } }))}>
              End link
            </Button>
            <Button size="small" variant="secondary" onClick={() => setEnding(null)}>Cancel</Button>
          </div>
        </div>
      )}
    </section>
  );
}
