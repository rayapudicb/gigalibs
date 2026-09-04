'use client';

import { requestJson } from '@/lib/client-api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';

export default function NewEnvironmentPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      await requestJson('/api/operational-intelligence/environments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: data.get('slug'),
          displayName: data.get('displayName'),
          kind: data.get('kind'),
          region: data.get('region'),
          retentionDays: Number(data.get('retentionDays')),
        }),
      });
      router.replace('/connections');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create the environment.');
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <Link href="/connections" className="text-sm text-gray-400 hover:text-white">
        ← Integration Hub
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-white">Create environment</h1>
        <p className="mt-1 text-sm text-gray-400">
          Defines an isolated tenant deployment boundary and retention policy.
        </p>
      </div>
      <form
        onSubmit={submit}
        className="space-y-5 rounded-xl border border-gray-800 bg-gray-900 p-6"
      >
        {error && <Alert message={error} />}
        <Field name="displayName" label="Display name" maxLength={120} />
        <Field name="slug" label="Slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={80} />
        <div>
          <Label text="Kind" htmlFor="kind" />
          <select id="kind" name="kind" required className={control}>
            <option value="">Select kind</option>
            <option value="DEVELOPMENT">Development</option>
            <option value="TEST">Test</option>
            <option value="STAGING">Staging</option>
            <option value="PRODUCTION">Production</option>
            <option value="DEMO">Demo</option>
          </select>
        </div>
        <Field name="region" label="Deployment region" maxLength={80} />
        <Field name="retentionDays" label="Retention days" type="number" min={1} max={3650} />
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? 'Creating…' : 'Create environment'}
        </button>
      </form>
    </div>
  );
}

const control =
  'w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-indigo-500';
function Label({ text, htmlFor }: { text: string; htmlFor: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-gray-300">
      {text}
    </label>
  );
}
function Field({
  name,
  label,
  type = 'text',
  ...props
}: {
  name: string;
  label: string;
  type?: string;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
}) {
  return (
    <div>
      <Label text={label} htmlFor={name} />
      <input id={name} name={name} type={type} required className={control} {...props} />
    </div>
  );
}
function Alert({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-red-900 bg-red-950/30 p-3 text-sm text-red-300"
    >
      {message}
    </div>
  );
}
