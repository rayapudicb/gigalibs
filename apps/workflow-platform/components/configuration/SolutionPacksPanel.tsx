'use client';

/**
 * WI-OI-107 (ADR-0016 F10): the industry and country packs shipped at the solution layer. A workspace administrator
 * installs one here as a Configuration Studio change set; it is then approved, published and activated in Studio like
 * any configuration. Activating a pack sends each module (Workforce, Geospatial) its section. One industry pack and
 * one country pack are active at a time.
 */

import { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Heading, Text } from '@medusajs/ui';
import { requestJson } from '@/lib/client-api';

interface CatalogueItem {
  kind: 'METRIC_CATALOGUE' | 'INDUSTRY_PACK' | 'COUNTRY_PACK';
  surfaceKey: string;
  title: string;
  latestChangeSet: { id: string; status: string } | null;
  activation: { activatedAt: string } | null;
}

const KINDS = [
  { kind: 'INDUSTRY_PACK', heading: 'Industry packs', hint: 'Wording, certifications, Workforce capabilities and place levels for one industry.' },
  { kind: 'COUNTRY_PACK', heading: 'Country packs', hint: 'Currency, time zones, regions and pay-rule settings for one country.' },
] as const;

export function SolutionPacksPanel({ canInstall }: { canInstall: boolean }) {
  const [items, setItems] = useState<CatalogueItem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    requestJson<CatalogueItem[] | { items: CatalogueItem[] }>('/api/control/configuration/catalogues')
      .then((result) => setItems(Array.isArray(result) ? result : result.items))
      .catch((cause: Error) => setError(cause.message));
  }, []);
  useEffect(load, [load]);

  const install = async (item: CatalogueItem) => {
    setBusy(`${item.kind}:${item.surfaceKey}`);
    setError(null);
    setNotice(null);
    try {
      await requestJson('/api/control/configuration/catalogues/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: item.kind,
          surfaceKey: item.surfaceKey,
          reason: `Install the ${item.title} pack`,
          idempotencyKey: `install-${item.kind}-${item.surfaceKey}-${Date.now()}`,
        }),
      });
      setNotice(`${item.title} is installed as a draft. Approve, publish and activate it in Studio; activating it sends each module its part.`);
      load();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-ui-border-base bg-ui-bg-base p-5" aria-labelledby="solution-packs-heading">
      <div className="flex flex-col gap-1">
        <Heading level="h2" id="solution-packs-heading">Industry and country packs</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Each pack covers every module that reads it. One industry pack and one country pack are active at a time.
        </Text>
      </div>
      {error ? <Alert variant="error">{error}</Alert> : null}
      {notice ? <Alert variant="success">{notice}</Alert> : null}
      {items === null && !error ? <Text size="small" className="text-ui-fg-subtle">Loading packs…</Text> : null}
      {items !== null
        ? KINDS.map(({ kind, heading, hint }) => {
            const packs = items.filter((item) => item.kind === kind);
            return (
              <div key={kind} className="flex flex-col gap-2">
                <div className="flex flex-col gap-0.5">
                  <Text size="small" weight="plus">{heading}</Text>
                  <Text size="xsmall" className="text-ui-fg-subtle">{hint}</Text>
                </div>
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {packs.map((item) => {
                    const state = item.activation ? 'Active' : item.latestChangeSet ? item.latestChangeSet.status.toLowerCase().replace('_', ' ') : null;
                    return (
                      <li key={item.surfaceKey} className="flex items-center justify-between gap-2 rounded-md border border-ui-border-base p-3">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <Text size="small" weight="plus" className="truncate">{item.title}</Text>
                          {state ? (
                            <Badge size="2xsmall" color={item.activation ? 'green' : 'grey'} className="self-start">{state}</Badge>
                          ) : (
                            <Text size="xsmall" className="text-ui-fg-subtle">Not installed</Text>
                          )}
                        </div>
                        {canInstall && !item.activation ? (
                          <Button
                            type="button"
                            size="small"
                            variant="secondary"
                            isLoading={busy === `${item.kind}:${item.surfaceKey}`}
                            disabled={busy !== null}
                            onClick={() => void install(item)}
                          >
                            Install
                          </Button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
        : null}
      <Text size="xsmall" className="text-ui-fg-subtle">
        After installing, open Studio (Configuration → Studio) to approve, publish and activate the pack.
      </Text>
    </section>
  );
}
