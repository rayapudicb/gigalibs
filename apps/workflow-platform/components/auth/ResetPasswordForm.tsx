'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [complete, setComplete] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== confirmation) {
      setError('Password and confirmation do not match.');
      return;
    }
    setBusy(true);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
      if (!response.ok) throw new Error(payload?.detail ?? 'Password reset failed.');
      setComplete(true);
      setPassword('');
      setConfirmation('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Password reset failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-5 sm:p-7">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">
        Account recovery
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Set a new password</h1>
      {complete ? (
        <div className="mt-6 space-y-5">
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status">
            Password changed. Existing sessions were revoked.
          </p>
          <Link className="inline-flex rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white" href="/login">
            Sign in with the new password
          </Link>
        </div>
      ) : token ? (
        <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
          {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
          <label className="block text-sm font-medium" htmlFor="reset-password">
            New password
          </label>
          <input
            id="reset-password"
            type="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <label className="block text-sm font-medium" htmlFor="reset-confirmation">
            Confirm password
          </label>
          <input
            id="reset-confirmation"
            type="password"
            required
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            className="h-11 w-full rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <p className="text-xs leading-5 text-zinc-500">Use 12 to 128 characters. This display-once recovery link expires at the time shown by the operator.</p>
          <button className="h-11 w-full rounded-lg bg-zinc-950 text-sm font-medium text-white disabled:opacity-50" disabled={busy} type="submit">
            {busy ? 'Changing password…' : 'Change password'}
          </button>
        </form>
      ) : (
        <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
          This recovery link does not contain a reset credential. Ask an authorized platform operator to issue a new display-once link.
        </p>
      )}
    </div>
  );
}
