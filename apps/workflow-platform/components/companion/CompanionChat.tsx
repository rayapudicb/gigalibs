'use client';

import { GenerativeUI } from '@/components/companion/GenerativeUI';
import type { GenerativeUINode } from '@gigalibs/contracts';
import { Button, Heading, Input, Text } from '@medusajs/ui';
import { usePathname, useRouter } from 'next/navigation';
import * as React from 'react';

// WI-OI-120bc (Giga AI Companion): the shared chat surface, used by both the /companion page and the floating
// launcher. It posts a goal to /api/companion/run (which runs the loop on the local model, as the signed-in user) and
// renders the returned generative-UI panels with the vetted renderer. It never fabricates a reply: a 503 (local model
// not running) or any error is shown as a plain message, honouring owner decision D4a (no invented chat).

interface CompanionRunResult {
  readonly outcome: string;
  readonly panels: readonly GenerativeUINode[];
  readonly question?: string;
  readonly navigateTo?: string;
  readonly transcript?: readonly { readonly role: string; readonly content: string }[];
}

/** `onNavigated` lets a host (the floating launcher) close itself once the Companion opens a screen. */
export function CompanionChat({
  onNavigated,
}: {
  onNavigated?: () => void;
} = {}): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();
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
        body: JSON.stringify({ goal, context: { path: pathname } }),
      });
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))) as { detail?: string };
        setError(
          res.status === 503
            ? 'The local AI model is not running. Start Ollama and try again.'
            : (detail.detail ?? `The Companion is unavailable (HTTP ${res.status}).`),
        );
        return;
      }
      const data = (await res.json()) as CompanionRunResult;
      if (data.outcome === 'navigate' && data.navigateTo) {
        // The Companion opens the real app screen — an in-app route change, not a reload.
        router.push(data.navigateTo);
        onNavigated?.();
        return;
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-y-4">
      <div className="flex flex-col gap-y-1">
        <Heading level="h2">Giga AI Companion</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Describe a goal; it uses the tools you are allowed to use and shows the result.
        </Text>
      </div>
      <div className="flex gap-x-2">
        <Input
          placeholder="e.g. Show the exchange-rate table for USD"
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
          {result.outcome !== 'done' &&
          result.outcome !== 'navigate' &&
          result.transcript?.length ? (
            <div className="flex flex-col gap-y-1 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-3">
              <Text size="xsmall" className="text-ui-fg-muted">
                What it tried:
              </Text>
              {result.transcript.map((m, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a positional transcript log
                <Text key={`t-${i}`} size="xsmall" className="text-ui-fg-subtle">
                  {m.role}: {m.content}
                </Text>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
