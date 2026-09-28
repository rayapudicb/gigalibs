'use client';

import { requestJson } from '@/lib/client-api';
import { Plus } from '@medusajs/icons';
import { Alert, Badge, Button, Container, Heading, Input, Label, Table, Text } from '@medusajs/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

interface Catalogues {
  industries: Array<{
    slug: string;
    label: string;
    emoji: string | null;
    demoProfile: { regions: number; sitesPerRegion: number; zonesPerSite: number; currency: string };
  }>;
  countries: Array<{ code: string; label: string; currency: string }>;
}
interface DemoTenant {
  id: string;
  slug: string;
  name: string;
  status: string;
  createdAt: string;
  trialEndsAt: string | null;
}

const selectClass =
  'h-8 w-full rounded-md bg-ui-bg-field px-2 txt-compact-small text-ui-fg-base shadow-borders-base outline-none transition-fg hover:bg-ui-bg-field-hover focus-visible:shadow-borders-interactive-with-active';

// WI-OI-064e: Demo Lab (FR-13) — isolated, labelled workspaces per industry and country, synthetic data only.
export function DemoLabConsole() {
  const router = useRouter();
  const [catalogues, setCatalogues] = useState<Catalogues | null>(null);
  const [tenants, setTenants] = useState<DemoTenant[]>([]);
  const [industry, setIndustry] = useState('qsr');
  const [country, setCountry] = useState('us');
  const [reason, setReason] = useState('Sales demonstration');
  const [creating, setCreating] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [loadedCatalogues, list] = await Promise.all([
        requestJson<Catalogues>('/api/control/platform/demo-lab/catalogues'),
        requestJson<{ items: DemoTenant[] }>('/api/control/platform/demo-lab/tenants'),
      ]);
      setCatalogues(loadedCatalogues);
      setTenants(list.items);
    } catch (reason) {
      setError((reason as Error).message);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function create() {
    setCreating(true);
    setError(null);
    setMessage(null);
    try {
      const created = await requestJson<{ name: string }>('/api/control/platform/demo-lab/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ industry, country, reason: reason.trim() }),
      });
      setMessage(`Created ${created.name}. Open it to generate synthetic data.`);
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function open(tenantId: string) {
    setOpening(tenantId);
    setError(null);
    try {
      const response = await fetch('/api/auth/select-tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      });
      const payload = (await response.json()) as { detail?: string; requiresMfa?: boolean };
      if (!response.ok) throw new Error(payload.detail || 'Unable to open the workspace.');
      router.push(payload.requiresMfa ? '/mfa' : '/analytics/places');
      router.refresh();
    } catch (reason) {
      setError((reason as Error).message);
      setOpening(null);
    }
  }

  const selected = catalogues?.industries.find((pack) => pack.slug === industry);
  return (
    <section className="min-h-full bg-ui-bg-subtle px-[5px] py-5 text-ui-fg-base" aria-labelledby="demo-lab-title">
      <div className="mx-auto w-full max-w-[1800px] space-y-5">
        <Container className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Text size="xsmall" weight="plus" className="uppercase tracking-[0.18em] text-ui-fg-muted">Platform administration</Text>
              <Heading level="h1" id="demo-lab-title" className="mt-2">Demo Lab</Heading>
              <Text size="small" className="mt-1 max-w-3xl text-ui-fg-subtle">
                Create an isolated demo workspace for an industry and country. It is labelled as a demo, holds synthetic
                data only, is excluded from value reporting and can be reset or deleted at any time.
              </Text>
            </div>
            <Button asChild size="small" variant="secondary"><Link href="/platform-admin">Platform administration</Link></Button>
          </div>
        </Container>

        {error ? <Alert variant="error" role="alert">{error}</Alert> : null}
        {message ? <Alert variant="success" role="status">{message}</Alert> : null}

        <div className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
          <Container className="space-y-4 p-5">
            <Heading level="h2">New demo workspace</Heading>
            <div className="flex flex-col gap-y-1.5">
              <Label htmlFor="demo-industry" size="xsmall" weight="plus">Industry pack</Label>
              <select id="demo-industry" className={selectClass} value={industry} onChange={(event) => setIndustry(event.target.value)}>
                {(catalogues?.industries ?? []).map((pack) => (
                  <option key={pack.slug} value={pack.slug}>{`${pack.emoji ?? ''} ${pack.label}`.trim()}</option>
                ))}
              </select>
              {selected ? (
                <Text size="xsmall" className="text-ui-fg-muted">
                  {selected.demoProfile.regions} regions × {selected.demoProfile.sitesPerRegion} sites
                  {selected.demoProfile.zonesPerSite > 0 ? ` × ${selected.demoProfile.zonesPerSite} zones` : ''}
                </Text>
              ) : null}
            </div>
            <div className="flex flex-col gap-y-1.5">
              <Label htmlFor="demo-country" size="xsmall" weight="plus">Country pack</Label>
              <select id="demo-country" className={selectClass} value={country} onChange={(event) => setCountry(event.target.value)}>
                {(catalogues?.countries ?? []).map((pack) => <option key={pack.code} value={pack.code}>{pack.label} ({pack.currency})</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-y-1.5">
              <Label htmlFor="demo-reason" size="xsmall" weight="plus">Reason (recorded in the audit log)</Label>
              <Input id="demo-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} />
            </div>
            <Button type="button" isLoading={creating} disabled={!catalogues || reason.trim().length < 3} onClick={() => void create()} className="w-full">
              <Plus /> Create demo workspace
            </Button>
          </Container>

          <Container className="p-5">
            <Heading level="h2">Demo workspaces</Heading>
            {tenants.length === 0 ? (
              <Text size="small" className="mt-3 text-ui-fg-subtle">No demo workspaces yet.</Text>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>Workspace</Table.HeaderCell>
                      <Table.HeaderCell>Status</Table.HeaderCell>
                      <Table.HeaderCell>Created</Table.HeaderCell>
                      <Table.HeaderCell />
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {tenants.map((tenant) => (
                      <Table.Row key={tenant.id}>
                        <Table.Cell className="py-2">
                          <span className="block txt-compact-small-plus">{tenant.name}</span>
                          <span className="font-mono text-xs text-ui-fg-muted">{tenant.slug}</span>
                        </Table.Cell>
                        <Table.Cell><Badge size="2xsmall" color="orange">Demo · {tenant.status}</Badge></Table.Cell>
                        <Table.Cell className="tabular-nums">{new Date(tenant.createdAt).toLocaleDateString()}</Table.Cell>
                        <Table.Cell className="text-right">
                          <Button type="button" size="small" variant="secondary" isLoading={opening === tenant.id} onClick={() => void open(tenant.id)}>
                            Open
                          </Button>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              </div>
            )}
            <Text size="xsmall" className="mt-3 text-ui-fg-muted">
              Open a workspace to generate, reset or delete its synthetic data from Analytics → Place drill-down.
            </Text>
          </Container>
        </div>
      </div>
    </section>
  );
}
