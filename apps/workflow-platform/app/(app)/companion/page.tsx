'use client';

import { GenerativeUI } from '@/components/companion/GenerativeUI';
import type { GenerativeUINode } from '@gigalibs/contracts';
import { Button, Container, Heading, Input, Text } from '@medusajs/ui';
import * as React from 'react';

// WI-OI-120bc (Giga AI Companion): the page. Give it a goal; it posts to /api/companion/run (which runs the loop on the
// local model, as the signed-in user) and renders the returned generative-UI panels with the vetted renderer.

interface CompanionRunResult {
  readonly outcome: string;
  readonly panels: readonly GenerativeUINode[];
  readonly question?: string;
}

export default function CompanionPage(): React.ReactElement {
  const [goal, setGoal] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<CompanionRunResult | null>(null);

  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/companion/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal }),
      });
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))) as { detail?: string };
        setError(detail.detail ?? `The Companion is unavailable (HTTP ${res.status}).`);
        return;
      }
      setResult((await res.json()) as CompanionRunResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container className="flex flex-col gap-y-4 p-6">
      <div className="flex flex-col gap-y-1">
        <Heading level="h1">Giga AI Companion</Heading>
        <Text className="text-ui-fg-subtle">
          Describe a goal; the Companion plans it, uses the tools you are allowed to use, and shows
          the result.
        </Text>
      </div>
      <div className="flex gap-x-2">
        <Input
          placeholder="e.g. Who can work at Site A tomorrow?"
          value={goal}
          onChange={(e) => setGoal(e.currentTarget.value)}
          disabled={busy}
        />
        <Button
          variant="primary"
          onClick={run}
          disabled={busy || goal.trim().length === 0}
          isLoading={busy}
        >
          Ask
        </Button>
      </div>
      {error ? <Text className="text-ui-tag-red-text">{error}</Text> : null}
      {result ? (
        <div className="flex flex-col gap-y-4">
          {result.question ? <Text className="text-ui-fg-base">{result.question}</Text> : null}
          {result.panels.map((panel, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: panels are a positional, wholesale-rendered list.
            <GenerativeUI key={`panel-${i}`} node={panel} />
          ))}
          <Text size="small" className="text-ui-fg-muted">
            Outcome: {result.outcome}
          </Text>
        </div>
      ) : null}
    </Container>
  );
}
