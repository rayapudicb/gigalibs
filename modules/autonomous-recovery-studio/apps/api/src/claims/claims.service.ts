import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { RecoveryPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class ClaimsService {
  constructor(private readonly db: DatabaseService) {}

  async getClaims(tenantId: string) {
    const result = await this.db.queryWithTenant(
      tenantId,
      `SELECT c.id, c.tenant_id, c.leak_id, c.claim_number, c.vendor_name,
              c.vendor_contact_email, c.claim_amount_usd, c.settlement_type,
              c.status, c.evidence_hash, c.workflow_run_id, c.issued_at,
              c.settled_at, l.title AS leak_title, l.leak_type
       FROM gigalibs_recovery.recovery_claims c
       LEFT JOIN gigalibs_recovery.detected_leaks l
         ON c.leak_id = l.id AND c.tenant_id = l.tenant_id
       WHERE c.tenant_id = $1
       ORDER BY c.issued_at DESC`,
      [tenantId],
    );
    return result.rows;
  }

  async createClaim(
    _tenantId: string,
    _data: {
      leakId: string;
      vendorName: string;
      vendorContactEmail: string;
      claimAmountUsd: number;
      settlementType: string;
      evidencePayload: unknown;
    },
    _principal: RecoveryPrincipal,
  ): Promise<never> {
    throw new ServiceUnavailableException(
      'Claim issuance requires an external delivery adapter and receipt contract. No claim was created.',
    );
  }

  async updateClaimStatus(
    _tenantId: string,
    _id: string,
    _status: string,
    _principal: RecoveryPrincipal,
  ): Promise<never> {
    throw new ServiceUnavailableException(
      'Claim status changes require verified counterparty or settlement evidence. No status was changed.',
    );
  }
}
