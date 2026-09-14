'use client';

import { requestJson } from '@/lib/client-api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Container, Heading, Text, Button, Input, Label, Alert } from '@medusajs/ui';

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
    <div className="mx-auto max-w-2xl space-y-6 p-8 font-sans text-ui-fg-base">
      <Link href="/connections" className="text-xs text-ui-fg-muted hover:text-ui-fg-base">
        ← Integration Hub
      </Link>
      <div>
        <Heading level="h1" className="text-2xl font-bold text-ui-fg-base">Create environment</Heading>
        <Text size="small" className="mt-1 text-ui-fg-muted">
          Defines an isolated tenant deployment boundary and retention policy.
        </Text>
      </div>
      <Container className="p-6 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest rounded-xl">
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert variant="error" className="text-xs">{error}</Alert>}
          <Field name="displayName" label="Display name" maxLength={120} />
          <Field name="slug" label="Slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={80} />
          <div className="space-y-1">
            <Label htmlFor="kind" className="text-xs font-medium text-ui-fg-subtle">
              Kind
            </Label>
            <select
              id="kind"
              name="kind"
              required
              className="w-full h-8 px-2.5 text-xs rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-base outline-none focus:border-ui-border-interactive focus:ring-1 focus:ring-ui-border-interactive shadow-borders-base"
            >
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
          <Button
            type="submit"
            disabled={saving}
            variant="primary"
            size="small"
            isLoading={saving}
          >
            Create environment
          </Button>
        </form>
      </Container>
    </div>
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
    <div className="space-y-1">
      <Label htmlFor={name} className="text-xs font-medium text-ui-fg-subtle">
        {label}
      </Label>
      <Input id={name} name={name} type={type} required size="small" {...props} />
    </div>
  );
}
