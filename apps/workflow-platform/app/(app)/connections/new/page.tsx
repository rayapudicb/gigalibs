'use client';

import type {
  CredentialReferenceSummary,
  SourceConnection,
  TenantEnvironment,
} from '@/lib/api-types';
import { requestJson } from '@/lib/client-api';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Container, Heading, Text, Button, Input, Label, Alert } from '@medusajs/ui';

// WI-OI-104f (ADR-0016 F8): sources that are pulled (REST, CSV over HTTP, PostgreSQL) are set up in Connector Hub;
// the core registers only pushed sources here.
type InterfaceType = 'WEBHOOK' | 'FILE_UPLOAD';

export default function NewConnectionPage() {
  const router = useRouter();
  const [environments, setEnvironments] = useState<TenantEnvironment[]>([]);
  const [credentials, setCredentials] = useState<CredentialReferenceSummary[]>([]);
  const [environmentId, setEnvironmentId] = useState('');
  const [interfaceType, setInterfaceType] = useState<InterfaceType>('WEBHOOK');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      requestJson<TenantEnvironment[]>('/api/operational-intelligence/environments'),
      requestJson<CredentialReferenceSummary[]>(
        '/api/operational-intelligence/credential-references',
      ),
    ])
      .then(([environmentRows, credentialRows]) => {
        setEnvironments(environmentRows.filter((row) => row.status === 'ACTIVE'));
        setCredentials(credentialRows.filter((row) => row.status === 'ACTIVE'));
      })
      .catch((cause) =>
        setError(
          cause instanceof Error ? cause.message : 'Unable to load connection prerequisites.',
        ),
      );
  }, []);

  const eligibleCredentials = useMemo(
    () =>
      credentials.filter(
        (item) =>
          item.environmentId === environmentId &&
          interfaceType === 'WEBHOOK' &&
          item.authType === 'HMAC_SHA256',
      ),
    [credentials, environmentId, interfaceType],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const credentialReferenceId = String(data.get('credentialReferenceId') ?? '');
    const sampleRecordLimit = Number(data.get('sampleRecordLimit'));
    const configuration =
      interfaceType === 'WEBHOOK'
        ? {
            signatureHeader: data.get('signatureHeader'),
            timestampHeader: data.get('timestampHeader'),
            maxSkewSeconds: Number(data.get('maxSkewSeconds')),
            sampleRecordLimit,
          }
        : {
            acceptedContentTypes:
              data.get('acceptedContentTypes') === 'JSON_AND_CSV'
                ? ['application/json', 'text/csv']
                : [data.get('acceptedContentTypes')],
            csvDelimiter: data.get('csvDelimiter'),
            sampleRecordLimit,
          };
    try {
      const connection = await requestJson<SourceConnection>(
        '/api/operational-intelligence/connections',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            environmentId,
            credentialReferenceId:
              interfaceType === 'FILE_UPLOAD' ? null : credentialReferenceId || null,
            slug: data.get('slug'),
            name: data.get('name'),
            interfaceType,
            mode: 'READ_ONLY',
            configuration,
          }),
        },
      );
      router.replace(`/connections/${encodeURIComponent(connection.id)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create the connection.');
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8 font-sans text-ui-fg-base">
      <Link href="/connections" className="text-xs text-ui-fg-muted hover:text-ui-fg-base">
        ← Integration Hub
      </Link>
      <div>
        <Heading level="h1" className="text-2xl font-bold text-ui-fg-base">
          Register source connection
        </Heading>
        <Text size="small" className="mt-1 text-ui-fg-muted">
          Register a signed webhook or a checksum-verified file upload. To pull from a REST API or a database, set up a pull
          source in{' '}
          <Link href="/connections" className="text-ui-fg-interactive hover:underline">
            Connector Hub
          </Link>
          .
        </Text>
      </div>
      {environments.length === 0 && !error ? (
        <Alert variant="warning" className="text-xs">
          Create an active environment first.
        </Alert>
      ) : null}
      <Container className="p-6 border border-ui-border-base bg-ui-bg-base shadow-elevation-card-rest rounded-xl">
        <form onSubmit={submit} className="space-y-4">
          {error && <Alert variant="error" className="text-xs">{error}</Alert>}
          <div className="space-y-1">
            <Label htmlFor="environmentId" className="text-xs font-medium text-ui-fg-subtle">
              Environment
            </Label>
            <select
              id="environmentId"
              required
              value={environmentId}
              onChange={(event) => setEnvironmentId(event.target.value)}
              className="w-full h-8 px-2.5 text-xs rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-base outline-none focus:border-ui-border-interactive focus:ring-1 focus:ring-ui-border-interactive shadow-borders-base"
            >
              <option value="">Select environment</option>
              {environments.map((environment) => (
                <option key={environment.id} value={environment.id}>
                  {environment.displayName} ({environment.kind.toLowerCase()})
                </option>
              ))}
            </select>
          </div>
          <Field name="name" label="Connection name" maxLength={160} />
          <Field name="slug" label="Slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={80} />
          <div className="space-y-1">
            <Label htmlFor="interfaceType" className="text-xs font-medium text-ui-fg-subtle">
              Interface
            </Label>
            <select
              id="interfaceType"
              value={interfaceType}
              onChange={(event) => setInterfaceType(event.target.value as InterfaceType)}
              className="w-full h-8 px-2.5 text-xs rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-base outline-none focus:border-ui-border-interactive focus:ring-1 focus:ring-ui-border-interactive shadow-borders-base"
            >
              <option value="WEBHOOK">Signed webhook</option>
              <option value="FILE_UPLOAD">Checksum-verified file upload</option>
            </select>
          </div>
          {interfaceType === 'WEBHOOK' && (
            <div className="rounded-md border border-ui-border-base bg-ui-bg-subtle p-3 text-xs text-ui-fg-muted">
              The authenticated inbound URL is generated after registration.
            </div>
          )}
          {interfaceType !== 'FILE_UPLOAD' && (
            <div className="space-y-1">
              <Label htmlFor="credentialReferenceId" className="text-xs font-medium text-ui-fg-subtle">
                Credential reference
              </Label>
              <select
                id="credentialReferenceId"
                name="credentialReferenceId"
                required={interfaceType === 'WEBHOOK'}
                className="w-full h-8 px-2.5 text-xs rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-base outline-none focus:border-ui-border-interactive focus:ring-1 focus:ring-ui-border-interactive shadow-borders-base"
              >
                <option value="">
                  Select required credential
                </option>
                {eligibleCredentials.map((credential) => (
                  <option key={credential.id} value={credential.id}>
                    {credential.label} ({credential.authType.toLowerCase().replaceAll('_', ' ')})
                  </option>
                ))}
              </select>
              <Text size="xsmall" className="mt-1 text-ui-fg-muted">
                Secret values are resolved by the server and never entered here.{' '}
                <Link href="/connections/credentials" className="text-ui-fg-interactive hover:underline">
                  Manage references
                </Link>
              </Text>
            </div>
          )}
          {interfaceType === 'FILE_UPLOAD' && (
            <Field name="csvDelimiter" label="CSV delimiter" maxLength={1} />
          )}
          {interfaceType === 'WEBHOOK' && (
            <div className="grid gap-4 md:grid-cols-2">
              <Field name="signatureHeader" label="Signature header" maxLength={128} />
              <Field name="timestampHeader" label="Timestamp header" maxLength={128} />
              <Field
                name="maxSkewSeconds"
                label="Maximum timestamp skew (seconds)"
                type="number"
                min={1}
                max={3600}
              />
            </div>
          )}
          {interfaceType === 'FILE_UPLOAD' && (
            <div className="space-y-1">
              <Label htmlFor="acceptedContentTypes" className="text-xs font-medium text-ui-fg-subtle">
                Accepted file content
              </Label>
              <select
                id="acceptedContentTypes"
                name="acceptedContentTypes"
                required
                defaultValue=""
                className="w-full h-8 px-2.5 text-xs rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-base outline-none focus:border-ui-border-interactive focus:ring-1 focus:ring-ui-border-interactive shadow-borders-base"
              >
                <option value="" disabled>
                  Select accepted content
                </option>
                <option value="application/json">JSON</option>
                <option value="text/csv">CSV</option>
                <option value="JSON_AND_CSV">JSON and CSV</option>
              </select>
            </div>
          )}
          <Field
            name="sampleRecordLimit"
            label="Profile sample record limit"
            type="number"
            min={1}
            max={1000}
          />
          <Button
            type="submit"
            disabled={saving || environments.length === 0}
            variant="primary"
            size="small"
            isLoading={saving}
          >
            Register connection
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
