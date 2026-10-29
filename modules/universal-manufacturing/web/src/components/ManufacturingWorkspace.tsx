'use client';

import { Button, Container, Heading, Input, StatusBadge, Table, Text } from '@medusajs/ui';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { manufacturingApi } from '../api.js';

export type ManufacturingSection = 'home' | 'boms' | 'production' | 'mrp';

const NAV: ReadonlyArray<{ key: ManufacturingSection; label: string; href: string }> = [
  { key: 'home', label: 'Overview', href: '/universal-manufacturing' },
  { key: 'boms', label: 'BOMs', href: '/universal-manufacturing/boms' },
  { key: 'production', label: 'Production', href: '/universal-manufacturing/production' },
  { key: 'mrp', label: 'MRP preview', href: '/universal-manufacturing/mrp' },
];

export function ManufacturingWorkspace({ section }: { section: ManufacturingSection }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [boms, setBoms] = useState<unknown[]>([]);
  const [selectedBomId, setSelectedBomId] = useState<string | null>(null);
  const [bomTree, setBomTree] = useState<{ unitRequirements: Array<{ productId: string; quantity: string }> } | null>(
    null,
  );
  const [orders, setOrders] = useState<unknown[]>([]);
  const [mrpLines, setMrpLines] = useState<unknown[]>([]);
  const [mrpProductId, setMrpProductId] = useState('');
  const [mrpDemand, setMrpDemand] = useState('10');
  const [mrpSupply, setMrpSupply] = useState('3');
  const [warehouseId, setWarehouseId] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (section === 'boms' || section === 'home') {
        setBoms(await manufacturingApi.listBoms());
      }
      if (section === 'production' || section === 'home') {
        setOrders(await manufacturingApi.listProductionOrders());
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to load manufacturing data.');
    } finally {
      setBusy(false);
    }
  }, [section]);

  useEffect(() => {
    void load();
  }, [load]);

  async function loadTree(bomId: string) {
    setSelectedBomId(bomId);
    setBusy(true);
    try {
      const tree = await manufacturingApi.bomTree(bomId);
      setBomTree({ unitRequirements: tree.unitRequirements as Array<{ productId: string; quantity: string }> });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'BOM tree failed.');
    } finally {
      setBusy(false);
    }
  }

  async function runMrp() {
    if (!warehouseId.trim() || !mrpProductId.trim()) {
      setError('Warehouse and product IDs are required for MRP preview.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = (await manufacturingApi.mrpPreview({
        warehouseId: warehouseId.trim(),
        rows: [{ productId: mrpProductId.trim(), demand: mrpDemand, supply: mrpSupply }],
      })) as { lines: unknown[] };
      setMrpLines(result.lines ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'MRP preview failed.');
    } finally {
      setBusy(false);
    }
  }

  async function releaseOrder(id: string) {
    setBusy(true);
    try {
      await manufacturingApi.releaseProductionOrder(id);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Release failed.');
    } finally {
      setBusy(false);
    }
  }

  async function issueOrder(id: string) {
    setBusy(true);
    try {
      await manufacturingApi.issueProductionOrder(id);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Issue failed.');
    } finally {
      setBusy(false);
    }
  }

  async function completeOrder(id: string) {
    setBusy(true);
    try {
      await manufacturingApi.completeProductionOrder(id);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Complete failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Heading level="h1">Manufacturing &amp; MRP</Heading>
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
        <Container className="border border-ui-border-error bg-ui-bg-subtle p-3">
          <Text size="small" className="text-ui-fg-error">
            {error}
          </Text>
        </Container>
      ) : null}
      {busy ? <Text size="small">Loading…</Text> : null}

      {(section === 'home' || section === 'boms') && (
        <Container className="p-4">
          <Heading level="h2" className="mb-3">
            Bill of materials
          </Heading>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Code</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell>Finished product</Table.HeaderCell>
                <Table.HeaderCell />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {(boms as Array<{ id: string; bom_code: string; status: string; finished_product_id: string }>).map(
                (bom) => (
                  <Table.Row key={bom.id}>
                    <Table.Cell>{bom.bom_code}</Table.Cell>
                    <Table.Cell>
                      <StatusBadge color={bom.status === 'ACTIVE' ? 'green' : 'grey'}>{bom.status}</StatusBadge>
                    </Table.Cell>
                    <Table.Cell className="font-mono text-xs">{bom.finished_product_id}</Table.Cell>
                    <Table.Cell>
                      <Button size="small" variant="secondary" onClick={() => void loadTree(bom.id)}>
                        Explode
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                ),
              )}
            </Table.Body>
          </Table>
          {selectedBomId && bomTree ? (
            <div className="mt-4 space-y-2">
              <Text weight="plus">Unit requirements (BOM {selectedBomId.slice(0, 8)}…)</Text>
              <ul className="text-sm">
                {bomTree.unitRequirements.map((row) => (
                  <li key={row.productId} className="font-mono">
                    {row.productId} × {row.quantity}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Container>
      )}

      {(section === 'home' || section === 'production') && (
        <Container className="p-4">
          <Heading level="h2" className="mb-3">
            Production orders
          </Heading>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Order</Table.HeaderCell>
                <Table.HeaderCell>Qty</Table.HeaderCell>
                <Table.HeaderCell>Status</Table.HeaderCell>
                <Table.HeaderCell />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {(
                orders as Array<{ id: string; order_number: string; quantity: string; status: string }>
              ).map((order) => (
                <Table.Row key={order.id}>
                  <Table.Cell>{order.order_number}</Table.Cell>
                  <Table.Cell>{order.quantity}</Table.Cell>
                  <Table.Cell>
                    <StatusBadge>{order.status}</StatusBadge>
                  </Table.Cell>
                  <Table.Cell className="flex gap-2">
                    {order.status === 'DRAFT' ? (
                      <Button size="small" onClick={() => void releaseOrder(order.id)}>
                        Release
                      </Button>
                    ) : null}
                    {order.status === 'RELEASED' ? (
                      <Button size="small" variant="secondary" onClick={() => void issueOrder(order.id)}>
                        Issue
                      </Button>
                    ) : null}
                    {order.status === 'RELEASED' || order.status === 'ISSUED' ? (
                      <Button size="small" variant="secondary" onClick={() => void completeOrder(order.id)}>
                        Complete
                      </Button>
                    ) : null}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </Container>
      )}

      {section === 'mrp' && (
        <Container className="space-y-3 p-4">
          <Heading level="h2">MRP preview</Heading>
          <div className="grid max-w-xl gap-2">
            <Input placeholder="Warehouse UUID" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} />
            <Input placeholder="Product UUID" value={mrpProductId} onChange={(e) => setMrpProductId(e.target.value)} />
            <Input placeholder="Demand" value={mrpDemand} onChange={(e) => setMrpDemand(e.target.value)} />
            <Input placeholder="Supply" value={mrpSupply} onChange={(e) => setMrpSupply(e.target.value)} />
            <Button onClick={() => void runMrp()}>Run preview</Button>
          </div>
          {mrpLines.length > 0 ? (
            <pre className="overflow-auto rounded bg-ui-bg-subtle p-2 text-xs">{JSON.stringify(mrpLines, null, 2)}</pre>
          ) : null}
        </Container>
      )}
    </div>
  );
}
