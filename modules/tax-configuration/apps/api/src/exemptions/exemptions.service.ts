import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service.js';
import { recordEvidence } from '../persistence/evidence.js';

export interface ExemptionCertificate {
  id: string; tenantId: string; customerId: string; customerName: string;
  certificateNumber: string; jurisdictionCode: string; exemptionReason: string;
  documentUrl: string; validFrom: string; validUntil: string; isVerified: boolean;
  status: string; createdAt: string;
}

export type CreateExemptionInput = Omit<ExemptionCertificate,
  'id' | 'tenantId' | 'isVerified' | 'status' | 'createdAt'>;

const SELECT_COLUMNS = `id, tenant_id AS "tenantId", customer_id AS "customerId",
  customer_name AS "customerName", certificate_number AS "certificateNumber",
  jurisdiction_code AS "jurisdictionCode", exemption_reason AS "exemptionReason",
  document_url AS "documentUrl", valid_from AS "validFrom", valid_until AS "validUntil",
  is_verified AS "isVerified", status, created_at AS "createdAt"`;

@Injectable()
export class ExemptionsService {
  constructor(private readonly db: DatabaseService) {}

  async list(tenantId: string): Promise<ExemptionCertificate[]> {
    return this.db.withTenantTransaction(tenantId, async (client) => {
      const result = await client.query<ExemptionCertificate>(
        `SELECT ${SELECT_COLUMNS} FROM gigalibs_tax.exemption_certificates
         WHERE tenant_id = $1 ORDER BY created_at DESC`, [tenantId],
      );
      return result.rows;
    });
  }

  async create(tenantId: string, actorSubject: string, input: CreateExemptionInput) {
    return this.db.withTenantTransaction(tenantId, async (client) => {
      const configured = await client.query(
        `SELECT 1 FROM gigalibs_tax.tax_jurisdictions
         WHERE tenant_id = $1 AND jurisdiction_code = $2 AND status = 'ACTIVE'`,
        [tenantId, input.jurisdictionCode],
      );
      if (!configured.rowCount) throw new NotFoundException('Active jurisdiction was not found.');
      const duplicate = await client.query(
        `SELECT 1 FROM gigalibs_tax.exemption_certificates
         WHERE tenant_id = $1 AND certificate_number = $2`,
        [tenantId, input.certificateNumber],
      );
      if (duplicate.rowCount) throw new ConflictException('Certificate number already exists.');
      const id = randomUUID();
      const result = await client.query<ExemptionCertificate>(
        `INSERT INTO gigalibs_tax.exemption_certificates (
           id, tenant_id, customer_id, customer_name, certificate_number,
           jurisdiction_code, exemption_reason, document_url, valid_from,
           valid_until, is_verified, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,FALSE,'PENDING_REVIEW')
         RETURNING ${SELECT_COLUMNS}`,
        [id, tenantId, input.customerId, input.customerName, input.certificateNumber,
          input.jurisdictionCode, input.exemptionReason, input.documentUrl,
          input.validFrom, input.validUntil],
      );
      await recordEvidence(client, {
        tenantId, entityType: 'EXEMPTION_CERTIFICATE', entityId: id, action: 'SUBMITTED', actorSubject,
        eventType: 'tax.exemption.submitted.v1', payload: { ...input, isVerified: false },
      });
      return result.rows[0];
    });
  }

  async verify(
    tenantId: string,
    actorSubject: string,
    certificateId: string,
    verificationReference: string,
  ) {
    return this.db.withTenantTransaction(tenantId, async (client) => {
      const result = await client.query<ExemptionCertificate>(
        `UPDATE gigalibs_tax.exemption_certificates
         SET is_verified = TRUE, status = 'ACTIVE', updated_at = transaction_timestamp()
         WHERE tenant_id = $1 AND id = $2 AND status = 'PENDING_REVIEW'
         RETURNING ${SELECT_COLUMNS}`,
        [tenantId, certificateId],
      );
      if (!result.rowCount) {
        throw new ConflictException('Certificate is absent or is not pending verification.');
      }
      await recordEvidence(client, {
        tenantId, entityType: 'EXEMPTION_CERTIFICATE', entityId: certificateId,
        action: 'VERIFIED', actorSubject, eventType: 'tax.exemption.verified.v1',
        payload: { verificationReference },
      });
      return result.rows[0];
    });
  }
}
