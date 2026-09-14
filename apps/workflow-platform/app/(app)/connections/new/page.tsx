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

type InterfaceType = 'REST' | 'CSV_HTTP' | 'WEBHOOK' | 'POSTGRESQL' | 'FILE_UPLOAD';

export default function NewConnectionPage() {
  const router = useRouter();
  const [environments, setEnvironments] = useState<TenantEnvironment[]>([]);
  const [credentials, setCredentials] = useState<CredentialReferenceSummary[]>([]);
  const [environmentId, setEnvironmentId] = useState('');
  const [interfaceType, setInterfaceType] = useState<InterfaceType>('REST');
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
          (interfaceType === 'WEBHOOK'
            ? item.authType === 'HMAC_SHA256'
            : interfaceType === 'POSTGRESQL'
              ? item.authType === 'USERNAME_PASSWORD'
              : ['NONE', 'BEARER_TOKEN', 'API_KEY_HEADER'].includes(item.authType)),
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
      interfaceType === 'REST'
        ? { requestMethod: 'GET', accept: 'application/json', sampleRecordLimit }
        : interfaceType === 'CSV_HTTP'
          ? {
              requestMethod: 'GET',
              accept: 'text/csv',
              csvDelimiter: data.get('csvDelimiter'),
              sampleRecordLimit,
            }
          : interfaceType === 'WEBHOOK'
            ? {
                signatureHeader: data.get('signatureHeader'),
                timestampHeader: data.get('timestampHeader'),
                maxSkewSeconds: Number(data.get('maxSkewSeconds')),
                sampleRecordLimit,
              }
            : interfaceType === 'POSTGRESQL'
              ? {
                  schemaName: data.get('schemaName'),
                  tableName: data.get('tableName'),
                  columns: String(data.get('columns') ?? '')
                    .split(',')
                    .map((column) => column.trim())
                    .filter(Boolean),
                  sampleRecordLimit,
                  connectionTimeoutSeconds: Number(data.get('connectionTimeoutSeconds')),
                  statementTimeoutMs: Number(data.get('statementTimeoutMs')),
                  sslMode: data.get('sslMode'),
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
            ...(interfaceType === 'REST' ||
            interfaceType === 'CSV_HTTP' ||
            interfaceType === 'POSTGRESQL'
              ? { endpoint: data.get('endpoint') }
              : {}),
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
          Only read-only, allowlisted endpoints can be tested or profiled.
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
              <option value="REST">REST / JSON</option>
              <option value="CSV_HTTP">CSV over HTTP</option>
              <option value="WEBHOOK">Signed webhook</option>
              <option value="POSTGRESQL">PostgreSQL read-only</option>
              <option value="FILE_UPLOAD">Checksum-verified file upload</option>
            </select>
          </div>
          {(interfaceType === 'REST' || interfaceType === 'CSV_HTTP') && (
            <Field name="endpoint" label="HTTP(S) source URL" type="url" maxLength={2048} />
          )}
          {interfaceType === 'POSTGRESQL' && (
            <Field
              name="endpoint"
              label="PostgreSQL URL without credentials or query parameters"
              type="url"
              maxLength={2048}
            />
          )}
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
                required={interfaceType === 'WEBHOOK' || interfaceType === 'POSTGRESQL'}
                className="w-full h-8 px-2.5 text-xs rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-base outline-none focus:border-ui-border-interactive focus:ring-1 focus:ring-ui-border-interactive shadow-borders-base"
              >
                <option value="">
                  {interfaceType === 'WEBHOOK' || interfaceType === 'POSTGRESQL'
                    ? 'Select required credential'
                    : 'No authentication'}
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
          {(interfaceType === 'CSV_HTTP' || interfaceType === 'FILE_UPLOAD') && (
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
          {interfaceType === 'POSTGRESQL' && (
            <div className="space-y-4 rounded-lg border border-ui-border-base bg-ui-bg-subtle p-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field name="schemaName" label="Schema" maxLength={63} />
                <Field name="tableName" label="Table" maxLength={63} />
              </div>
              <Field name="columns" label="Allowed columns (comma-separated)" maxLength={4096} />
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  name="connectionTimeoutSeconds"
                  label="Connection timeout (seconds)"
                  type="number"
                  min={1}
                  max={60}
                />
                <Field
                  name="statementTimeoutMs"
                  label="Statement timeout (milliseconds)"
                  type="number"
                  min={100}
                  max={120000}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sslMode" className="text-xs font-medium text-ui-fg-subtle">
                  TLS policy
                </Label>
                <select
                  id="sslMode"
                  name="sslMode"
                  required
                  defaultValue=""
                  className="w-full h-8 px-2.5 text-xs rounded-md border border-ui-border-base bg-ui-bg-base text-ui-fg-base outline-none focus:border-ui-border-interactive focus:ring-1 focus:ring-ui-border-interactive shadow-borders-base"
                >
                  <option value="" disabled>
                    Select TLS policy
                  </option>
                  <option value="VERIFY_FULL">Verify certificate and hostname</option>
                  <option value="DISABLE">Disable TLS (private development sources only)</option>
                </select>
              </div>
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
