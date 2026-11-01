import type {
  AssetDiagramDetailV1,
  AssetDiagramV1,
  DiagramConsumptionV1,
  DiagramImageV1,
  PartReservationV1,
  ReservePartResultV1,
} from '@gigalibs/contracts';
import { requestCmms } from './api';

// WI-OI-136 M-BOM: the CMMS diagram, stock and reservation routes, as the signed-in user.
const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const id = (value: string) => encodeURIComponent(value);

export const sparesApi = {
  diagrams: (assetId: string) => requestCmms<{ items: AssetDiagramV1[] }>(`/assets/${id(assetId)}/diagrams`),
  createDiagram: (assetId: string, input: Record<string, unknown>) =>
    requestCmms<AssetDiagramV1>(`/assets/${id(assetId)}/diagrams`, send('POST', input)),
  openWorkOrders: (assetId: string) =>
    requestCmms<{ items: { id: string; woNumber: string; title: string; status: string }[] }>(`/assets/${id(assetId)}/open-work-orders`),
  detail: (diagramId: string) => requestCmms<AssetDiagramDetailV1>(`/diagrams/${id(diagramId)}`),
  image: (diagramId: string) => requestCmms<DiagramImageV1>(`/diagrams/${id(diagramId)}/image`),
  consumption: (diagramId: string) => requestCmms<DiagramConsumptionV1>(`/diagrams/${id(diagramId)}/consumption`),
  replaceHotspots: (diagramId: string, input: Record<string, unknown>) =>
    requestCmms<AssetDiagramDetailV1>(`/diagrams/${id(diagramId)}/hotspots`, send('PUT', input)),
  revise: (diagramId: string, expectedVersion: number) =>
    requestCmms<AssetDiagramV1>(`/diagrams/${id(diagramId)}/revise`, send('POST', { expectedVersion })),
  publish: (diagramId: string, expectedVersion: number) =>
    requestCmms<AssetDiagramV1>(`/diagrams/${id(diagramId)}/publish`, send('POST', { expectedVersion })),
  reserve: (input: Record<string, unknown>) => requestCmms<ReservePartResultV1>('/part-reservations', send('POST', input)),
  release: (reservationId: string, reason: string) =>
    requestCmms<PartReservationV1>(`/part-reservations/${id(reservationId)}/release`, send('POST', { reason })),
  reservations: (workOrderId: string) =>
    requestCmms<{ items: PartReservationV1[] }>(`/work-orders/${id(workOrderId)}/part-reservations`),
};
