'use client';

import type { PortalStatusV1 } from '@gigalibs/contracts';
import { Heading, Text } from '@medusajs/ui';
import { useEffect, useState } from 'react';
import { PORTAL_MESSAGES, fragmentToken, portalPost } from './portal-client';

// WI-OI-140 M-REQ: a request's state for the person who reported it, proven by the receipt's own capability.
const STATES: Readonly<Record<PortalStatusV1['state'], string>> = {
  RECEIVED: 'Received — waiting for the maintenance team',
  IN_HAND: 'Being worked on',
  DONE: 'Done',
  CLOSED: 'Closed',
};

export function PortalStatusCard() {
  const [status, setStatus] = useState<PortalStatusV1 | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const token = fragmentToken();
    if (!token) {
      setError('PORTAL_LINK_INVALID');
      return;
    }
    void portalPost<PortalStatusV1>('status', { token }).then((answer) => (answer.ok ? setStatus(answer.value) : setError(answer.code)));
  }, []);
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-ui-border-base bg-ui-bg-base p-6" aria-live="polite">
      {status ? (
        <>
          <Text size="small" className="text-ui-fg-subtle">{status.assetTag}</Text>
          <Heading level="h1">Request {status.requestNumber}</Heading>
          <Text weight="plus">{STATES[status.state]}</Text>
          <Text size="small" className="text-ui-fg-subtle">Last change {new Date(status.updatedAt).toLocaleString()}</Text>
        </>
      ) : (
        <Text>{error ? PORTAL_MESSAGES[error] ?? PORTAL_MESSAGES.PORTAL_UNAVAILABLE : 'Loading…'}</Text>
      )}
    </section>
  );
}
