'use client';

import { type CmmsAssetV1, type PortalLinkV1, type PortalSubmissionV1 } from '@gigalibs/contracts';
import { Button, Container, Heading, Input, StatusBadge, Table, Text } from '@medusajs/ui';
import { useCallback, useEffect, useState } from 'react';
import { type CmmsApiError, cmmsApi } from '../api';
import { portalApi } from '../portal-api';
import { qrSvgPath } from '../qr';
import { ActionError, EmptyState, ErrorState, Field, LoadingState, formatDate } from './CmmsShared';

// WI-OI-140 M-REQ. A link's capability is shown once, as a printable label; CMMS keeps only its hash. Requests raised
// through links arrive in the normal request triage.

interface Label { readonly assetTag: string; readonly assetName: string; readonly url: string }

function QrLabel({ label }: { label: Label }) {
  const { path, size } = qrSvgPath(label.url);
  return (
    <div className="flex w-56 flex-col items-center gap-1 rounded-md border border-ui-border-strong bg-ui-bg-base p-3 break-inside-avoid">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-40 w-40" role="img" aria-label={`Request link for ${label.assetTag}`} shapeRendering="crispEdges">
        <rect width={size} height={size} className="fill-ui-bg-base" />
        <path d={path} className="fill-ui-fg-base" />
      </svg>
      <Text size="small" weight="plus">{label.assetTag}</Text>
      <Text size="xsmall" className="text-center">{label.assetName}</Text>
      <Text size="xsmall" className="text-ui-fg-subtle">Scan to report a problem</Text>
    </div>
  );
}

export function CmmsRequestLinks() {
  const [assets, setAssets] = useState<readonly CmmsAssetV1[]>([]);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [labels, setLabels] = useState<readonly Label[]>([]);
  const [links, setLinks] = useState<readonly PortalLinkV1[] | null>(null);
  const [submissions, setSubmissions] = useState<readonly PortalSubmissionV1[]>([]);
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<CmmsApiError | null>(null);
  const [actionError, setActionError] = useState<CmmsApiError | null>(null);
  const load = useCallback(() => {
    setError(null);
    portalApi.links().then((page) => setLinks(page.items), (failure: CmmsApiError) => setError(failure));
    portalApi.submissions().then((page) => setSubmissions(page.items), () => setSubmissions([]));
  }, []);
  useEffect(load, [load]);
  useEffect(() => {
    cmmsApi.searchAssets({ pageSize: 50, ...(filter.trim() ? { q: filter.trim() } : {}) }).then((page) => setAssets(page.items), () => setAssets([]));
  }, [filter]);
  async function create() {
    setBusy(true);
    setActionError(null);
    const made: Label[] = [];
    try {
      for (const assetId of selected) {
        const created = await portalApi.createLink({ assetId });
        made.push({ assetTag: created.link.assetTag, assetName: created.link.assetName, url: `${window.location.origin}/r#${created.token}` });
      }
      setSelected([]);
    } catch (failure) {
      setActionError(failure as CmmsApiError);
    } finally {
      setLabels([...labels, ...made]);
      setBusy(false);
      load();
    }
  }
  async function revoke(link: PortalLinkV1) {
    const reason = window.prompt(`Why revoke the link on ${link.assetTag}?`);
    if (!reason?.trim()) return;
    setActionError(null);
    try {
      await portalApi.revoke(link.id, reason.trim());
      load();
    } catch (failure) {
      setActionError(failure as CmmsApiError);
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <Container className="flex flex-col gap-3 p-6 print:hidden">
        <div>
          <Heading level="h2">QR request links</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Anyone who scans a label can report a problem with that asset, without signing in. A label is shown once; print it now. Revoke a damaged or misused label.
          </Text>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Field id="links-filter" label="Find assets" className="w-64"><Input id="links-filter" size="small" value={filter} onChange={(event) => setFilter(event.target.value)} /></Field>
          <Button type="button" size="small" disabled={busy || selected.length === 0} isLoading={busy} onClick={create}>
            Create {selected.length || ''} label{selected.length === 1 ? '' : 's'}
          </Button>
          {labels.length > 0 ? <Button type="button" size="small" variant="secondary" onClick={() => window.print()}>Print labels</Button> : null}
        </div>
        <div className="flex max-h-64 flex-col gap-1 overflow-auto">
          {assets.map((asset) => (
            <label key={asset.id} className="flex items-center gap-2 txt-compact-small">
              <input type="checkbox" checked={selected.includes(asset.id)}
                onChange={(event) => setSelected(event.target.checked ? [...selected, asset.id] : selected.filter((item) => item !== asset.id))} />
              {asset.assetTag} · {asset.name}
            </label>
          ))}
        </div>
        <ActionError error={actionError} onReload={load} />
      </Container>
      {labels.length > 0 ? (
        <Container className="p-6">
          <Heading level="h3" className="print:hidden">Labels to print ({labels.length})</Heading>
          <div className="mt-3 flex flex-wrap gap-3">{labels.map((label) => <QrLabel key={label.url} label={label} />)}</div>
        </Container>
      ) : null}
      <Container className="p-0 print:hidden">
        <div className="p-6"><Heading level="h3">Links</Heading></div>
        {error ? <div className="px-6 pb-6"><ErrorState error={error} retry={load} /></div> : null}
        {!error && !links ? <LoadingState label="Loading links…" /> : null}
        {links && links.length === 0 ? <div className="px-6 pb-6"><EmptyState title="No links" text="Choose assets and create labels." /></div> : null}
        {links && links.length > 0 ? (
          <Table>
            <Table.Body>
              {links.map((link) => (
                <Table.Row key={link.id}>
                  <Table.Cell>{link.assetTag} · {link.assetName}</Table.Cell>
                  <Table.Cell><StatusBadge color={link.status === 'ACTIVE' ? 'green' : 'grey'}>{link.status}</StatusBadge></Table.Cell>
                  <Table.Cell>{link.submissions} request{link.submissions === 1 ? '' : 's'}{link.lastUsedAt ? ` · last ${formatDate(link.lastUsedAt)}` : ''}</Table.Cell>
                  <Table.Cell className="text-right">
                    {link.status === 'ACTIVE' ? <Button type="button" size="small" variant="secondary" onClick={() => revoke(link)}>Revoke</Button> : null}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        ) : null}
      </Container>
      <Container className="flex flex-col gap-2 p-6 print:hidden">
        <Heading level="h3">Requests through links (30 days)</Heading>
        <Text size="small" className="text-ui-fg-subtle">Triage them in Requests like any other.</Text>
        {submissions.length === 0 ? <Text size="small">None yet.</Text> : null}
        {submissions.map((item) => (
          <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ui-border-base p-3">
            <Text size="small">{item.requestNumber} · {item.assetTag} · {item.issueType} · {formatDate(item.submittedAt)}</Text>
            <div className="flex items-center gap-2">
              <StatusBadge color={item.requestStatus === 'PENDING' ? 'orange' : item.requestStatus === 'ACCEPTED' ? 'green' : 'grey'}>{item.requestStatus}</StatusBadge>
              {item.hasPhoto ? (
                <Button type="button" size="small" variant="secondary"
                  onClick={() => portalApi.photo(item.id).then((value) => setPhoto(`data:${value.contentType};base64,${value.base64}`), () => setPhoto(null))}>Photo</Button>
              ) : null}
            </div>
          </div>
        ))}
        {photo ? <img src={photo} alt="Photo sent with the request" className="max-h-80 self-start rounded-md border border-ui-border-base object-contain" /> : null}
      </Container>
    </div>
  );
}
