import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { EsignPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';

export interface CreateEnvelopeDto {
  title: string;
  documentNumber: string;
  sourceModule?: string;
  payloadText: string;
  sendImmediately?: boolean;
  recipients: Array<{
    name: string;
    email: string;
    role?: string;
    routingOrder?: number;
  }>;
}

export interface EnvelopeSummary {
  id: string;
  tenantId: string;
  title: string;
  documentNumber: string;
  sourceModule: string;
  status: string;
  documentSha256: string;
  signerCount: number;
  completedSigners: number;
  createdAt: string;
  completedAt: string | null;
  updatedAt: string;
}

@Injectable()
export class EnvelopesService {
  private readonly logger = new Logger(EnvelopesService.name);

  constructor(private readonly db: DatabaseService) {}

  async listEnvelopes(tenantId: string, statusFilter?: string): Promise<EnvelopeSummary[]> {
    let sql = `
      SELECT 
        e.id,
        e.tenant_id,
        e.title,
        e.document_number,
        e.source_module,
        e.status,
        e.document_sha256,
        e.created_at,
        e.completed_at,
        e.updated_at,
        COUNT(r.id)::int AS signer_count,
        COUNT(r.id) FILTER (WHERE r.status = 'SIGNED')::int AS completed_signers
      FROM gigalibs_esign.esign_envelopes e
      LEFT JOIN gigalibs_esign.esign_recipients r ON e.id = r.envelope_id
      WHERE e.tenant_id = $1
    `;
    const params: any[] = [tenantId];

    if (statusFilter && statusFilter !== 'ALL') {
      sql += ` AND e.status = $2`;
      params.push(statusFilter);
    }

    sql += ` GROUP BY e.id ORDER BY e.created_at DESC`;

    const res = await this.db.query(sql, params);
    return res.rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      title: r.title,
      documentNumber: r.document_number,
      sourceModule: r.source_module,
      status: r.status,
      documentSha256: r.document_sha256,
      signerCount: r.signer_count,
      completedSigners: r.completed_signers,
      createdAt: r.created_at,
      completedAt: r.completed_at,
      updatedAt: r.updated_at,
    }));
  }

  async getEnvelope(tenantId: string, envelopeId: string): Promise<any> {
    const envRes = await this.db.query(
      `SELECT * FROM gigalibs_esign.esign_envelopes WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, envelopeId],
    );
    if (envRes.rows.length === 0) {
      throw new NotFoundException(`Envelope ${envelopeId} not found.`);
    }
    const envelope = envRes.rows[0];

    const [recipientsRes, auditRes, receiptsRes] = await Promise.all([
      this.db.query(
        `SELECT * FROM gigalibs_esign.esign_recipients WHERE envelope_id = $1 ORDER BY routing_order ASC, name ASC`,
        [envelopeId],
      ),
      this.db.query(
        `SELECT * FROM gigalibs_esign.esign_audit_events WHERE envelope_id = $1 ORDER BY created_at ASC`,
        [envelopeId],
      ),
      this.db.query(
        `SELECT * FROM gigalibs_esign.esign_reconciliation_receipts WHERE envelope_id = $1 ORDER BY reconciled_at DESC LIMIT 1`,
        [envelopeId],
      ),
    ]);

    return {
      envelope,
      recipients: recipientsRes.rows,
      auditEvents: auditRes.rows,
      reconciliationReceipt: receiptsRes.rows[0] || null,
    };
  }

  async createEnvelope(
    tenantId: string,
    dto: CreateEnvelopeDto,
    principal: EsignPrincipal,
  ): Promise<any> {
    if (!dto.title || !dto.payloadText || !dto.recipients || dto.recipients.length === 0) {
      throw new BadRequestException('Title, payloadText, and at least one recipient are required.');
    }

    const envelopeId = `esg-${randomUUID()}`;
    const docNumber = dto.documentNumber || `DOC-${Date.now().toString().slice(-6)}`;
    const documentSha256 = createHash('sha256').update(dto.payloadText).digest('hex');
    const initialStatus = dto.sendImmediately ? 'SENT' : 'DRAFT';

    return this.db.transaction(async (client) => {
      await client.query(
        `INSERT INTO gigalibs_esign.esign_envelopes
           (id, tenant_id, title, document_number, source_module, status, document_sha256, payload_text, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
        [
          envelopeId,
          tenantId,
          dto.title,
          docNumber,
          dto.sourceModule || 'ACCOUNTS_RECEIVABLE',
          initialStatus,
          documentSha256,
          dto.payloadText,
        ],
      );

      for (let i = 0; i < dto.recipients.length; i++) {
        const r = dto.recipients[i]!;
        const recId = `rcp-${randomUUID()}`;
        await client.query(
          `INSERT INTO gigalibs_esign.esign_recipients
             (id, envelope_id, tenant_id, name, email, role, routing_order, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            recId,
            envelopeId,
            tenantId,
            r.name,
            r.email,
            r.role || 'SIGNER',
            r.routingOrder || i + 1,
            dto.sendImmediately ? 'SENT' : 'PENDING',
          ],
        );
      }

      const chainHash = createHash('sha256')
        .update(`${envelopeId}:ENVELOPE_CREATED:${principal.subject}:${documentSha256}`)
        .digest('hex');

      await client.query(
        `INSERT INTO gigalibs_esign.esign_audit_events
           (id, envelope_id, tenant_id, event_type, actor_name, actor_email, details, chain_hash, created_at)
         VALUES ($1, $2, $3, 'ENVELOPE_CREATED', $4, $5, $6, $7, NOW())`,
        [
          `evt-${randomUUID()}`,
          envelopeId,
          tenantId,
          principal.subject,
          principal.subject,
          JSON.stringify({ title: dto.title, signersCount: dto.recipients.length }),
          chainHash,
        ],
      );

      if (dto.sendImmediately) {
        const sendHash = createHash('sha256')
          .update(`${chainHash}:ENVELOPE_SENT:${principal.subject}`)
          .digest('hex');

        await client.query(
          `INSERT INTO gigalibs_esign.esign_audit_events
             (id, envelope_id, tenant_id, event_type, actor_name, actor_email, details, chain_hash, created_at)
           VALUES ($1, $2, $3, 'ENVELOPE_SENT', $4, $5, $6, $7, NOW())`,
          [
            `evt-${randomUUID()}`,
            envelopeId,
            tenantId,
            principal.subject,
            principal.subject,
            JSON.stringify({ status: 'SENT' }),
            sendHash,
          ],
        );
      }

      return {
        id: envelopeId,
        tenantId,
        title: dto.title,
        documentNumber: docNumber,
        status: initialStatus,
        documentSha256,
        signerCount: dto.recipients.length,
        createdAt: new Date().toISOString(),
      };
    });
  }

  async sendEnvelope(
    tenantId: string,
    envelopeId: string,
    principal: EsignPrincipal,
  ): Promise<any> {
    const env = await this.getEnvelope(tenantId, envelopeId);
    if (env.envelope.status !== 'DRAFT') {
      throw new BadRequestException(`Cannot send envelope with status: ${env.envelope.status}`);
    }

    return this.db.transaction(async (client) => {
      await client.query(
        `UPDATE gigalibs_esign.esign_envelopes SET status = 'SENT', updated_at = NOW() WHERE id = $1`,
        [envelopeId],
      );

      await client.query(
        `UPDATE gigalibs_esign.esign_recipients SET status = 'SENT' WHERE envelope_id = $1 AND status = 'PENDING'`,
        [envelopeId],
      );

      const chainHash = createHash('sha256')
        .update(`${envelopeId}:ENVELOPE_SENT:${principal.subject}`)
        .digest('hex');

      await client.query(
        `INSERT INTO gigalibs_esign.esign_audit_events
           (id, envelope_id, tenant_id, event_type, actor_name, actor_email, details, chain_hash, created_at)
         VALUES ($1, $2, $3, 'ENVELOPE_SENT', $4, $5, $6, $7, NOW())`,
        [
          `evt-${randomUUID()}`,
          envelopeId,
          tenantId,
          principal.subject,
          principal.subject,
          JSON.stringify({ status: 'SENT' }),
          chainHash,
        ],
      );

      return { envelopeId, status: 'SENT' };
    });
  }
}
