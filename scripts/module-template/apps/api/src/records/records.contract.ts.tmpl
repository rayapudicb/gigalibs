import { z } from 'zod';

/** V1 contract of the generated records resource; nothing unvalidated reaches SQL. */
export const CreateRecordV1 = z
  .object({ requestKey: z.uuid(), title: z.string().trim().min(1).max(200) })
  .strict();

export const UpdateRecordV1 = z
  .object({
    version: z.number().int().positive(),
    title: z.string().trim().min(1).max(200).optional(),
    status: z.enum(['OPEN', 'CLOSED']).optional(),
  })
  .strict()
  .refine((value) => value.title !== undefined || value.status !== undefined, {
    message: 'Change the title or the status.',
  });

export const ListRecordsQueryV1 = z
  .object({ limit: z.coerce.number().int().min(1).max(100).default(50) })
  .strict();

export interface RecordV1 {
  readonly id: string;
  readonly title: string;
  readonly status: 'OPEN' | 'CLOSED';
  readonly version: number;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}
