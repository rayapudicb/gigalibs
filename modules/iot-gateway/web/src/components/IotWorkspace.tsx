'use client';

import { Container, Heading, StatusBadge, Table, Text, Button, Input } from '@medusajs/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { iotApi } from '../api';

export type IotSection = 'home' | 'devices' | 'protocols' | 'rules' | 'discovery' | 'alerts';

const NAV: ReadonlyArray<{ key: IotSection; label: string; href: string }> = [
  { key: 'home', label: 'Dashboard', href: '/iot' },
  { key: 'devices', label: 'Devices', href: '/iot/devices' },
  { key: 'protocols', label: 'Protocols', href: '/iot/protocols' },
  { key: 'rules', label: 'Rules', href: '/iot/rules' },
  { key: 'discovery', label: 'Discovery', href: '/iot/discovery' },
  { key: 'alerts', label: 'Alerts', href: '/iot/alerts' },
];

export function IotWorkspace({ section }: { section: IotSection }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof iotApi.dashboard>> | null>(null);
  const [devices, setDevices] = useState<unknown[]>([]);
  const [alerts, setAlerts] = useState<unknown[]>([]);
  const [rules, setRules] = useState<unknown[]>([]);
  const [adapters, setAdapters] = useState<unknown[]>([]);
  const [discovery, setDiscovery] = useState<unknown>(null);
  const [subnet, setSubnet] = useState('192.168.1.0/24');
  const [newDeviceName, setNewDeviceName] = useState('');
  const [provisionedCredential, setProvisionedCredential] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (section === 'home') setDashboard(await iotApi.dashboard());
      if (section === 'devices') setDevices((await iotApi.devices()).items);
      if (section === 'alerts') setAlerts((await iotApi.alerts()).items);
      if (section === 'rules') setRules((await iotApi.rules()).items);
      if (section === 'protocols') setAdapters((await iotApi.protocols()).adapters);
      if (section === 'discovery') setDiscovery(await iotApi.discovery());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to load IoT data.');
    } finally {
      setBusy(false);
    }
  }, [section]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createDevice() {
    if (!newDeviceName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const created = (await iotApi.createDevice({
        name: newDeviceName.trim(),
        protocol: 'HTTP',
        protocolConfig: { mode: 'webhook' },
      })) as { credential?: string };
      setProvisionedCredential(created.credential ?? null);
      setNewDeviceName('');
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Provision failed.');
    } finally {
      setBusy(false);
    }
  }

  async function runScan() {
    setBusy(true);
    try {
      setDiscovery(await iotApi.scan(subnet));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Scan failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Heading level="h1">IoT Gateway</Heading>
        <nav className="flex flex-wrap gap-2">
          {NAV.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className={`rounded px-3 py-1 text-xs ${section === item.key ? 'bg-ui-bg-highlight font-semibold' : 'text-ui-fg-subtle hover:text-ui-fg-base'}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      {error ? (
        <Text size="small" className="text-ui-fg-error">
          {error}
        </Text>
      ) : null}
      {busy ? <Text size="small">Loading…</Text> : null}

      {section === 'home' && dashboard ? (
        <Container className="p-4 grid gap-4 md:grid-cols-4">
          {[
            ['Devices', dashboard.kpis.devicesRegistered],
            ['Online', dashboard.kpis.devicesOnline],
            ['Offline', dashboard.kpis.devicesOffline],
            ['Critical alerts', dashboard.kpis.activeCriticalAlerts],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded border border-ui-border-base p-3">
              <Text size="xsmall" className="text-ui-fg-subtle">
                {label}
              </Text>
              <Heading level="h2">{value}</Heading>
            </div>
          ))}
        </Container>
      ) : null}

      {section === 'devices' ? (
        <Container className="p-4 space-y-4">
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <Text size="xsmall">Device name</Text>
              <Input value={newDeviceName} onChange={(e) => setNewDeviceName(e.target.value)} />
            </div>
            <Button onClick={() => void createDevice()} disabled={busy}>
              + New Device
            </Button>
          </div>
          {provisionedCredential ? (
            <Text size="small" className="font-mono break-all">
              Credential (copy now): {provisionedCredential}
            </Text>
          ) : null}
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Name</Table.HeaderCell>
                <Table.HeaderCell>Protocol</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell>Asset</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {devices.map((row) => {
                const d = row as Record<string, string | null>;
                return (
                  <Table.Row key={String(d.id)}>
                    <Table.Cell>{d.name}</Table.Cell>
                    <Table.Cell>{d.protocol}</Table.Cell>
                    <Table.Cell>
                      <StatusBadge color={d.status === 'ONLINE' ? 'green' : d.status === 'ALERT' ? 'red' : 'grey'}>
                        {d.status}
                      </StatusBadge>
                    </Table.Cell>
                    <Table.Cell>{d.bound_asset_tag ?? 'Unbound'}</Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
        </Container>
      ) : null}

      {section === 'alerts' ? (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Severity</Table.HeaderCell>
              <Table.HeaderCell>Metric</Table.HeaderCell>
              <Table.HeaderCell>Value</Table.HeaderCell>
              <Table.HeaderCell>Asset</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {alerts.map((row) => {
              const a = row as Record<string, string | number>;
              return (
                <Table.Row key={String(a.id)}>
                  <Table.Cell>{a.severity}</Table.Cell>
                  <Table.Cell>{a.metric_type}</Table.Cell>
                  <Table.Cell>{a.observed_value}</Table.Cell>
                  <Table.Cell>{a.cmms_asset_tag ?? '—'}</Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table>
      ) : null}

      {section === 'rules' ? (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Name</Table.HeaderCell>
              <Table.HeaderCell>Metric</Table.HeaderCell>
              <Table.HeaderCell>Condition</Table.HeaderCell>
              <Table.HeaderCell>Severity</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rules.map((row) => {
              const r = row as Record<string, string>;
              return (
                <Table.Row key={String(r.id)}>
                  <Table.Cell>{r.name}</Table.Cell>
                  <Table.Cell>{r.metric_type}</Table.Cell>
                  <Table.Cell>{r.condition_type}</Table.Cell>
                  <Table.Cell>{r.severity}</Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table>
      ) : null}

      {section === 'protocols' ? (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Adapter</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Devices</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {adapters.map((row) => {
              const p = row as Record<string, string | number>;
              return (
                <Table.Row key={String(p.adapter_key)}>
                  <Table.Cell>{p.adapter_key}</Table.Cell>
                  <Table.Cell>{p.status}</Table.Cell>
                  <Table.Cell>{p.device_count}</Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table>
      ) : null}

      {section === 'discovery' ? (
        <Container className="p-4 space-y-3">
          <div className="flex gap-2 items-end">
            <Input value={subnet} onChange={(e) => setSubnet(e.target.value)} />
            <Button onClick={() => void runScan()} disabled={busy}>
              Start Scan
            </Button>
          </div>
          <Text size="xsmall" className="text-ui-fg-subtle">
            Provisioning from discovery requires confirming the CMMS asset binding in the device drawer.
          </Text>
          <pre className="text-xs overflow-auto">{JSON.stringify(discovery, null, 2)}</pre>
        </Container>
      ) : null}
    </div>
  );
}
