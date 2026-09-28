import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import type { Pool } from 'pg';
import { GIGAOPS_DB_POOL } from '../packs/packs.service.js';

export interface CreateAgreementDto {
  roleId: string;
  workerId: string;
  positionId?: string;
  documentKey: string;
  agreementVersion?: string;
}

@Injectable()
export class AgreementsService {
  constructor(@Inject(GIGAOPS_DB_POOL) private readonly db: Pool) {}

  async list(
    tenantId: string,
    params: { workerId?: string; roleId?: string; status?: string },
  ) {
    let query = `
      SELECT a.*, w.first_name, w.last_name, w.email, r.name as role_name
      FROM gigalibs_gigaops.agreements a
      JOIN gigalibs_gigaops.workers w ON a.worker_id = w.id
      JOIN gigalibs_gigaops.roles r ON a.role_id = r.id
      WHERE a.tenant_id = $1
    `;
    const values: any[] = [tenantId];
    let idx = 2;

    if (params.workerId) {
      query += ` AND a.worker_id = $${idx++}`;
      values.push(params.workerId);
    }
    if (params.roleId) {
      query += ` AND a.role_id = $${idx++}`;
      values.push(params.roleId);
    }
    if (params.status) {
      query += ` AND a.status = $${idx++}`;
      values.push(params.status);
    }

    query += ` ORDER BY a.created_at DESC`;
    const res = await this.db.query(query, values);
    return res.rows;
  }

  async getById(tenantId: string, id: string) {
    const res = await this.db.query(
      `SELECT a.*, w.first_name, w.last_name, w.email, r.name as role_name
       FROM gigalibs_gigaops.agreements a
       JOIN gigalibs_gigaops.workers w ON a.worker_id = w.id
       JOIN gigalibs_gigaops.roles r ON a.role_id = r.id
       WHERE a.tenant_id = $1 AND a.id = $2`,
      [tenantId, id],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`Agreement '${id}' not found.`);
    }
    return res.rows[0];
  }

  async create(tenantId: string, dto: CreateAgreementDto) {
    // Check if active agreement already exists
    const existing = await this.db.query(
      `SELECT id, status FROM gigalibs_gigaops.agreements
       WHERE tenant_id = $1 AND worker_id = $2 AND role_id = $3
         AND status NOT IN ('REJECTED', 'EXPIRED')`,
      [tenantId, dto.workerId, dto.roleId],
    );

    if (existing.rows.length > 0) {
      throw new BadRequestException(
        `An active or pending agreement already exists for this worker and role.`,
      );
    }

    const res = await this.db.query(
      `INSERT INTO gigalibs_gigaops.agreements (
        tenant_id, role_id, worker_id, position_id, document_key,
        agreement_version, status, sent_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'SENT', now())
      RETURNING *`,
      [
        tenantId,
        dto.roleId,
        dto.workerId,
        dto.positionId ?? null,
        dto.documentKey,
        dto.agreementVersion ?? '1.0',
      ],
    );
    return res.rows[0];
  }

  async sign(
    tenantId: string,
    id: string,
    signerIp: string | null,
    signerUserAgent: string | null,
  ) {
    const agreement = await this.getById(tenantId, id);
    if (agreement.status === 'SIGNED') {
      return agreement;
    }
    if (agreement.status !== 'SENT' && agreement.status !== 'PENDING') {
      throw new BadRequestException(`Cannot sign agreement with status '${agreement.status}'.`);
    }

    const signatureHash = crypto
      .createHash('sha256')
      .update(`${id}:${agreement.worker_id}:${agreement.document_key}:${Date.now()}`)
      .digest('hex');

    const res = await this.db.query(
      `UPDATE gigalibs_gigaops.agreements
       SET status = 'SIGNED',
           signed_at = now(),
           signature_hash = $3,
           signer_ip = $4,
           signer_user_agent = $5,
           updated_at = now()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [tenantId, id, signatureHash, signerIp, signerUserAgent],
    );
    return res.rows[0];
  }

  async reject(tenantId: string, id: string, reason?: string) {
    const agreement = await this.getById(tenantId, id);
    if (agreement.status === 'SIGNED') {
      throw new BadRequestException('Cannot reject an agreement that is already signed.');
    }

    const res = await this.db.query(
      `UPDATE gigalibs_gigaops.agreements
       SET status = 'REJECTED',
           rejected_at = now(),
           updated_at = now()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [tenantId, id],
    );
    return res.rows[0];
  }

  async resend(tenantId: string, id: string) {
    const agreement = await this.getById(tenantId, id);
    if (agreement.status === 'SIGNED') {
      throw new BadRequestException('Cannot resend an already signed agreement.');
    }

    const res = await this.db.query(
      `UPDATE gigalibs_gigaops.agreements
       SET status = 'SENT',
           sent_at = now(),
           updated_at = now()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [tenantId, id],
    );
    return res.rows[0];
  }
}
