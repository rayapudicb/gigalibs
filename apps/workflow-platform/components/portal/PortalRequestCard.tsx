'use client';

import type { PortalContextV1, PortalIssueTypeV1, PortalReceiptV1 } from '@gigalibs/contracts';
import { Button, Heading, Input, Label, Text, Textarea } from '@medusajs/ui';
import { type FormEvent, useEffect, useState } from 'react';
import { PORTAL_MESSAGES, compressPhoto, fragmentToken, portalPost } from './portal-client';

// WI-OI-140 M-REQ: the no-login request card a QR label opens. One tap for the problem, an optional photo and words,
// an optional name and contact; a lost answer is resent with the same operation id, so it is recorded once.

const ISSUES: Readonly<Record<PortalIssueTypeV1, string>> = {
  STOPPED: 'Stopped / won’t run', NOISE: 'Strange noise', LEAK: 'Leaking', QUALITY: 'Quality issue', SAFETY: 'Safety hazard',
  OTHER: 'Something else',
};

export function PortalRequestCard() {
  const [token, setToken] = useState<string | null>(null);
  const [context, setContext] = useState<PortalContextV1 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issue, setIssue] = useState<PortalIssueTypeV1 | null>(null);
  const [description, setDescription] = useState('');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [photo, setPhoto] = useState<{ contentType: 'image/jpeg'; base64: string } | null>(null);
  const [operation, setOperation] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<PortalReceiptV1 | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const found = fragmentToken();
    setToken(found);
    if (!found) {
      setError('PORTAL_LINK_INVALID');
      return;
    }
    void portalPost<PortalContextV1>('context', { token: found }).then((answer) => (answer.ok ? setContext(answer.value) : setError(answer.code)));
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !issue) return;
    const id = operation ?? crypto.randomUUID();
    setOperation(id);
    setBusy(true);
    setError(null);
    const answer = await portalPost<PortalReceiptV1>('requests', {
      token, clientOperationId: id, issueType: issue,
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(name.trim() ? { requesterName: name.trim() } : {}),
      ...(contact.trim() ? { requesterContact: contact.trim() } : {}),
      ...(photo ? { photoContentType: photo.contentType, photoBase64: photo.base64 } : {}),
    });
    setBusy(false);
    if (answer.ok) setReceipt(answer.value);
    else setError(answer.code);
  }
  if (receipt)
    return (
      <section className="flex flex-col gap-3 rounded-xl border border-ui-border-base bg-ui-bg-base p-6" aria-live="polite">
        <Heading level="h1">Request {receipt.requestNumber} received</Heading>
        <Text>Maintenance has been told. Keep this link to follow it:</Text>
        <a className="txt-compact-small-plus text-ui-fg-interactive underline" href={`/r/status#${receipt.statusToken}`}>Follow request {receipt.requestNumber}</a>
      </section>
    );
  if (!context)
    return (
      <section className="rounded-xl border border-ui-border-base bg-ui-bg-base p-6" aria-live="polite">
        <Text>{error ? PORTAL_MESSAGES[error] ?? PORTAL_MESSAGES.PORTAL_UNAVAILABLE : 'Loading…'}</Text>
      </section>
    );
  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border border-ui-border-base bg-ui-bg-base p-6">
      <div>
        <Text size="small" className="text-ui-fg-subtle">{context.assetTag}</Text>
        <Heading level="h1">{context.assetName}</Heading>
      </div>
      {context.recentReportMinutesAgo !== null ? (
        <div className="rounded-lg border border-ui-tag-orange-border bg-ui-tag-orange-bg p-3" role="status">
          <Text size="small">A problem with this equipment was reported {context.recentReportMinutesAgo} minutes ago. Report it anyway if it is something else.</Text>
        </div>
      ) : null}
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="mb-2 txt-compact-small-plus">What is wrong?</legend>
        {context.issueTypes.map((type) => (
          <Button key={type} type="button" size="large" variant={issue === type ? 'primary' : 'secondary'} aria-pressed={issue === type}
            onClick={() => setIssue(type)}>{ISSUES[type]}</Button>
        ))}
      </fieldset>
      <div className="flex flex-col gap-1">
        <Label htmlFor="portal-description">Details{issue === 'OTHER' ? '' : ' (optional)'}</Label>
        <Textarea id="portal-description" value={description} maxLength={1000} onChange={(event) => setDescription(event.target.value)} />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="portal-photo">Photo (optional)</Label>
        <input id="portal-photo" type="file" accept="image/*" capture="environment" className="txt-compact-small"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            setPhoto(file ? await compressPhoto(file) : null);
          }} />
        {photo ? <Text size="xsmall" className="text-ui-fg-subtle">Photo attached.</Text> : null}
      </div>
      <div className="grid grid-cols-1 gap-2">
        <Label htmlFor="portal-name">Your name (optional)</Label>
        <Input id="portal-name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
        <Label htmlFor="portal-contact">Phone or email for updates (optional)</Label>
        <Input id="portal-contact" value={contact} maxLength={240} onChange={(event) => setContact(event.target.value)} />
      </div>
      {error ? <Text size="small" className="text-ui-fg-error" role="alert">{PORTAL_MESSAGES[error] ?? PORTAL_MESSAGES.PORTAL_UNAVAILABLE}</Text> : null}
      <Button type="submit" size="large" isLoading={busy} disabled={busy || !issue || (issue === 'OTHER' && !description.trim())}>
        {operation && error ? 'Send again' : 'Send report'}
      </Button>
      <Text size="xsmall" className="text-ui-fg-subtle">No sign-in needed. Your name and contact go only to the maintenance team.</Text>
    </form>
  );
}
