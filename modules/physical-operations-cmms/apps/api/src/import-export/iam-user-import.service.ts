// WI-OI-046 — IAM bulk user import service.
// Users live in the public schema (managed by Prisma/tenancy-nest), not gigalibs_cmms.
// This service provisions tenant invitations by writing directly to public.tenant_invites
// using the same PostgreSQL connection pool as the CMMS module (same physical DB, separate schema).
// Only the invite record is created here; actual user account creation happens when the
// invitee accepts the link (handled by tenancy-nest / auth app).
//
// Invite-or-skip semantics:
//   • If the email already has an ACTIVE tenant_member → skip (already a member)
//   • If a pending unexpired invite exists → skip (already invited)
//   • Otherwise → insert a new invite record (token = SHA-256 of random 32 bytes)
//     and return the raw token for the caller (stored as a per-row audit note)
//
// NOTE: The raw invite token is NOT returned to the batch caller for security reasons —
// the import job records a "INVITED" success for each provisioned row. Administrators
// should use the tenancy UI to resend or revoke invites as needed.

import { createHash, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { DatabaseService } from '../database/database.service.js';
import type { ValidatedRow, BatchResult } from './types.js';

export const USER_MEMBER_ROLES = ['TENANT_ADMIN', 'MANAGER', 'MEMBER', 'VIEWER', 'GUEST'] as const;
export type UserMemberRole = (typeof USER_MEMBER_ROLES)[number];

const DEFAULT_ROLE: UserMemberRole = 'MEMBER';
const DEFAULT_EXPIRES_IN_HOURS = 72;
const MAX_EXPIRES_IN_HOURS = 168;

interface InviteOutcome {
  rowNumber: number;
  email: string;
  status: 'INVITED' | 'ALREADY_MEMBER' | 'PENDING_INVITE' | 'FAILED';
  detail?: string;
}

@Injectable()
export class IamUserImportService {
  private readonly logger = new Logger(IamUserImportService.name);

  constructor(private readonly db: DatabaseService) {}

  /**
   * Process validated user rows. For each row:
   * 1. Normalise email and resolve role
   * 2. Check existing membership (skip if ACTIVE)
   * 3. Check existing pending invite (skip if unexpired)
   * 4. Insert into public.tenant_invites with a hashed random token
   *
   * Returns a BatchResult-compatible object: `committed` = rows where invites were issued
   * (INVITED); `failed` = rows that errored. ALREADY_MEMBER and PENDING_INVITE rows
   * count as committed (idempotent successes) so the job does not mark them as failures.
   */
  async processUserRows(
    tenantId: string,
    actorId: string,
    rows: ValidatedRow[],
    allOrNothing: boolean,
  ): Promise<BatchResult> {
    const outcomes: InviteOutcome[] = [];

    for (const row of rows) {
      const outcome = await this.processOneRow(tenantId, actorId, row);
      outcomes.push(outcome);

      if (allOrNothing && outcome.status === 'FAILED') {
        // Abort; mark remaining rows as failed
        const remaining = rows
          .filter((r) => !outcomes.some((o) => o.rowNumber === r.rowNumber))
          .map((r) => ({ rowNumber: r.rowNumber, status: 'FAILED' as const, email: String(r.dbValues['email'] ?? ''), detail: 'Aborted due to all-or-nothing failure' }));
        outcomes.push(...remaining);
        break;
      }
    }

    const failedOutcomes = outcomes.filter((o) => o.status === 'FAILED');
    const successCount = outcomes.filter((o) => o.status !== 'FAILED').length;

    if (failedOutcomes.length > 0) {
      this.logger.warn(
        `IAM user import: ${failedOutcomes.length} failures in batch for tenant ${tenantId}`,
      );
    }

    return {
      committed: successCount,
      failed: failedOutcomes.map((o) => ({
        rowNumber: o.rowNumber,
        error: o.detail ?? 'IAM invite failed',
      })),
    };
  }

  private async processOneRow(
    tenantId: string,
    actorId: string,
    row: ValidatedRow,
  ): Promise<InviteOutcome> {
    const email = normalizeEmail(row.dbValues['email']);
    if (!email) {
      return { rowNumber: row.rowNumber, email: '', status: 'FAILED', detail: 'Missing or invalid email' };
    }

    const role = resolveRole(row.dbValues['role']);
    const expiresInHours = resolveExpiryHours(row.dbValues['expires_in_hours']);
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1_000);

    try {
      // 1. Check if user is already an active member of this tenant
      const { rows: memberRows } = await this.db.getPool().query<{ id: string }>(
        `SELECT tm.id
           FROM public.tenant_members tm
           JOIN public.users u ON u.id = tm.user_id
          WHERE tm.tenant_id = $1
            AND lower(u.email) = lower($2)
            AND tm.status = 'ACTIVE'
          LIMIT 1`,
        [tenantId, email],
      );
      if (memberRows.length > 0) {
        this.logger.debug(`Row ${row.rowNumber}: ${email} is already an active member — skip`);
        return { rowNumber: row.rowNumber, email, status: 'ALREADY_MEMBER' };
      }

      // 2. Check if an unexpired, unaccepted, unrevoked invite already exists
      const { rows: existingInviteRows } = await this.db.getPool().query<{ id: string }>(
        `SELECT id
           FROM public.tenant_invites
          WHERE tenant_id = $1
            AND lower(email) = lower($2)
            AND accepted_at IS NULL
            AND revoked_at IS NULL
            AND expires_at > NOW()
          LIMIT 1`,
        [tenantId, email],
      );
      if (existingInviteRows.length > 0) {
        this.logger.debug(`Row ${row.rowNumber}: ${email} has a pending invite — skip`);
        return { rowNumber: row.rowNumber, email, status: 'PENDING_INVITE' };
      }

      // 3. Revoke any expired/stale pending invites for this email in this tenant
      await this.db.getPool().query(
        `UPDATE public.tenant_invites
            SET revoked_at = NOW()
          WHERE tenant_id = $1
            AND lower(email) = lower($2)
            AND accepted_at IS NULL
            AND revoked_at IS NULL`,
        [tenantId, email],
      );

      // 4. Create the invite
      const rawToken = randomBytes(32).toString('base64url');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');

      await this.db.getPool().query(
        `INSERT INTO public.tenant_invites
           (id, tenant_id, email, role, token, expires_at, invited_by_id, created_at)
         VALUES
           (gen_random_uuid()::text, $1, lower($2), $3, $4, $5, $6, NOW())`,
        [tenantId, email, role, tokenHash, expiresAt.toISOString(), actorId],
      );

      this.logger.debug(`Row ${row.rowNumber}: invite created for ${email} (role=${role})`);
      return { rowNumber: row.rowNumber, email, status: 'INVITED' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Row ${row.rowNumber}: failed to process ${email} — ${message}`);
      return { rowNumber: row.rowNumber, email, status: 'FAILED', detail: message };
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim().toLowerCase();
  // Basic RFC 5322-ish validation: must contain exactly one @, with chars on both sides
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) return null;
  return trimmed;
}

function resolveRole(value: unknown): UserMemberRole {
  const s = String(value ?? '').trim().toUpperCase();
  if (USER_MEMBER_ROLES.includes(s as UserMemberRole)) return s as UserMemberRole;
  return DEFAULT_ROLE;
}

function resolveExpiryHours(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_EXPIRES_IN_HOURS;
  return Math.min(Math.round(n), MAX_EXPIRES_IN_HOURS);
}
