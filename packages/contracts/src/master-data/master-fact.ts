import { z } from 'zod';

// WI-OI-156 slice A (ADR-0039 §1): one fact shape for every master's change, written by the owning module to its outbox
// in the same transaction as the change. A consumer keeps a reference replica (id, code, name, status, version) from
// these facts and applies them by version (WI-OI-156 slice B), so it can refuse an unknown or archived reference
// without calling the owner.

export const MASTER_FACT_EVENT_TYPE = 'MASTER_FACT_V1';

export const MasterFactV1Schema = z
  .object({
    /** The master's entity key, as in the window dictionaries and `spec.masters` (for example catalogue.products). */
    entity: z.string().regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/),
    change: z.enum(['CREATED', 'UPDATED', 'ARCHIVED']),
    id: z.string().min(1).max(64),
    code: z.string().min(1).max(100),
    name: z.string().min(1).max(300),
    /** ACTIVE while new documents may use it; anything else (ARCHIVED, INACTIVE, DRAFT …) blocks new use. */
    status: z.string().min(1).max(40),
    version: z.number().int().positive(),
    /** A few extra fields a consumer shows next to the name (for example a unit's symbol). */
    attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  })
  .strict();
export type MasterFactV1 = z.infer<typeof MasterFactV1Schema>;
