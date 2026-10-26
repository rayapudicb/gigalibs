import { z } from 'zod';

// WI-OI-120 (Phase 4, R8 record sharing): share a single record with specific people or roles, beyond what their
// role-scope grants. This is the shared "build once" core — the share shape and the pure resolver that turns the shares
// ON a record plus WHO is asking into an access level. Every module stores its own shares and calls the resolver; the
// per-module share table and the authorise-read/write wiring are the integration (not here).

export const RecordShareAccessSchema = z.enum(['VIEW', 'EDIT']);
export type RecordShareAccess = z.infer<typeof RecordShareAccessSchema>;

export const RecordShareGranteeKindSchema = z.enum(['USER', 'ROLE']);
export type RecordShareGranteeKind = z.infer<typeof RecordShareGranteeKindSchema>;

export const RecordShareGranteeSchema = z
  .object({ kind: RecordShareGranteeKindSchema, id: z.string().trim().min(1).max(64) })
  .strict();
export type RecordShareGrantee = z.infer<typeof RecordShareGranteeSchema>;

/** One share on a record, as stored/returned. */
export interface RecordShare {
  readonly grantee: RecordShareGrantee;
  readonly access: RecordShareAccess;
}

/** A request to share a record (the module supplies recordType/recordId from its own domain). */
export const CreateRecordShareSchema = z
  .object({
    recordType: z.string().trim().min(1).max(128),
    recordId: z.string().trim().min(1).max(128),
    grantee: RecordShareGranteeSchema,
    access: RecordShareAccessSchema,
    reason: z.string().trim().max(500).optional(),
  })
  .strict();
export type CreateRecordShareDto = z.infer<typeof CreateRecordShareSchema>;

export interface RecordSharePrincipal {
  readonly userId: string;
  readonly roleIds: readonly string[];
}

const matches = (grantee: RecordShareGrantee, principal: RecordSharePrincipal): boolean =>
  grantee.kind === 'USER'
    ? grantee.id === principal.userId
    : principal.roleIds.includes(grantee.id);

/**
 * The access a principal gets from a record's shares, or null when none applies. EDIT wins over VIEW when more than one
 * share matches (e.g. a direct user share and a role share). A share grants only its own level and never less than the
 * member's role-scope already allows — the caller takes the higher of this and the scope decision.
 */
export function resolveRecordShareAccess(
  shares: readonly RecordShare[],
  principal: RecordSharePrincipal,
): RecordShareAccess | null {
  let best: RecordShareAccess | null = null;
  for (const share of shares) {
    if (!matches(share.grantee, principal)) continue;
    if (share.access === 'EDIT') return 'EDIT';
    best = 'VIEW';
  }
  return best;
}

/** Whether the shares let the principal at least view the record. */
export function recordSharedForView(
  shares: readonly RecordShare[],
  principal: RecordSharePrincipal,
): boolean {
  return resolveRecordShareAccess(shares, principal) !== null;
}

/** Whether the shares let the principal edit the record. */
export function recordSharedForEdit(
  shares: readonly RecordShare[],
  principal: RecordSharePrincipal,
): boolean {
  return resolveRecordShareAccess(shares, principal) === 'EDIT';
}
