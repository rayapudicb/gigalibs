'use client';

import type { BarcodeResolutionResultV1, StockBalanceV1 } from '@gigalibs/contracts';
import { PageTabs } from '@gigalibs/web-sdk';
import { type FormEvent, useEffect, useRef, useState } from 'react';

const BASE = '/api/universal-inventory/v1';
type ScanTarget = 'source' | 'target' | 'reservation';
type ResolvedLocation = { id: string; code: string; warehouseId: string };
type BrowserDetector = { detect(video: HTMLVideoElement): Promise<Array<{ rawValue: string }>> };
type BrowserDetectorConstructor = new (options: { formats: string[] }) => BrowserDetector;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    credentials: 'include', cache: 'no-store',
    headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
    ...init,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'message' in body
      ? String((body as { message: unknown }).message) : `Inventory request failed (${response.status}).`;
    throw new Error(message);
  }
  return body as T;
}

export function InventoryScannerDrawer({ onClose }: { onClose(): void }) {
  const [mode, setMode] = useState<'PUTAWAY' | 'PICK'>('PUTAWAY');
  const [sourceCode, setSourceCode] = useState('');
  const [targetCode, setTargetCode] = useState('');
  const [source, setSource] = useState<ResolvedLocation | null>(null);
  const [target, setTarget] = useState<ResolvedLocation | null>(null);
  const [balances, setBalances] = useState<StockBalanceV1[]>([]);
  const [balanceId, setBalanceId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [reservationId, setReservationId] = useState('');
  const [orderId, setOrderId] = useState('');
  const [fulfillmentId, setFulfillmentId] = useState(() => crypto.randomUUID());
  const [movementKey, setMovementKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [cameraTarget, setCameraTarget] = useState<ScanTarget | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stopCamera() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraTarget(null);
  }

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  async function startCamera(field: ScanTarget) {
    stopCamera();
    setFailure(null);
    const Detector = (globalThis as unknown as { BarcodeDetector?: BrowserDetectorConstructor }).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setFailure('Camera scanning is unavailable in this browser. Use a connected scanner or type the code.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
      streamRef.current = stream;
      setCameraTarget(field);
      const video = videoRef.current;
      if (!video) { stopCamera(); return; }
      video.srcObject = stream;
      await video.play();
      const detector = new Detector({ formats: ['qr_code', 'code_128', 'ean_13', 'ean_8'] });
      const scan = async () => {
        if (!streamRef.current) return;
        try {
          const found = await detector.detect(video);
          if (found[0]?.rawValue) {
            const value = found[0].rawValue.trim();
            if (field === 'source') { setSourceCode(value); setSource(null); setBalances([]); }
            if (field === 'target') { setTargetCode(value); setTarget(null); }
            if (field === 'reservation') setReservationId(value);
            setMovementKey(crypto.randomUUID());
            stopCamera();
            return;
          }
        } catch {
          // The frame may not be ready yet; the next scan can still succeed.
        }
        timerRef.current = setTimeout(() => void scan(), 250);
      };
      await scan();
    } catch {
      stopCamera();
      setFailure('Could not start the camera. Check camera access or type the code.');
    }
  }

  async function resolveLocation(code: string, field: 'source' | 'target') {
    setBusy(true); setFailure(null); setSuccess(null);
    try {
      const result = await request<BarcodeResolutionResultV1>('/barcodes/resolve', {
        method: 'POST', body: JSON.stringify({ rawCode: code.trim() }),
      });
      const warehouseId = result.metadata?.warehouseId;
      if (result.entityType !== 'LOCATION' || !result.matchedEntityId || typeof warehouseId !== 'string') {
        throw new Error('The scanned locator was not found in your organization.');
      }
      const location = { id: result.matchedEntityId, code: result.matchedCode ?? code, warehouseId };
      if (field === 'source') {
        const rows = await request<StockBalanceV1[]>(`/balances?warehouseId=${encodeURIComponent(warehouseId)}`);
        setSource(location);
        setBalances(rows.filter((row) => row.locationId === location.id && Number(row.availableQuantity) > 0));
        setBalanceId('');
      } else {
        setTarget(location);
      }
      setMovementKey(crypto.randomUUID());
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Could not resolve locator.');
    } finally { setBusy(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setFailure(null); setSuccess(null);
    try {
      if (mode === 'PUTAWAY') {
        const balance = balances.find((row) => row.id === balanceId);
        if (!source || !target || !balance || source.warehouseId !== target.warehouseId) {
          throw new Error('Resolve two locators in one warehouse and select available stock.');
        }
        if (source.id === target.id) throw new Error('Choose a different destination locator.');
        const result = await request<{ transaction: { id: string } }>('/movements', {
          method: 'POST', body: JSON.stringify({
            documentType: 'SCANNER_PUTAWAY', reason: 'TRANSFER', correlationId: movementKey,
            idempotencyKey: movementKey, sourceWarehouseId: source.warehouseId, sourceLocationId: source.id,
            targetWarehouseId: target.warehouseId, targetLocationId: target.id,
            productId: balance.productId, uomId: balance.uomId, lotId: balance.lotId,
            serialId: balance.serialId, stockStatus: balance.stockStatus, quantity,
          }),
        });
        setSuccess(`Putaway posted as transaction ${result.transaction.id}.`);
        setMovementKey(crypto.randomUUID());
        setSource(null);
        setBalances([]);
        setBalanceId('');
      } else {
        if (!reservationId.trim() || !orderId.trim()) throw new Error('Scan a reservation and enter its sales order ID.');
        const result = await request<{ issueId: string }>(`/reservations/${encodeURIComponent(reservationId.trim())}/issue`, {
          method: 'POST', body: JSON.stringify({ orderId: orderId.trim(), fulfillmentId, quantity: quantity || undefined }),
        });
        setSuccess(`Pick issued as ${result.issueId}.`);
        setFulfillmentId(crypto.randomUUID());
      }
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Stock action failed.');
    } finally { setBusy(false); }
  }

  const inputClass = 'w-full rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-2 text-ui-fg-base';
  return (
    <div className="fixed inset-0 z-50 bg-ui-bg-overlay/40" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label="Warehouse scanner" className="ml-auto flex h-full w-full max-w-lg flex-col overflow-y-auto bg-ui-bg-base p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-ui-fg-base">Warehouse scanner</h2>
          <button type="button" className="text-ui-fg-subtle" onClick={() => { stopCamera(); onClose(); }}>Close</button>
        </div>
        <p className="mt-2 text-sm text-ui-fg-subtle">Use the camera, a connected scanner, or type the printed code. Every stock action is checked by Inventory.</p>
        <div className="mt-4"><PageTabs label="Scanner action" value={mode} onChange={setMode} tabs={[{ key: 'PUTAWAY', label: 'Putaway' }, { key: 'PICK', label: 'Pick' }]} /></div>
        <video ref={videoRef} playsInline muted className={cameraTarget ? 'mt-4 w-full rounded-md' : 'hidden'} aria-label="Camera barcode preview" />
        {cameraTarget ? <button type="button" className="mt-2 text-sm text-ui-fg-base" onClick={stopCamera}>Stop camera</button> : null}
        <form className="mt-5 space-y-4" onSubmit={(event) => void submit(event)}>
          {mode === 'PUTAWAY' ? <>
            {([['source', sourceCode, setSourceCode, source, setSource], ['target', targetCode, setTargetCode, target, setTarget]] as const).map(([field, value, setValue, resolved, setResolved]) => (
              <div key={field} className="space-y-1">
                <label className="text-sm text-ui-fg-subtle" htmlFor={`${field}-barcode`}>{field === 'source' ? 'From locator' : 'To locator'}</label>
                <div className="flex gap-2">
                  <input id={`${field}-barcode`} className={inputClass} value={value} onChange={(event) => { setValue(event.target.value); setResolved(null); setMovementKey(crypto.randomUUID()); }} />
                  <button type="button" onClick={() => void startCamera(field)} className="rounded-md border border-ui-border-base px-2 text-sm">Camera</button>
                  <button type="button" disabled={busy || !value.trim()} onClick={() => void resolveLocation(value, field)} className="rounded-md border border-ui-border-base px-2 text-sm">Find</button>
                </div>
                {resolved ? <p className="text-xs text-ui-fg-subtle">{resolved.code} confirmed</p> : null}
              </div>
            ))}
            <label className="block text-sm text-ui-fg-subtle">Available stock
              <select className={inputClass} value={balanceId} onChange={(event) => { setBalanceId(event.target.value); setMovementKey(crypto.randomUUID()); }} required>
                <option value="">Select from source locator</option>
                {balances.map((row) => <option key={row.id} value={row.id}>{row.productId} · {row.availableQuantity} available{row.lotId ? ` · lot ${row.lotId}` : ''}</option>)}
              </select>
            </label>
          </> : <>
            <label className="block text-sm text-ui-fg-subtle">Reservation ID
              <div className="flex gap-2"><input className={inputClass} value={reservationId} onChange={(event) => setReservationId(event.target.value)} required /><button type="button" className="rounded-md border border-ui-border-base px-2 text-sm" onClick={() => void startCamera('reservation')}>Camera</button></div>
            </label>
            <label className="block text-sm text-ui-fg-subtle">Sales order ID
              <input className={inputClass} value={orderId} onChange={(event) => setOrderId(event.target.value)} required />
            </label>
          </>}
          <label className="block text-sm text-ui-fg-subtle">Quantity {mode === 'PICK' ? '(leave empty for remaining reserved stock)' : ''}
            <input className={inputClass} inputMode="decimal" value={quantity} onChange={(event) => { setQuantity(event.target.value); if (mode === 'PUTAWAY') setMovementKey(crypto.randomUUID()); }} required={mode === 'PUTAWAY'} />
          </label>
          {failure ? <p role="alert" className="text-sm text-ui-fg-error">{failure}</p> : null}
          {success ? <p role="status" className="text-sm text-ui-fg-base">{success}</p> : null}
          <button type="submit" disabled={busy} className="w-full rounded-md bg-ui-button-inverted px-4 py-3 text-sm font-medium text-ui-fg-on-inverted disabled:opacity-50">{busy ? 'Posting…' : mode === 'PUTAWAY' ? 'Post putaway' : 'Issue pick'}</button>
        </form>
      </aside>
    </div>
  );
}
