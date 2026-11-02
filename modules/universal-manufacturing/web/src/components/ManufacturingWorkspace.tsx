'use client';

import { Button, Container, FocusModal, Heading, Input, StatusBadge, Table, Text } from '@medusajs/ui';
import { ModulePage } from '@gigalibs/web-sdk';
import { useCallback, useEffect, useState } from 'react';
import { manufacturingApi } from '../api.js';

export type ManufacturingSection = 'home' | 'boms' | 'production' | 'mrp';
type BomLineDraft = { componentProductId: string; uomId: string; quantityPer: string; subBomId: string };
type OrderDetail = {
  id: string; order_number: string; status: string; quantity: string; last_error_code: string | null;
  inventory_receipt_id: string | null;
  lines: Array<{ id: string; line_number: number; component_product_id: string; required_quantity: string;
    issued_quantity: string; reservation_id: string | null }>;
};

// WI-OI-145: the sidebar is Manufacturing's only menu; each screen has the shared page header with its sidebar name.
const SCREENS: Readonly<Record<ManufacturingSection, { readonly title: string; readonly description: string }>> = {
  home: { title: 'Overview', description: 'Bills of materials and the production orders in progress.' },
  boms: { title: 'BOMs', description: 'What each product is made of, and the shortages for a planned run.' },
  production: { title: 'Production', description: 'Production orders from release to completion.' },
  mrp: { title: 'MRP preview', description: 'What to make and buy to meet demand, before anything is ordered.' },
};

export function ManufacturingWorkspace({ section }: { section: ManufacturingSection }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [boms, setBoms] = useState<unknown[]>([]);
  const [selectedBomId, setSelectedBomId] = useState<string | null>(null);
  const [bomTree, setBomTree] = useState<{ unitRequirements: Array<{ productId: string; quantity: string }> } | null>(
    null,
  );
  const [shortages, setShortages] = useState<Array<{ productId: string; needed: string; available: string; decision: 'AVAILABLE' | 'SHORT' }>>([]);
  const [bomQuantity, setBomQuantity] = useState('1');
  const [orders, setOrders] = useState<unknown[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetail | null>(null);
  const [bomCode, setBomCode] = useState('');
  const [finishedProductId, setFinishedProductId] = useState('');
  const [scrapPercent, setScrapPercent] = useState('0');
  const [bomLines, setBomLines] = useState<BomLineDraft[]>([
    { componentProductId: '', uomId: '', quantityPer: '', subBomId: '' },
  ]);
  const [orderBomId, setOrderBomId] = useState('');
  const [orderQuantity, setOrderQuantity] = useState('');
  const [finishedUomId, setFinishedUomId] = useState('');
  const [workCenters, setWorkCenters] = useState<unknown[]>([]);
  const [routings, setRoutings] = useState<unknown[]>([]);
  const [workCenterCode, setWorkCenterCode] = useState('');
  const [workCenterName, setWorkCenterName] = useState('');
  const [routingBomId, setRoutingBomId] = useState('');
  const [routingWorkCenterId, setRoutingWorkCenterId] = useState('');
  const [routingSetupMinutes, setRoutingSetupMinutes] = useState('0');
  const [routingRunMinutes, setRoutingRunMinutes] = useState('0');
  const [whereUsedProductId, setWhereUsedProductId] = useState('');
  const [whereUsed, setWhereUsed] = useState<unknown[]>([]);
  const [mrpLines, setMrpLines] = useState<unknown[]>([]);
  const [mrpProductId, setMrpProductId] = useState('');
  const [mrpDemand, setMrpDemand] = useState('');
  const [mrpSupply, setMrpSupply] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [orgUnitId, setOrgUnitId] = useState('');

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (section === 'boms' || section === 'home') {
        setBoms(await manufacturingApi.listBoms());
        if (section === 'boms') {
          setWorkCenters(await manufacturingApi.listWorkCenters());
          setRoutings(await manufacturingApi.listRoutings());
        }
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

  const loadShortages = useCallback(async () => {
    if (!selectedBomId || !warehouseId.trim() || !bomQuantity.trim()) return;
    try {
      const result = await manufacturingApi.bomShortages(selectedBomId, warehouseId.trim(), bomQuantity.trim());
      setShortages(result.lines as typeof shortages);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Inventory availability is unavailable.');
      setShortages([]);
    }
  }, [selectedBomId, warehouseId, bomQuantity]);

  useEffect(() => {
    if (!selectedBomId || !warehouseId.trim() || section !== 'boms') return;
    void loadShortages();
    const timer = window.setInterval(() => void loadShortages(), 15_000);
    return () => window.clearInterval(timer);
  }, [loadShortages, selectedBomId, warehouseId, section]);

  async function loadTree(bomId: string) {
    setSelectedBomId(bomId);
    setShortages([]);
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

  function setLine(index: number, update: Partial<BomLineDraft>) {
    setBomLines((current) => current.map((line, i) => i === index ? { ...line, ...update } : line));
  }

  async function createBom() {
    setBusy(true); setError(null);
    try {
      await manufacturingApi.createBom({ bomCode, finishedProductId, orgUnitId,
        scrapPercent, lines: bomLines.map(({ subBomId, ...line }) =>
          subBomId.trim() ? { ...line, subBomId } : line),
      });
      setBomCode(''); setFinishedProductId('');
      setBomLines([{ componentProductId: '', uomId: '', quantityPer: '', subBomId: '' }]);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'BOM creation failed.');
    } finally { setBusy(false); }
  }

  async function createWorkCenter() {
    setBusy(true); setError(null);
    try {
      await manufacturingApi.createWorkCenter({ code: workCenterCode, name: workCenterName, orgUnitId });
      setWorkCenterCode(''); setWorkCenterName(''); await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Work center creation failed.');
    } finally { setBusy(false); }
  }

  async function createRouting() {
    setBusy(true); setError(null);
    try {
      await manufacturingApi.createRouting({ bomId: routingBomId, orgUnitId,
        steps: [{ workCenterId: routingWorkCenterId, setupMinutes: routingSetupMinutes,
          runMinutesPerUnit: routingRunMinutes }],
      });
      setRoutingBomId(''); setRoutingWorkCenterId(''); await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Routing creation failed.');
    } finally { setBusy(false); }
  }

  async function searchWhereUsed() {
    setBusy(true); setError(null);
    try { setWhereUsed(await manufacturingApi.whereUsed(whereUsedProductId.trim())); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Where-used search failed.'); }
    finally { setBusy(false); }
  }

  async function createOrder() {
    setBusy(true); setError(null);
    try {
      await manufacturingApi.createProductionOrder({ bomId: orderBomId, warehouseId, finishedUomId,
        quantity: orderQuantity, orgUnitId });
      setOrderQuantity(''); await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Production order creation failed.');
    } finally { setBusy(false); }
  }

  async function openOrder(id: string) {
    setBusy(true); setError(null);
    try { setSelectedOrder(await manufacturingApi.productionOrder(id) as OrderDetail); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Order detail failed.'); }
    finally { setBusy(false); }
  }

  async function runMrp() {
    if (!warehouseId.trim() || !mrpProductId.trim() || !orgUnitId.trim()) {
      setError('Organization unit, warehouse and product IDs are required for MRP preview.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = (await manufacturingApi.mrpPreview({
        warehouseId: warehouseId.trim(),
        orgUnitId: orgUnitId.trim(),
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
      if (selectedOrder?.id === id) await openOrder(id);
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
      if (selectedOrder?.id === id) await openOrder(id);
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
      if (selectedOrder?.id === id) await openOrder(id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Complete failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModulePage title={SCREENS[section].title} description={SCREENS[section].description}>
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
          {section === 'boms' ? (
            <div className="mt-5 space-y-4 border-t border-ui-border-base pt-4">
              <Heading level="h3">Create BOM</Heading>
              <div className="grid gap-2 md:grid-cols-4">
                <Input aria-label="BOM code" placeholder="BOM code" value={bomCode} onChange={(e) => setBomCode(e.target.value)} />
                <Input aria-label="Finished product UUID" placeholder="Finished product UUID" value={finishedProductId} onChange={(e) => setFinishedProductId(e.target.value)} />
                <Input aria-label="Owning unit" placeholder="Owning unit" value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)} />
                <Input aria-label="Scrap percent" placeholder="Scrap percent" value={scrapPercent} onChange={(e) => setScrapPercent(e.target.value)} />
              </div>
              {bomLines.map((line, index) => (
                <div key={index} className="grid gap-2 md:grid-cols-5">
                  <Input aria-label={`Component ${index + 1} product UUID`} placeholder="Component product UUID" value={line.componentProductId} onChange={(e) => setLine(index, { componentProductId: e.target.value })} />
                  <Input aria-label={`Component ${index + 1} UOM UUID`} placeholder="UOM UUID" value={line.uomId} onChange={(e) => setLine(index, { uomId: e.target.value })} />
                  <Input aria-label={`Component ${index + 1} quantity`} placeholder="Quantity per" value={line.quantityPer} onChange={(e) => setLine(index, { quantityPer: e.target.value })} />
                  <Input aria-label={`Component ${index + 1} sub BOM UUID`} placeholder="Sub-BOM UUID (optional)" value={line.subBomId} onChange={(e) => setLine(index, { subBomId: e.target.value })} />
                  <Button variant="secondary" disabled={bomLines.length === 1} onClick={() => setBomLines((rows) => rows.filter((_, i) => i !== index))}>Remove</Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setBomLines((rows) => [...rows, { componentProductId: '', uomId: '', quantityPer: '', subBomId: '' }])}>Add component</Button>
                <Button disabled={busy} onClick={() => void createBom()}>Save BOM</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Input className="max-w-md" aria-label="Where used product UUID" placeholder="Where-used product UUID" value={whereUsedProductId} onChange={(e) => setWhereUsedProductId(e.target.value)} />
                <Button variant="secondary" disabled={busy || !whereUsedProductId.trim()} onClick={() => void searchWhereUsed()}>Where used</Button>
              </div>
              {whereUsed.length ? <ul className="text-sm">{(whereUsed as Array<{ bomId: string; bomCode: string; depth: number }>).map((row) =>
                <li key={row.bomId}>{row.bomCode} · level {row.depth}</li>)}</ul> : null}
              <Heading level="h3">Work centers and routings</Heading>
              <div className="grid gap-2 md:grid-cols-4">
                <Input aria-label="Work center code" placeholder="Work center code" value={workCenterCode} onChange={(e) => setWorkCenterCode(e.target.value)} />
                <Input aria-label="Work center name" placeholder="Work center name" value={workCenterName} onChange={(e) => setWorkCenterName(e.target.value)} />
                <Text size="small">{workCenters.length} work centers · {routings.length} routings</Text>
                <Button disabled={busy || !orgUnitId.trim()} onClick={() => void createWorkCenter()}>Add work center</Button>
              </div>
              <div className="grid gap-2 md:grid-cols-5">
                <Input aria-label="Routing BOM UUID" placeholder="Routing BOM UUID" value={routingBomId} onChange={(e) => setRoutingBomId(e.target.value)} />
                <Input aria-label="Routing work center UUID" placeholder="Work center UUID" value={routingWorkCenterId} onChange={(e) => setRoutingWorkCenterId(e.target.value)} />
                <Input aria-label="Routing setup minutes" placeholder="Setup minutes" value={routingSetupMinutes} onChange={(e) => setRoutingSetupMinutes(e.target.value)} />
                <Input aria-label="Routing run minutes per unit" placeholder="Run minutes per unit" value={routingRunMinutes} onChange={(e) => setRoutingRunMinutes(e.target.value)} />
                <Button disabled={busy || !orgUnitId.trim()} onClick={() => void createRouting()}>Create routing</Button>
              </div>
              <ul className="text-sm">{(workCenters as Array<{ id: string; code: string; name: string }>).map((center) =>
                <li key={center.id}>{center.code} · {center.name} · <span className="font-mono">{center.id}</span></li>)}</ul>
            </div>
          ) : null}
          {selectedBomId && bomTree ? (
            <div className="mt-4 space-y-2">
              <Text weight="plus">Unit requirements (BOM {selectedBomId.slice(0, 8)}…)</Text>
              <div className="flex flex-wrap gap-2">
                <Input className="max-w-xs" aria-label="Shortage warehouse UUID" placeholder="Warehouse UUID for availability" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} />
                <Input className="max-w-32" aria-label="Finished quantity for shortages" placeholder="Finished quantity" value={bomQuantity} onChange={(e) => setBomQuantity(e.target.value)} />
                <Button variant="secondary" disabled={!warehouseId.trim()} onClick={() => void loadShortages()}>Refresh availability</Button>
              </div>
              <ul className="text-sm">
                {bomTree.unitRequirements.map((row) => (
                  <li key={row.productId} className="flex flex-wrap items-center gap-2 font-mono">
                    <span>{row.productId} × {row.quantity} per unit</span>
                    {shortages.find((stock) => stock.productId === row.productId) ?
                      <StatusBadge color={shortages.find((stock) => stock.productId === row.productId)?.decision === 'AVAILABLE' ? 'green' : 'red'}>
                        {shortages.find((stock) => stock.productId === row.productId)?.decision === 'AVAILABLE' ? 'Available' : 'Short'}
                      </StatusBadge> : null}
                    {shortages.find((stock) => stock.productId === row.productId) ?
                      <span>Need {shortages.find((stock) => stock.productId === row.productId)?.needed}; ATP {shortages.find((stock) => stock.productId === row.productId)?.available}</span> : null}
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
                orders as Array<{ id: string; order_number: string; quantity: string; status: string; last_error_code?: string | null }>
              ).map((order) => (
                <Table.Row key={order.id}>
                  <Table.Cell>{order.order_number}</Table.Cell>
                  <Table.Cell>{order.quantity}</Table.Cell>
                  <Table.Cell>
                    <StatusBadge>{order.status}</StatusBadge>
                    {order.last_error_code ? <Text size="xsmall">{order.last_error_code}</Text> : null}
                  </Table.Cell>
                  <Table.Cell className="flex gap-2">
                    <Button size="small" variant="secondary" onClick={() => void openOrder(order.id)}>Inspect</Button>
                    {order.status === 'DRAFT' || order.status === 'RESERVING' ? (
                      <Button size="small" onClick={() => void releaseOrder(order.id)}>
                        {order.status === 'RESERVING' ? 'Retry reservations' : 'Release'}
                      </Button>
                    ) : null}
                    {order.status === 'RELEASED' || order.status === 'ISSUING' ? (
                      <Button size="small" variant="secondary" onClick={() => void issueOrder(order.id)}>
                        {order.status === 'ISSUING' ? 'Retry issues' : 'Issue'}
                      </Button>
                    ) : null}
                    {order.status === 'ISSUED' || order.status === 'RECEIVING' ? (
                      <Button size="small" variant="secondary" onClick={() => void completeOrder(order.id)}>
                        {order.status === 'RECEIVING' ? 'Retry receipt' : 'Complete'}
                      </Button>
                    ) : null}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
          {section === 'production' ? (
            <div className="mt-5 space-y-3 border-t border-ui-border-base pt-4">
              <Heading level="h3">Create production order</Heading>
              <div className="grid gap-2 md:grid-cols-3">
                <Input aria-label="BOM UUID" placeholder="BOM UUID" value={orderBomId} onChange={(e) => setOrderBomId(e.target.value)} />
                <Input aria-label="Warehouse UUID" placeholder="Warehouse UUID" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} />
                <Input aria-label="Finished UOM UUID" placeholder="Finished UOM UUID" value={finishedUomId} onChange={(e) => setFinishedUomId(e.target.value)} />
                <Input aria-label="Order quantity" placeholder="Quantity" value={orderQuantity} onChange={(e) => setOrderQuantity(e.target.value)} />
                <Input aria-label="Order owning unit" placeholder="Owning unit" value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)} />
                <Button disabled={busy} onClick={() => void createOrder()}>Create order</Button>
              </div>
            </div>
          ) : null}
        </Container>
      )}

      <FocusModal open={Boolean(selectedOrder)} onOpenChange={(open) => { if (!open) setSelectedOrder(null); }}>
        <FocusModal.Content>
          <FocusModal.Header>
            <FocusModal.Title>Production {selectedOrder?.order_number}</FocusModal.Title>
          </FocusModal.Header>
          <FocusModal.Body className="space-y-4 overflow-auto p-6">
            {selectedOrder ? (
              <>
                <div className="flex flex-wrap gap-3 text-sm">
                  <StatusBadge>{selectedOrder.status}</StatusBadge>
                  <span>Quantity {selectedOrder.quantity}</span>
                  {selectedOrder.inventory_receipt_id ? <span className="font-mono">Receipt {selectedOrder.inventory_receipt_id}</span> : null}
                </div>
                {selectedOrder.last_error_code ? <Text className="text-ui-fg-error">{selectedOrder.last_error_code}; retry the current step after Inventory recovers.</Text> : null}
                <Table>
                  <Table.Header><Table.Row>
                    <Table.HeaderCell>Component</Table.HeaderCell>
                    <Table.HeaderCell>Required</Table.HeaderCell>
                    <Table.HeaderCell>Issued</Table.HeaderCell>
                    <Table.HeaderCell>Reservation</Table.HeaderCell>
                  </Table.Row></Table.Header>
                  <Table.Body>{selectedOrder.lines.map((line) => <Table.Row key={line.id}>
                    <Table.Cell className="font-mono text-xs">{line.component_product_id}</Table.Cell>
                    <Table.Cell>{line.required_quantity}</Table.Cell>
                    <Table.Cell>{line.issued_quantity}</Table.Cell>
                    <Table.Cell>{line.reservation_id ? 'Reserved' : 'Pending'}</Table.Cell>
                  </Table.Row>)}</Table.Body>
                </Table>
              </>
            ) : null}
          </FocusModal.Body>
          <FocusModal.Footer>
            <Button variant="secondary" onClick={() => setSelectedOrder(null)}>Close</Button>
            {selectedOrder && ['DRAFT', 'RESERVING'].includes(selectedOrder.status) ?
              <Button disabled={busy} onClick={() => void releaseOrder(selectedOrder.id)}>Reserve components</Button> : null}
            {selectedOrder && ['RELEASED', 'ISSUING'].includes(selectedOrder.status) ?
              <Button disabled={busy} onClick={() => void issueOrder(selectedOrder.id)}>Issue components</Button> : null}
            {selectedOrder && ['ISSUED', 'RECEIVING'].includes(selectedOrder.status) ?
              <Button disabled={busy} onClick={() => void completeOrder(selectedOrder.id)}>Receive finished goods</Button> : null}
          </FocusModal.Footer>
        </FocusModal.Content>
      </FocusModal>

      {section === 'mrp' && (
        <Container className="space-y-3 p-4">
          <Heading level="h2">MRP preview</Heading>
          <div className="grid max-w-xl gap-2">
            <Input placeholder="Owning organization unit" value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)} />
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
    </ModulePage>
  );
}
