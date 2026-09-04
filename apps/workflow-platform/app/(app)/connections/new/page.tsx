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
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <Link href="/connections" className="text-sm text-gray-400 hover:text-white">
        ← Integration Hub
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-white">Register source connection</h1>
        <p className="mt-1 text-sm text-gray-400">
          Only read-only, allowlisted endpoints can be tested or profiled.
        </p>
      </div>
      {environments.length === 0 && !error ? (
        <div className="rounded-lg border border-amber-900 bg-amber-950/30 p-4 text-sm text-amber-300">
          Create an active environment first.
        </div>
      ) : null}
      <form
        onSubmit={submit}
        className="space-y-5 rounded-xl border border-gray-800 bg-gray-900 p-6"
      >
        {error && <Alert message={error} />}
        <div>
          <Label text="Environment" htmlFor="environmentId" />
          <select
            id="environmentId"
            required
            value={environmentId}
            onChange={(event) => setEnvironmentId(event.target.value)}
            className={control}
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
        <div>
          <Label text="Interface" htmlFor="interfaceType" />
          <select
            id="interfaceType"
            value={interfaceType}
            onChange={(event) => setInterfaceType(event.target.value as InterfaceType)}
            className={control}
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
          <p className="rounded-lg border border-gray-800 bg-gray-950 p-3 text-sm text-gray-400">
            The authenticated inbound URL is generated after registration.
          </p>
        )}
        {interfaceType !== 'FILE_UPLOAD' && (
          <div>
            <Label text="Credential reference" htmlFor="credentialReferenceId" />
            <select
              id="credentialReferenceId"
              name="credentialReferenceId"
              required={interfaceType === 'WEBHOOK' || interfaceType === 'POSTGRESQL'}
              className={control}
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
            <p className="mt-1 text-xs text-gray-500">
              Secret values are resolved by the server and never entered here.{' '}
              <Link href="/connections/credentials" className="text-indigo-400 hover:text-indigo-300">
                Manage references
              </Link>
            </p>
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
          <div className="space-y-4 rounded-lg border border-gray-800 bg-gray-950 p-4">
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
            <div>
              <Label text="TLS policy" htmlFor="sslMode" />
              <select id="sslMode" name="sslMode" required defaultValue="" className={control}>
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
          <div>
            <Label text="Accepted file content" htmlFor="acceptedContentTypes" />
            <select
              id="acceptedContentTypes"
              name="acceptedContentTypes"
              required
              defaultValue=""
              className={control}
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
        <button
          type="submit"
          disabled={saving || environments.length === 0}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {saving ? 'Registering…' : 'Register connection'}
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
