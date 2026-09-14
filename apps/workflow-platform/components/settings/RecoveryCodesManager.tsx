'use client';

import { PageShell } from '@/components/page-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { type FormEvent, useState } from 'react';

interface RecoveryCodeSet {
  codes: string[];
  count: number;
  replacedExisting: boolean;
  delivery: 'DISPLAY_ONCE';
}

async function readError(response: Response, fallback: string): Promise<string> {
  const payload = (await response.json().catch(() => null)) as {
    detail?: unknown;
    message?: unknown;
  } | null;
  if (typeof payload?.detail === 'string') return payload.detail;
  if (typeof payload?.message === 'string') return payload.message;
  return fallback;
}

export function RecoveryCodesManager({
  email,
  remaining,
}: {
  email: string;
  remaining: number;
}) {
  const [remainingCount, setRemainingCount] = useState(remaining);
  const [reason, setReason] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setCodes(null);
    try {
      const response = await fetch('/api/auth/mfa/recovery/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!response.ok)
        throw new Error(await readError(response, 'Recovery-code rotation failed.'));
      const payload = (await response.json()) as RecoveryCodeSet;
      if (
        payload.delivery !== 'DISPLAY_ONCE' ||
        payload.count !== 10 ||
        payload.codes.length !== 10
      ) {
        throw new Error('Authentication service returned an invalid recovery-code response.');
      }
      setCodes(payload.codes);
      setRemainingCount(payload.count);
      setReason('');
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Recovery-code rotation failed.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell
      eyebrow="Account security"
      title="MFA recovery codes"
      description={`Manage one-time recovery credentials for ${email}.`}
    >
      {error ? (
        <p
          className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Recovery access</CardTitle>
          <CardDescription>
            {remainingCount} unused code{remainingCount === 1 ? '' : 's'} remain. Generating a new
            set immediately revokes every previous code.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={generate}>
            <label className="flex-1 text-xs font-medium text-zinc-700">
              Rotation reason
              <input
                className="mt-1 h-9 w-full rounded-md border border-zinc-200 px-3"
                minLength={3}
                maxLength={500}
                placeholder="Lost copy, low remaining count, or scheduled rotation"
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <Button
              type="submit"
              variant="primary"
              disabled={reason.trim().length < 3}
              isLoading={busy}
            >
              {remainingCount ? 'Replace all codes' : 'Generate codes'}
            </Button>
          </form>
          {codes ? (
            <output className="block rounded-lg border border-amber-300 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-950">
                Save these codes now. They cannot be retrieved after leaving this page.
              </p>
              <pre className="mt-3 grid grid-cols-1 gap-2 rounded-md border border-amber-300 bg-white p-4 font-mono text-sm sm:grid-cols-2">
                {codes.map((code) => (
                  <code key={code}>{code}</code>
                ))}
              </pre>
              <Button
                className="mt-3"
                type="button"
                onClick={() => void navigator.clipboard.writeText(codes.join('\n'))}
              >
                Copy all codes
              </Button>
            </output>
          ) : null}
          <p className="text-xs text-zinc-600">
            Codes contain 100 bits of randomness, work once, and are stored only as user-bound
            SHA-256 digests. Verification shares the authenticator lockout counter.
          </p>
        </CardContent>
      </Card>
    </PageShell>
  );
}
