import { z } from 'zod';

// WI-OI-120ca (SPEED S7; plan v1.4 §4.4): dossiers. Requesting one queues it (idempotent by request key); the module's
// worker renders DOCX and PDF into the object store and records each file's SHA-256, which is checked again on every
// download. A dossier is never regenerated in place.

export const RequestSpeedDossierInputV1Schema = z.object({ requestKey: z.uuid() }).strict();
export type RequestSpeedDossierInputV1 = z.infer<typeof RequestSpeedDossierInputV1Schema>;

export const SPEED_DOSSIER_STATUSES = ['QUEUED', 'RUNNING', 'DONE', 'FAILED'] as const;
export type SpeedDossierStatus = (typeof SPEED_DOSSIER_STATUSES)[number];
export const SPEED_DOSSIER_FORMATS = ['docx', 'pdf'] as const;
export type SpeedDossierFormat = (typeof SPEED_DOSSIER_FORMATS)[number];

export interface SpeedDossierFileV1 {
  readonly format: SpeedDossierFormat;
  readonly sha256: string;
  readonly bytes: number;
}

export interface SpeedDossierV1 {
  readonly id: string;
  readonly routeId: string;
  readonly routeVersion: number;
  readonly status: SpeedDossierStatus;
  /** "DRAFT — NOT APPROVED" on every page until the route is approved (R2). */
  readonly watermarked: boolean;
  readonly files: readonly SpeedDossierFileV1[];
  readonly errorCode: string | null;
  readonly requestedBy: string;
  readonly requestedAt: string;
  readonly completedAt: string | null;
}
