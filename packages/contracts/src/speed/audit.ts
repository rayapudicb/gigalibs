import { z } from 'zod';

// WI-OI-120cc (SPEED; screen spec §3.3; FR-AUD-01, 02): SPEED's audit trail, read from the module's append-only audit
// table. `speed.audit.read` reads every entry and exports CSV; `speed.audit.read-own` reads only the member's own.

export const ListSpeedAuditQueryV1Schema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
    routeId: z.uuid().optional(),
    actor: z.string().trim().min(1).max(128).optional(),
    action: z
      .string()
      .trim()
      .regex(/^[A-Z][A-Z0-9_]*$/)
      .max(128)
      .optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  })
  .strict();
export type ListSpeedAuditQueryV1 = z.infer<typeof ListSpeedAuditQueryV1Schema>;

export interface SpeedAuditChangeV1 {
  readonly field: string;
  readonly from: unknown;
  readonly to: unknown;
}

export interface SpeedAuditEntryV1 {
  readonly id: string;
  readonly occurredAt: string;
  readonly actor: string;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly changes: readonly SpeedAuditChangeV1[];
  readonly reason: string | null;
}

export interface SpeedAuditPageV1 {
  readonly items: readonly SpeedAuditEntryV1[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  /** Whether the member reads only their own entries (`speed.audit.read-own`). */
  readonly ownOnly: boolean;
}
