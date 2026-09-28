import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service.js';
import {
  computeContractSealHash,
  GENESIS_SEAL_HASH,
  verifyContractLedgerChain,
  type ContractLedgerVerificationResult,
} from './contract-ledger-seal.js';
import { redactSensitiveData } from '../auth/data-redaction.js';

export interface ContractSummary {
  id: string;
  tenant_id: string;
  contract_code: string;
  name: string;
  domain: string;
  owner_team: string;
  active_version: string;
  compatibility_mode: string;
  status: string;
  created_at: string;
  updated_at: string;
  versions_count: number;
  assertions_count: number;
  mappings_count: number;
  latest_schema?: any;
}

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);

  constructor(private readonly db: DatabaseService) {}

  async getContracts(tenantId: string, domain?: string, search?: string): Promise<ContractSummary[]> {
    if (!tenantId) throw new BadRequestException('tenantId is required');

    let sql = `
      SELECT 
        c.id, c.tenant_id, c.contract_code, c.name, c.domain, c.owner_team, 
        c.active_version, c.compatibility_mode, c.status, c.created_at, c.updated_at,
        COUNT(DISTINCT v.id)::int AS versions_count,
        COUNT(DISTINCT qa.id)::int AS assertions_count,
        COUNT(DISTINCT fm.id)::int AS mappings_count
      FROM gigalibs_data_studio.data_contracts c
      LEFT JOIN gigalibs_data_studio.contract_versions v ON c.id = v.contract_id
      LEFT JOIN gigalibs_data_studio.quality_assertions qa ON c.id = qa.contract_id
      LEFT JOIN gigalibs_data_studio.field_mappings fm ON c.id = fm.contract_id
      WHERE c.tenant_id = $1
    `;
    const params: any[] = [tenantId];

    if (domain) {
      params.push(domain);
      sql += ` AND c.domain = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (c.contract_code ILIKE $${params.length} OR c.name ILIKE $${params.length})`;
    }

    sql += ` GROUP BY c.id ORDER BY c.updated_at DESC`;

    const result = await this.db.query(sql, params);
    return result.rows;
  }

  async getContractById(tenantId: string, id: string): Promise<any> {
    if (!tenantId) throw new BadRequestException('tenantId is required');

    const contractRes = await this.db.query(
      `SELECT * FROM gigalibs_data_studio.data_contracts WHERE (id = $1 OR contract_code = $1) AND tenant_id = $2`,
      [id, tenantId],
    );

    if (contractRes.rowCount === 0) {
      throw new NotFoundException(`Data contract with ID or code '${id}' not found for tenant '${tenantId}'`);
    }

    const contract = contractRes.rows[0];

    const versionsRes = await this.db.query(
      `SELECT * FROM gigalibs_data_studio.contract_versions WHERE contract_id = $1 ORDER BY published_at DESC`,
      [contract.id],
    );

    const assertionsRes = await this.db.query(
      `SELECT * FROM gigalibs_data_studio.quality_assertions WHERE contract_id = $1 ORDER BY created_at ASC`,
      [contract.id],
    );

    const mappingsRes = await this.db.query(
      `SELECT * FROM gigalibs_data_studio.field_mappings WHERE contract_id = $1 ORDER BY created_at ASC`,
      [contract.id],
    );

    return {
      ...contract,
      versions: versionsRes.rows,
      assertions: assertionsRes.rows,
      mappings: mappingsRes.rows,
    };
  }

  async createContract(
    tenantId: string,
    dto: {
      contract_code: string;
      name: string;
      domain: string;
      owner_team: string;
      compatibility_mode?: string;
      initial_schema: any;
    },
  ): Promise<any> {
    if (!tenantId) throw new BadRequestException('tenantId is required');
    if (!dto.contract_code || !dto.name || !dto.domain || !dto.owner_team || !dto.initial_schema) {
      throw new BadRequestException('Missing required contract registration fields');
    }

    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');

      // Delta-5 cryptographic ledger chain link
      const latestSealRes = await client.query<{ seal_sequence: string | number; seal_hash: string }>(
        `SELECT seal_sequence, seal_hash FROM gigalibs_data_studio.data_contracts
         WHERE tenant_id = $1 AND seal_sequence IS NOT NULL
         ORDER BY seal_sequence DESC LIMIT 1 FOR UPDATE`,
        [tenantId],
      );

      const lastSeq = latestSealRes.rows[0]?.seal_sequence != null ? Number(latestSealRes.rows[0].seal_sequence) : 0;
      const nextSeq = lastSeq + 1;
      const prevHash = latestSealRes.rows[0]?.seal_hash ?? GENESIS_SEAL_HASH;
      const createdAtIso = new Date().toISOString();

      const contractId = `dc-${randomUUID().slice(0, 8)}`;
      const versionId = `ver-${randomUUID().slice(0, 8)}`;
      const initialVersion = '1.0.0';

      const sealHash = computeContractSealHash({
        tenantId,
        sequence: nextSeq,
        contractId,
        contractCode: dto.contract_code,
        name: dto.name,
        domain: dto.domain,
        activeVersion: initialVersion,
        createdAt: createdAtIso,
        previousSealHash: prevHash,
      });

      const insertContractSql = `
        INSERT INTO gigalibs_data_studio.data_contracts (
          id, tenant_id, contract_code, name, domain, owner_team, active_version, compatibility_mode, status,
          seal_sequence, seal_hash, previous_seal_hash, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PUBLISHED', $9, $10, $11, $12, $12)
        RETURNING *
      `;
      const contractRes = await client.query(insertContractSql, [
        contractId,
        tenantId,
        dto.contract_code,
        dto.name,
        dto.domain,
        dto.owner_team,
        initialVersion,
        dto.compatibility_mode || 'BACKWARD',
        nextSeq,
        sealHash,
        prevHash,
        createdAtIso,
      ]);

      const insertVersionSql = `
        INSERT INTO gigalibs_data_studio.contract_versions (
          id, contract_id, version, json_schema, schema_format, change_summary, is_breaking_change, published_by, published_at
        ) VALUES ($1, $2, $3, $4, 'JSONSCHEMA_DRAFT_07', 'Initial schema contract specification', false, 'system-admin', NOW())
        RETURNING *
      `;
      const versionRes = await client.query(insertVersionSql, [
        versionId,
        contractId,
        initialVersion,
        dto.initial_schema,
      ]);

      const { sanitized } = redactSensitiveData({
        contract_code: dto.contract_code,
        version: initialVersion,
      });

      await client.query(
        `INSERT INTO gigalibs_data_studio.audit_events (id, tenant_id, entity_type, entity_id, action, payload, created_at)
         VALUES ($1, $2, 'DATA_CONTRACT', $3, 'CONTRACT_CREATED', $4, NOW())`,
        [
          `aud-${randomUUID().slice(0, 8)}`,
          tenantId,
          contractId,
          JSON.stringify(sanitized),
        ],
      );

      await client.query('COMMIT');
      return {
        ...contractRes.rows[0],
        versions: [versionRes.rows[0]],
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw new BadRequestException(`Failed to register data contract: ${err.message}`);
    } finally {
      client.release();
    }
  }

  /**
   * DS-01: Publish immutable version with automated breaking change analysis.
   */
  async publishVersion(
    tenantId: string,
    contractId: string,
    dto: {
      version: string;
      json_schema: any;
      change_summary: string;
      published_by?: string;
    },
  ): Promise<any> {
    if (!tenantId) throw new BadRequestException('tenantId is required');
    if (!dto.version || !dto.json_schema || !dto.change_summary) {
      throw new BadRequestException('version, json_schema, and change_summary are required');
    }

    const contractRes = await this.db.query(
      `SELECT * FROM gigalibs_data_studio.data_contracts WHERE (id = $1 OR contract_code = $1) AND tenant_id = $2`,
      [contractId, tenantId],
    );

    if (contractRes.rowCount === 0) {
      throw new NotFoundException(`Data contract with ID '${contractId}' not found`);
    }

    const contract = contractRes.rows[0];

    // Check existing active version schema for compatibility
    const prevVersionRes = await this.db.query(
      `SELECT * FROM gigalibs_data_studio.contract_versions WHERE contract_id = $1 AND version = $2`,
      [contract.id, contract.active_version],
    );

    let isBreakingChange = false;
    const breakingReasons: string[] = [];

    if (prevVersionRes.rowCount && prevVersionRes.rowCount > 0) {
      const prevSchema = prevVersionRes.rows[0].json_schema;
      const newSchema = dto.json_schema;

      const prevRequired: string[] = prevSchema.required || [];
      const newRequired: string[] = newSchema.required || [];

      // 1. Added required fields breaks backward compatibility for producers
      const addedRequired = newRequired.filter((r) => !prevRequired.includes(r));
      if (addedRequired.length > 0) {
        isBreakingChange = true;
        breakingReasons.push(`Added new mandatory field(s): ${addedRequired.join(', ')}`);
      }

      // 2. Removed properties breaks forward compatibility
      const prevProps = Object.keys(prevSchema.properties || {});
      const newProps = Object.keys(newSchema.properties || {});
      const removedProps = prevProps.filter((p) => !newProps.includes(p));
      if (removedProps.length > 0) {
        isBreakingChange = true;
        breakingReasons.push(`Removed property definition(s): ${removedProps.join(', ')}`);
      }

      // 3. Changed property types
      for (const prop of prevProps) {
        if (newSchema.properties?.[prop] && prevSchema.properties?.[prop]) {
          const oldType = prevSchema.properties[prop].type;
          const newType = newSchema.properties[prop].type;
          if (oldType && newType && oldType !== newType) {
            isBreakingChange = true;
            breakingReasons.push(`Property '${prop}' type changed from ${oldType} to ${newType}`);
          }
        }
      }
    }

    const client = await this.db.getClient();
    try {
      await client.query('BEGIN');
      const versionId = `ver-${randomUUID().slice(0, 8)}`;

      const insertVersionSql = `
        INSERT INTO gigalibs_data_studio.contract_versions (
          id, contract_id, version, json_schema, schema_format, change_summary, is_breaking_change, published_by, published_at
        ) VALUES ($1, $2, $3, $4, 'JSONSCHEMA_DRAFT_07', $5, $6, $7, NOW())
        RETURNING *
      `;

      const finalSummary = breakingReasons.length > 0
        ? `${dto.change_summary} [BREAKING: ${breakingReasons.join('; ')}]`
        : dto.change_summary;

      const versionRes = await client.query(insertVersionSql, [
        versionId,
        contract.id,
        dto.version,
        dto.json_schema,
        finalSummary,
        isBreakingChange,
        dto.published_by || 'system-admin',
      ]);

      await client.query(
        `UPDATE gigalibs_data_studio.data_contracts SET active_version = $1, updated_at = NOW() WHERE id = $2`,
        [dto.version, contract.id],
      );

      await client.query(
        `INSERT INTO gigalibs_data_studio.audit_events (id, tenant_id, entity_type, entity_id, action, payload, created_at)
         VALUES ($1, $2, 'DATA_CONTRACT', $3, 'VERSION_PUBLISHED', $4, NOW())`,
        [
          `aud-${randomUUID().slice(0, 8)}`,
          tenantId,
          contract.id,
          JSON.stringify({
            version: dto.version,
            is_breaking: isBreakingChange,
            breaking_reasons: breakingReasons,
            summary: finalSummary,
          }),
        ],
      );

      await client.query('COMMIT');
      return versionRes.rows[0];
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw new BadRequestException(`Failed to publish contract version: ${err.message}`);
    } finally {
      client.release();
    }
  }

  /**
   * DS-01: Prevent deleting versions referenced by evidence (mappings, assertions, drift logs).
   */
  async deleteVersion(tenantId: string, contractId: string, version: string): Promise<any> {
    if (!tenantId) throw new BadRequestException('tenantId is required');

    const contractRes = await this.db.query(
      `SELECT * FROM gigalibs_data_studio.data_contracts WHERE (id = $1 OR contract_code = $1) AND tenant_id = $2`,
      [contractId, tenantId],
    );
    if (contractRes.rowCount === 0) {
      throw new NotFoundException(`Contract '${contractId}' not found`);
    }
    const contract = contractRes.rows[0];

    // Check if active
    if (contract.active_version === version) {
      throw new BadRequestException(`Cannot delete active contract version '${version}'. Rollback or activate another version first.`);
    }

    // Check references in field mappings or drift logs
    const driftCheck = await this.db.query(
      `SELECT id FROM gigalibs_data_studio.schema_drift_logs WHERE contract_id = $1 LIMIT 1`,
      [contract.id],
    );
    if (driftCheck.rowCount && driftCheck.rowCount > 0) {
      throw new BadRequestException(`Cannot delete contract version '${version}': historical drift records reference this contract.`);
    }

    const delRes = await this.db.query(
      `DELETE FROM gigalibs_data_studio.contract_versions WHERE contract_id = $1 AND version = $2 RETURNING *`,
      [contract.id, version],
    );

    if (delRes.rowCount === 0) {
      throw new NotFoundException(`Version '${version}' not found on contract '${contract.contract_code}'`);
    }

    return {
      success: true,
      deleted_version: version,
      contract_code: contract.contract_code,
    };
  }

  /**
   * Deprecate contract with audit trail.
   */
  async deprecateContract(tenantId: string, contractId: string, reason: string): Promise<any> {
    if (!tenantId) throw new BadRequestException('tenantId is required');

    const res = await this.db.query(
      `UPDATE gigalibs_data_studio.data_contracts
       SET status = 'DEPRECATED', deprecated_at = NOW(), deprecation_reason = $1, updated_at = NOW()
       WHERE (id = $2 OR contract_code = $2) AND tenant_id = $3
       RETURNING *`,
      [reason || 'Deprecated by schema governance', contractId, tenantId],
    );

    if (res.rowCount === 0) {
      throw new NotFoundException(`Contract '${contractId}' not found`);
    }

    return res.rows[0];
  }

  /**
   * Delta-5: Fail-closed cryptographic ledger verification of contract publication chain.
   */
  async verifyLedger(tenantId: string): Promise<ContractLedgerVerificationResult> {
    if (!tenantId) throw new BadRequestException('tenantId is required');

    const res = await this.db.query(
      `SELECT id, tenant_id, contract_code, name, domain, active_version, created_at,
              seal_sequence, seal_hash, previous_seal_hash
       FROM gigalibs_data_studio.data_contracts
       WHERE tenant_id = $1
       ORDER BY seal_sequence ASC NULLS LAST, created_at ASC`,
      [tenantId],
    );

    const records = res.rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      contractCode: row.contract_code,
      name: row.name,
      domain: row.domain,
      activeVersion: row.active_version,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      sealSequence: row.seal_sequence != null ? Number(row.seal_sequence) : undefined,
      sealHash: row.seal_hash ?? undefined,
      previousSealHash: row.previous_seal_hash ?? undefined,
    }));

    return verifyContractLedgerChain(records);
  }
}
