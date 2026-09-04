'use client';

import type { DataContract, SourceConnection, TenantEnvironment } from '@/lib/api-types';
import { requestJson } from '@/lib/client-api';
import Link from 'next/link';
import { type FormEvent, useCallback, useEffect, useState } from 'react';

export default function DataContractsPage() {
  const [contracts, setContracts] = useState<DataContract[]>([]);
  const [environments, setEnvironments] = useState<TenantEnvironment[]>([]);
  const [connections, setConnections] = useState<SourceConnection[]>([]);
  const [selectedContractId, setSelectedContractId] = useState('');
  const [schemaText, setSchemaText] = useState('');
  const [mappingText, setMappingText] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [contractRows, environmentRows, connectionRows] = await Promise.all([
        requestJson<DataContract[]>('/api/operational-intelligence/data-contracts'),
        requestJson<TenantEnvironment[]>('/api/operational-intelligence/environments'),
        requestJson<SourceConnection[]>('/api/operational-intelligence/connections'),
      ]);
      setContracts(contractRows);
      setEnvironments(environmentRows);
      setConnections(connectionRows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load data contracts.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    try {
      const created = await requestJson<DataContract>(
        '/api/operational-intelligence/data-contracts',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            environmentId: data.get('environmentId'),
            connectionId: data.get('connectionId'),
            name: data.get('name'),
            eventType: data.get('eventType'),
          }),
        },
      );
      setSelectedContractId(created.id);
      event.currentTarget.reset();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create the contract.');
    } finally {
      setWorking(false);
    }
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const jsonSchema: unknown = JSON.parse(schemaText);
      const mapping: unknown = mappingText.trim() ? JSON.parse(mappingText) : {};
      await requestJson(
        `/api/operational-intelligence/data-contracts/${encodeURIComponent(selectedContractId)}/publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonSchema,
            mapping,
            compatibilityMode: new FormData(event.currentTarget).get('compatibilityMode'),
          }),
        },
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to publish the contract.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="space-y-8 p-8">
      <div>
        <Link href="/connections" className="text-sm text-gray-400 hover:text-white">
          ← Integration Hub
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-white">Data contracts</h1>
        <p className="mt-1 text-sm text-gray-400">
          Versioned JSON schemas gate every accepted operational event.
        </p>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-900 bg-red-950/30 p-4 text-sm text-red-300"
        >
          {error}
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-2">
        <form
          onSubmit={create}
          className="space-y-4 rounded-xl border border-gray-800 bg-gray-900 p-5"
        >
          <h2 className="font-semibold text-white">Create contract draft</h2>
          <Field name="name" label="Contract name" />
          <Field name="eventType" label="Event type (for example namespace.event.v1)" />
          <Select
            name="environmentId"
            label="Environment"
            options={environments.map((item) => ({ value: item.id, label: item.displayName }))}
          />
          <Select
            name="connectionId"
            label="Source connection"
            options={connections.map((item) => ({ value: item.id, label: item.name }))}
          />
          <button type="submit" disabled={working} className={primary}>
            Create draft
          </button>
        </form>
        <form
          onSubmit={publish}
          className="space-y-4 rounded-xl border border-gray-800 bg-gray-900 p-5"
        >
          <h2 className="font-semibold text-white">Publish immutable version</h2>
          <Select
            name="contractId"
            label="Contract"
            value={selectedContractId}
            onChange={setSelectedContractId}
            options={contracts.map((item) => ({
              value: item.id,
              label: `${item.name} · ${item.status.toLowerCase()}`,
            }))}
          />
          <div>
            <Label text="JSON Schema" htmlFor="jsonSchema" />
            <textarea
              id="jsonSchema"
              required
              value={schemaText}
              onChange={(event) => setSchemaText(event.target.value)}
              rows={10}
              spellCheck={false}
              className={`${control} font-mono text-xs`}
            />
          </div>
          <div>
            <Label text="Mapping (optional JSON object)" htmlFor="mapping" />
            <textarea
              id="mapping"
              value={mappingText}
              onChange={(event) => setMappingText(event.target.value)}
              rows={4}
              spellCheck={false}
              className={`${control} font-mono text-xs`}
            />
          </div>
          <Select
            name="compatibilityMode"
            label="Compatibility mode"
            options={['BACKWARD', 'FORWARD', 'FULL', 'NONE'].map((value) => ({
              value,
              label: value.toLowerCase(),
            }))}
          />
          <button type="submit" disabled={working || !selectedContractId} className={primary}>
            Publish version
          </button>
        </form>
      </div>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
          Published registry
        </h2>
        {contracts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-700 p-10 text-center text-sm text-gray-400">
            No contracts registered.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900">
            {contracts.map((contract) => (
              <div
                key={contract.id}
                className="grid grid-cols-12 gap-3 border-b border-gray-800 px-5 py-4 last:border-0"
              >
                <div className="col-span-4">
                  <div className="font-semibold text-white">{contract.name}</div>
                  <div className="mt-1 text-xs text-gray-500">{contract.eventType}</div>
                </div>
                <div className="col-span-3 self-center text-sm text-gray-300">
                  {contract.connection?.name ?? contract.connectionId}
                </div>
                <div className="col-span-2 self-center text-sm text-gray-300">
                  {contract.status.toLowerCase()}
                </div>
                <div className="col-span-1 self-center text-sm text-gray-300">
                  {contract.currentVersion ? `v${contract.currentVersion}` : '—'}
                </div>
                <div className="col-span-2 self-center text-right text-xs text-gray-500">
                  {new Date(contract.updatedAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const control =
  'w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-white outline-none focus:border-indigo-500';
const primary =
  'rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50';
function Label({ text, htmlFor }: { text: string; htmlFor: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-gray-300">
      {text}
    </label>
  );
}
function Field({ name, label }: { name: string; label: string }) {
  return (
    <div>
      <Label text={label} htmlFor={name} />
      <input id={name} name={name} required maxLength={160} className={control} />
    </div>
  );
}
function Select({
  name,
  label,
  options,
  value,
  onChange,
}: {
  name: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div>
      <Label text={label} htmlFor={name} />
      <select
        id={name}
        name={name}
        required
        value={value}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        className={control}
      >
        <option value="">Select</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
