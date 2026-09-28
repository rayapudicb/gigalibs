import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { RecoveryPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class LeaksService {
  private readonly logger = new Logger(LeaksService.name);

  constructor(private readonly db: DatabaseService) {}

  async getMetrics(tenantId: string) {
    const summaryRes = await this.db.queryWithTenant(
      tenantId,
      `
      SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(amount_usd), 0) as total_detected_usd,
        COALESCE(SUM(CASE WHEN status = 'HELD' THEN amount_usd ELSE 0 END), 0) as total_held_usd,
        COALESCE(SUM(CASE WHEN status = 'UNDER_REVIEW' THEN amount_usd ELSE 0 END), 0) as total_under_review_usd,
        COALESCE(SUM(CASE WHEN status = 'RECOVERED' THEN amount_usd ELSE 0 END), 0) as total_recovered_usd,
        COALESCE(SUM(CASE WHEN leak_type = 'DUPLICATE_INVOICE' THEN amount_usd ELSE 0 END), 0) as duplicate_blocked_usd,
        COALESCE(SUM(CASE WHEN leak_type = 'UNCLAIMED_CREDIT' THEN amount_usd ELSE 0 END), 0) as unclaimed_credits_usd,
        COALESCE(SUM(CASE WHEN leak_type = 'MISSED_TAX_EXEMPTION' THEN amount_usd ELSE 0 END), 0) as tax_recovered_usd,
        COALESCE(SUM(CASE WHEN leak_type = 'CONTRACT_CREEP' THEN amount_usd ELSE 0 END), 0) as contract_creep_usd,
        COUNT(CASE WHEN status IN ('DETECTED', 'HELD', 'UNDER_REVIEW') THEN 1 END) as active_leaks_count
      FROM gigalibs_recovery.detected_leaks
      WHERE tenant_id = $1
    `,
      [tenantId],
    );

    const row = summaryRes.rows[0] ?? {};
    const totalDetected = Number(row.total_detected_usd) || 0;
    const totalHeld = Number(row.total_held_usd) || 0;
    const totalUnderReview = Number(row.total_under_review_usd) || 0;
    const totalRecovered = Number(row.total_recovered_usd) || 0;
    const duplicateBlocked = Number(row.duplicate_blocked_usd) || 0;
    const unclaimedCredits = Number(row.unclaimed_credits_usd) || 0;
    const taxRecovered = Number(row.tax_recovered_usd) || 0;
    const contractCreep = Number(row.contract_creep_usd) || 0;
    const activeLeaks = Number(row.active_leaks_count) || 0;
    const totalIncidents = Number(row.total_count) || 0;

    return {
      totalDetectedUsd: totalDetected,
      totalHeldUsd: totalHeld,
      totalUnderReviewUsd: totalUnderReview,
      totalRecoveredUsd: totalRecovered,
      totalPreservedUsd: totalHeld + totalRecovered,
      duplicateBlockedUsd: duplicateBlocked,
      unclaimedCreditsUsd: unclaimedCredits,
      taxRecoveredUsd: taxRecovered,
      contractCreepUsd: contractCreep,
      activeLeaksCount: activeLeaks,
      totalIncidents,
    };
  }

  async getLeaks(
    tenantId: string,
    filters?: { type?: string; severity?: string; status?: string; search?: string },
  ) {
    let query = `
      SELECT 
        id, tenant_id, leak_type, severity, title, vendor_name, vendor_id,
        amount_minor, currency, amount_usd, confidence_score, accuracy_protocol,
        primary_doc_id, primary_doc_date, comparison_doc_id, comparison_doc_date,
        evidence, status, action_taken, action_notes, clawback_run_id,
        created_at, updated_at
      FROM gigalibs_recovery.detected_leaks
      WHERE tenant_id = $1
    `;
    const params: any[] = [tenantId];

    if (filters?.type && filters.type !== 'ALL') {
      params.push(filters.type);
      query += ` AND leak_type = $${params.length}`;
    }

    if (filters?.severity && filters.severity !== 'ALL') {
      params.push(filters.severity);
      query += ` AND severity = $${params.length}`;
    }

    if (filters?.status && filters.status !== 'ALL') {
      params.push(filters.status);
      query += ` AND status = $${params.length}`;
    }

    if (filters?.search && filters.search.trim()) {
      params.push(`%${filters.search.trim()}%`);
      query += ` AND (vendor_name ILIKE $${params.length} OR title ILIKE $${params.length} OR primary_doc_id ILIKE $${params.length})`;
    }

    query += ` ORDER BY confidence_score DESC, created_at DESC`;

    const res = await this.db.queryWithTenant(tenantId, query, params);
    return res.rows;
  }

  async getLeakById(tenantId: string, id: string) {
    const res = await this.db.queryWithTenant(
      tenantId,
      `SELECT * FROM gigalibs_recovery.detected_leaks WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    if (!res.rows.length) {
      throw new NotFoundException(`Leak record ${id} not found`);
    }
    return res.rows[0];
  }

  async takeAction(
    tenantId: string,
    id: string,
    action: string,
    notes: string | undefined,
    principal: RecoveryPrincipal,
  ) {
    if (action !== 'DISMISS') {
      throw new ServiceUnavailableException(
        'Payment holds, credits, and clawback dispatch require a configured external provider and verifiable receipt. No action was performed.',
      );
    }

    const dismissalNotes = notes?.trim();
    if (!dismissalNotes) {
      throw new BadRequestException('Operator notes are required to dismiss a recovery finding.');
    }

    return this.db.withTenantTransaction(tenantId, async (client) => {
      const leakRes = await client.query(
        `SELECT * FROM gigalibs_recovery.detected_leaks WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, id],
      );
      if (!leakRes.rows.length) {
        throw new NotFoundException(`Leak record ${id} not found`);
      }
      const leak = leakRes.rows[0];

      const updatedRes = await client.query(
        `UPDATE gigalibs_recovery.detected_leaks 
         SET status = 'DISMISSED', action_taken = 'MANUALLY_DISMISSED',
             action_notes = $1, updated_at = NOW()
         WHERE tenant_id = $2 AND id = $3
         RETURNING *`,
        [dismissalNotes, tenantId, id],
      );

      // Audit event
      const auditId = `aud-${randomUUID().slice(0, 8)}`;
      await client.query(
        `INSERT INTO gigalibs_recovery.audit_events (id, tenant_id, event_type, entity_type, entity_id, payload, performed_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          auditId,
          tenantId,
          'LEAK_ACTION_DISMISS',
          'detected_leaks',
          id,
          JSON.stringify({
            action: 'DISMISS',
            notes: dismissalNotes,
            previousStatus: leak.status,
            newStatus: 'DISMISSED',
            actor: principal.subject,
            timestamp: new Date().toISOString(),
          }),
          principal.subject,
        ],
      );

      this.logger.log(`Recovery finding ${id} dismissed for tenant ${tenantId}.`);
      return updatedRes.rows[0];
    });
  }
}
