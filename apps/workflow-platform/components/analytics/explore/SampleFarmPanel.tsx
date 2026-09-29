'use client';

/**
 * WI-OI-103d d7: Demo Lab workspaces can load a labelled sample farm source. Its synthetic harvest logs go through
 * the real discovery, mapping, dataset and model steps; "Yield per hectare" then waits for a second person's review.
 */

import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Container, Heading, Text } from '@medusajs/ui';
import type { SampleFarmStatusV1 } from '@gigalibs/contracts';

async function demoLab(method: 'GET' | 'POST'): Promise<SampleFarmStatusV1> {
  const response = await fetch('/api/demo-lab/sample-farm', {
    method,
    headers: { Accept: 'application/json', ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
    ...(method === 'POST' ? { body: '{}' } : {}),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((body as { detail?: string; message?: string }).detail ?? (body as { message?: string }).message ?? `Request failed (${response.status}).`);
  }
  return body as SampleFarmStatusV1;
}

const reviewText: Record<string, string> = {
  PENDING_REVIEW: 'waiting for a second person to approve it',
  PUBLISHED: 'approved and available in Explore',
  REJECTED: 'rejected',
  DRAFT: 'not yet submitted',
  SUPERSEDED: 'superseded',
};

export function SampleFarmPanel({ canLoad, onLoaded }: { canLoad: boolean; onLoaded: (semanticModelId: string) => void }) {
  const [status, setStatus] = useState<SampleFarmStatusV1 | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    demoLab('GET').then(setStatus).catch((cause: Error) => setError(cause.message));
  }, []);
  useEffect(refresh, [refresh]);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const loaded = await demoLab('POST');
      setStatus(loaded);
      if (loaded.semanticModelId) onLoaded(loaded.semanticModelId);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Container className="flex flex-col gap-3 border-l-4 border-l-ui-tag-orange-icon p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex max-w-3xl flex-col gap-1">
          <div className="flex items-center gap-2">
            <Heading level="h2">Sample farm data</Heading>
            <Badge size="2xsmall" color="orange">Demo Lab · synthetic data</Badge>
          </div>
          <Text size="small" className="text-ui-fg-subtle">
            960 synthetic harvest logs for three farms over four seasons; they are not real farm records. They pass
            through the real steps: source, discovery, mapping, dataset and model.
          </Text>
        </div>
        {canLoad && !status?.loaded ? (
          <Button type="button" size="small" isLoading={busy} disabled={busy || status === null} onClick={() => void load()}>
            Load sample farm data
          </Button>
        ) : null}
      </div>
      {status?.loaded ? (
        <Text size="small" className="tabular-nums text-ui-fg-base">
          Loaded: {status.rawRecords.toLocaleString()} raw records. &ldquo;Yield per hectare&rdquo; is{' '}
          {reviewText[status.formula?.state ?? ''] ?? 'not set up'}.
        </Text>
      ) : null}
      {error ? <Alert variant="error">{error}</Alert> : null}
    </Container>
  );
}
