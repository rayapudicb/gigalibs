'use client';

import type { RmaDispositionCode, RmaLineV1, RmaV1 } from '@gigalibs/contracts';
import { RMA_DISPOSITION_CODES } from '@gigalibs/contracts';
import { Button, Container, FocusModal, Heading, Input, StatusBadge, Table, Text, Textarea } from '@medusajs/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { returnsApi } from '../api.js';
import { deriveRmaChecklistSteps } from '../checklist.js';

function remainingQuantity(line: RmaLineV1): string {
  const authorized = Number.parseFloat(line.authorizedQuantity);
  const received = Number.parseFloat(line.receivedQuantity);
  const left = Math.max(0, authorized - received);
  return Number.isFinite(left) ? String(left) : '0';
}

function newRequestKey(): string {
  return crypto.randomUUID();
}

type CreditLineDraft = { rmaLineId: string; unitPriceMinor: string; reason: string };

export function ReturnsRmaWorkspace() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<RmaV1[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<RmaV1 | null>(null);

  const [warehouseId, setWarehouseId] = useState('');
  const [orgUnitId, setOrgUnitId] = useState('');

  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  const [dispositionCode, setDispositionCode] = useState<RmaDispositionCode>('SCRAP');
  const [dispositionQty, setDispositionQty] = useState('');
  const [inspectionNotes, setInspectionNotes] = useState('');
  const [dispositionCreditMemo, setDispositionCreditMemo] = useState(false);

  const [creditOpen, setCreditOpen] = useState(false);
  const [creditLines, setCreditLines] = useState<CreditLineDraft[]>([]);
  const [currencyCode, setCurrencyCode] = useState('USD');

  const checklist = useMemo(() => (selected ? deriveRmaChecklistSteps(selected) : []), [selected]);
  const activeLine = selected?.lines.find((line) => line.id === activeLineId) ?? null;

  const loadList = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await returnsApi.listRmas();
      setItems(response.items);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to load RMAs.');
    } finally {
      setBusy(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string, preferLineId?: string | null) => {
    setBusy(true);
    setError(null);
    try {
      const rma = await returnsApi.getRma(id);
      setSelected(rma);
      const line =
        (preferLineId && rma.lines.find((entry) => entry.id === preferLineId)) ?? rma.lines[0] ?? null;
      if (line) {
        setActiveLineId(line.id);
        setDispositionQty(remainingQuantity(line));
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Failed to load RMA.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId, null);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (!activeLine) return;
    setDispositionQty(remainingQuantity(activeLine));
  }, [activeLine]);

  async function runDocumentAction(action: 'submit' | 'authorize') {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const body = { requestKey: newRequestKey(), expectedVersion: selected.version };
      const updated =
        action === 'submit'
          ? await returnsApi.submit(selected.id, body)
          : await returnsApi.authorize(selected.id, body);
      setSelected(updated);
      await loadList();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Document action failed.');
    } finally {
      setBusy(false);
    }
  }

  async function applyDisposition() {
    if (!selected || !activeLine) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await returnsApi.recordDisposition(selected.id, {
        requestKey: newRequestKey(),
        rmaLineId: activeLine.id,
        dispositionCode,
        quantity: dispositionQty.trim() || remainingQuantity(activeLine),
        warehouseId: dispositionCode === 'SCRAP' ? undefined : warehouseId.trim() || undefined,
        orgUnitId: dispositionCode === 'SCRAP' ? undefined : orgUnitId.trim() || undefined,
        notes: inspectionNotes.trim() ? inspectionNotes.trim() : null,
        requestCreditMemo: dispositionCreditMemo,
      });
      setSelected(updated);
      setInspectionNotes('');
      await loadList();
      await loadDetail(selected.id, activeLine.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Disposition failed.');
    } finally {
      setBusy(false);
    }
  }

  function openCreditModal() {
    if (!selected) return;
    setCreditLines(
      selected.lines.map((line) => ({
        rmaLineId: line.id,
        unitPriceMinor: '0',
        reason: `Credit for line ${line.lineNumber}`,
      })),
    );
    setCreditOpen(true);
  }

  async function submitCreditMemo() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await returnsApi.requestCreditMemo(selected.id, {
        requestKey: newRequestKey(),
        expectedVersion: selected.version,
        currencyCode,
        lines: creditLines.map((line) => ({
          rmaLineId: line.rmaLineId,
          unitPriceMinor: line.unitPriceMinor.trim(),
          reason: line.reason.trim(),
        })),
      });
      setSelected(updated);
      setCreditOpen(false);
      await loadList();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Credit memo request failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Container className="mx-auto max-w-6xl space-y-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Heading level="h1">Returns processing checklist</Heading>
          <Text className="text-ui-fg-subtle">
            Authorize the RMA, inspect lines, choose disposition, then request a credit memo in Orders.
          </Text>
        </div>
        <Button variant="secondary" disabled={busy} onClick={() => void loadList()}>
          Refresh
        </Button>
      </div>

      {error ? (
        <div className="rounded-lg border border-ui-border-error bg-ui-bg-error px-4 py-3">
          <Text size="small" className="text-ui-fg-error">
            {error}
          </Text>
        </div>
      ) : null}

      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>RMA</Table.HeaderCell>
            <Table.HeaderCell>Status</Table.HeaderCell>
            <Table.HeaderCell>Reason</Table.HeaderCell>
            <Table.HeaderCell>Updated</Table.HeaderCell>
            <Table.HeaderCell />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {items.map((rma) => (
            <Table.Row key={rma.id} data-selected={selectedId === rma.id}>
              <Table.Cell>{rma.rmaNumber}</Table.Cell>
              <Table.Cell>
                <StatusBadge color={rma.status === 'AUTHORIZED' ? 'green' : 'grey'}>{rma.status}</StatusBadge>
              </Table.Cell>
              <Table.Cell className="max-w-xs truncate">{rma.reason}</Table.Cell>
              <Table.Cell>{new Date(rma.updatedAt).toLocaleString()}</Table.Cell>
              <Table.Cell>
                <Button
                  size="small"
                  variant={selectedId === rma.id ? 'primary' : 'secondary'}
                  disabled={busy}
                  onClick={() => {
                    setSelectedId(rma.id);
                    setActiveLineId(null);
                  }}
                >
                  Process
                </Button>
              </Table.Cell>
            </Table.Row>
          ))}
          {items.length === 0 ? (
            <Table.Row>
              <Table.Cell>
                <Text className="text-ui-fg-subtle">No RMAs yet. Create one through the API or integration tests.</Text>
              </Table.Cell>
              <Table.Cell />
              <Table.Cell />
              <Table.Cell />
              <Table.Cell />
            </Table.Row>
          ) : null}
        </Table.Body>
      </Table>

      {selected ? (
        <section className="space-y-6 rounded-xl border border-ui-border-base bg-ui-bg-base p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Heading level="h2">{selected.rmaNumber}</Heading>
              <Text className="text-ui-fg-subtle">Version {selected.version}</Text>
            </div>
            <div className="flex flex-wrap gap-2">
              {selected.status === 'DRAFT' ? (
                <Button disabled={busy} onClick={() => void runDocumentAction('submit')}>
                  Submit
                </Button>
              ) : null}
              {selected.status === 'SUBMITTED' ? (
                <Button disabled={busy} onClick={() => void runDocumentAction('authorize')}>
                  Authorize
                </Button>
              ) : null}
              {['AUTHORIZED', 'RECEIVING', 'INSPECTING'].includes(selected.status) ? (
                <Button variant="secondary" disabled={busy} onClick={openCreditModal}>
                  Request credit memo
                </Button>
              ) : null}
            </div>
          </div>

          <ol className="space-y-2">
            {checklist.map((step) => (
              <li key={step.key} className="flex items-start gap-3 rounded-lg bg-ui-bg-subtle px-4 py-3">
                <span aria-hidden className="mt-0.5 text-lg">{step.done ? '✓' : '○'}</span>
                <div>
                  <Text weight="plus">{step.label}</Text>
                  {step.hint ? (
                    <Text size="small" className="text-ui-fg-subtle">
                      {step.hint}
                    </Text>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1">
              <Text size="small" weight="plus">
                Warehouse (restock / quarantine)
              </Text>
              <Input value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} placeholder="Warehouse UUID" />
            </label>
            <label className="space-y-1">
              <Text size="small" weight="plus">
                Org unit (restock / quarantine)
              </Text>
              <Input value={orgUnitId} onChange={(e) => setOrgUnitId(e.target.value)} placeholder="Org unit id" />
            </label>
          </div>

          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Line</Table.HeaderCell>
                <Table.HeaderCell>Product</Table.HeaderCell>
                <Table.HeaderCell>Authorized</Table.HeaderCell>
                <Table.HeaderCell>Received</Table.HeaderCell>
                <Table.HeaderCell />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {selected.lines.map((line) => (
                <Table.Row key={line.id}>
                  <Table.Cell>{line.lineNumber}</Table.Cell>
                  <Table.Cell className="font-mono text-xs">{line.productId.slice(0, 8)}…</Table.Cell>
                  <Table.Cell>{line.authorizedQuantity}</Table.Cell>
                  <Table.Cell>{line.receivedQuantity}</Table.Cell>
                  <Table.Cell>
                    <Button
                      size="small"
                      variant={activeLineId === line.id ? 'primary' : 'transparent'}
                      onClick={() => setActiveLineId(line.id)}
                    >
                      Inspect
                    </Button>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>

          {activeLine ? (
            <div className="space-y-4 rounded-lg border border-ui-border-base p-4">
              <Heading level="h3">Line {activeLine.lineNumber} disposition</Heading>
              <fieldset role="radiogroup" aria-label="Disposition" className="flex flex-wrap gap-4">
                {RMA_DISPOSITION_CODES.map((code) => (
                  <label key={code} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="disposition"
                      value={code}
                      checked={dispositionCode === code}
                      onChange={() => setDispositionCode(code)}
                    />
                    <Text>{code}</Text>
                  </label>
                ))}
              </fieldset>
              <label className="block space-y-1">
                <Text size="small" weight="plus">
                  Quantity
                </Text>
                <Input value={dispositionQty} onChange={(e) => setDispositionQty(e.target.value)} />
              </label>
              <label className="block space-y-1">
                <Text size="small" weight="plus">
                  Inspection notes / evidence reference
                </Text>
                <Textarea
                  value={inspectionNotes}
                  onChange={(e) => setInspectionNotes(e.target.value)}
                  placeholder="Describe damage, attach a document id, or reference photos captured elsewhere."
                />
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={dispositionCreditMemo}
                  onChange={(e) => setDispositionCreditMemo(e.target.checked)}
                />
                <Text size="small">Flag credit memo when recording this disposition</Text>
              </label>
              <Button disabled={busy} onClick={() => void applyDisposition()}>
                Record disposition
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      <FocusModal open={creditOpen} onOpenChange={setCreditOpen}>
        <FocusModal.Content>
          <FocusModal.Header>
            <FocusModal.Title>Request credit memo</FocusModal.Title>
          </FocusModal.Header>
          <FocusModal.Body className="space-y-4 overflow-auto p-6">
            <Text className="text-ui-fg-subtle">
              Sends a durable outbox event to Orders. Quantities use authorized amounts on each line.
            </Text>
            <label className="block space-y-1">
              <Text size="small" weight="plus">
                Currency
              </Text>
              <Input value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())} maxLength={3} />
            </label>
            {creditLines.map((line, index) => (
              <div key={line.rmaLineId} className="grid gap-2 rounded-lg border border-ui-border-base p-3 md:grid-cols-3">
                <Text className="font-mono text-xs md:col-span-3">{line.rmaLineId}</Text>
                <Input
                  placeholder="Unit price (minor units)"
                  value={line.unitPriceMinor}
                  onChange={(e) =>
                    setCreditLines((current) =>
                      current.map((entry, i) => (i === index ? { ...entry, unitPriceMinor: e.target.value } : entry)),
                    )
                  }
                />
                <Input
                  className="md:col-span-2"
                  placeholder="Reason"
                  value={line.reason}
                  onChange={(e) =>
                    setCreditLines((current) =>
                      current.map((entry, i) => (i === index ? { ...entry, reason: e.target.value } : entry)),
                    )
                  }
                />
              </div>
            ))}
          </FocusModal.Body>
          <FocusModal.Footer>
            <Button variant="secondary" onClick={() => setCreditOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void submitCreditMemo()}>
              Send credit memo request
            </Button>
          </FocusModal.Footer>
        </FocusModal.Content>
      </FocusModal>
    </Container>
  );
}
