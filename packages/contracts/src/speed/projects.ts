import { z } from 'zod';

// WI-OI-120bw (SPEED S3; plan v1.4 §4.4): the published V1 contract of SPEED projects. Tenant and creator come from the
// signed platform context, never from a body; every change carries the row version it read and a reason (FR-AUD-01).

export const SPEED_PROJECT_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export const SpeedProjectStatusSchema = z.enum(SPEED_PROJECT_STATUSES);
export type SpeedProjectStatus = z.infer<typeof SpeedProjectStatusSchema>;

const Code = z.string().trim().min(1).max(40);
const Name = z.string().trim().min(1).max(200);
/** An organization unit id from the platform's `organization-units` lookup. */
const UnitId = z.string().trim().min(1).max(64);
/** A user id from the platform's `workspace-members` lookup (the signed subject). */
const Subject = z.string().trim().min(1).max(128);
const Notes = z.string().max(4000);
const Reason = z.string().trim().min(1).max(500);

export const CreateSpeedProjectInputV1Schema = z
  .object({
    requestKey: z.uuid(),
    code: Code,
    name: Name,
    siteUnitId: UnitId,
    /** Defaults to the signed-in user. */
    ownerSubject: Subject.optional(),
    notes: Notes.optional(),
  })
  .strict();
export type CreateSpeedProjectInputV1 = z.infer<typeof CreateSpeedProjectInputV1Schema>;

export const UpdateSpeedProjectInputV1Schema = z
  .object({
    version: z.number().int().positive(),
    reason: Reason,
    name: Name.optional(),
    siteUnitId: UnitId.optional(),
    ownerSubject: Subject.optional(),
    notes: Notes.nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined ||
      value.siteUnitId !== undefined ||
      value.ownerSubject !== undefined ||
      value.notes !== undefined,
    { message: 'Change at least one field.' },
  );
export type UpdateSpeedProjectInputV1 = z.infer<typeof UpdateSpeedProjectInputV1Schema>;

export const ArchiveSpeedProjectInputV1Schema = z
  .object({ version: z.number().int().positive(), reason: Reason })
  .strict();
export type ArchiveSpeedProjectInputV1 = z.infer<typeof ArchiveSpeedProjectInputV1Schema>;

export const ListSpeedProjectsQueryV1Schema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(50),
    search: z.string().trim().min(1).max(200).optional(),
    status: SpeedProjectStatusSchema.optional(),
    siteUnitId: UnitId.optional(),
  })
  .strict();
export type ListSpeedProjectsQueryV1 = z.infer<typeof ListSpeedProjectsQueryV1Schema>;

export interface SpeedProjectV1 {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly siteUnitId: string;
  readonly ownerSubject: string;
  readonly notes: string | null;
  readonly status: SpeedProjectStatus;
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedBy: string | null;
  readonly archivedAt: string | null;
}

export interface SpeedProjectPageV1 {
  readonly items: readonly SpeedProjectV1[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}
