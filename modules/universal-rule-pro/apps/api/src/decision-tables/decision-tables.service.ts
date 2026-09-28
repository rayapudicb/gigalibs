import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service.js';

export type HitPolicy = 'FIRST' | 'FIRST_MATCH' | 'UNIQUE' | 'COLLECT';

export interface DecisionTableDto {
  table_code: string;
  name: string;
  domain: string;
  hit_policy: HitPolicy;
  columns: {
    inputs: Array<{ name: string; type: string; label?: string }>;
    outputs: Array<{ name: string; type: string; label?: string }>;
  };
  rows: Array<Record<string, any>>;
}

export interface DecisionTableEvaluationResponse {
  success: boolean;
  table_code: string;
  table_name: string;
  domain: string;
  hit_policy: string;
  matched: boolean;
  matched_rows_count: number;
  matched_rows: any[];
  outputs: Record<string, any> | Array<Record<string, any>>;
  execution_latency_ms: number;
  is_preview: boolean;
  evaluated_at: string;
}

@Injectable()
export class DecisionTablesService {
  constructor(private readonly db: DatabaseService) {}

  async listTables(tenantId: string, domain?: string): Promise<any[]> {
    if (!tenantId) {
      throw new BadRequestException('tenant_id is required');
    }

    return this.db.withTenantTransaction(tenantId, async (client) => {
      let sql = `SELECT * FROM gigalibs_rules.decision_tables WHERE tenant_id = $1`;
      const params: any[] = [tenantId];
      if (domain) {
        params.push(domain);
        sql += ` AND domain = $2`;
      }
      sql += ` ORDER BY created_at DESC`;
      const res = await client.query(sql, params);
      return res.rows;
    });
  }

  async getTable(tenantId: string, idOrCode: string): Promise<any> {
    if (!tenantId) {
      throw new BadRequestException('tenant_id is required');
    }

    return this.db.withTenantTransaction(tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM gigalibs_rules.decision_tables WHERE tenant_id = $1 AND (id = $2 OR table_code = $2)`,
        [tenantId, idOrCode]
      );
      if (res.rowCount === 0) {
        throw new NotFoundException(`Decision table '${idOrCode}' not found`);
      }
      return res.rows[0];
    });
  }

  async createTable(tenantId: string, dto: DecisionTableDto): Promise<any> {
    if (!tenantId) {
      throw new BadRequestException('tenant_id is required');
    }
    if (!dto.table_code || !dto.name || !dto.domain || !dto.columns || !dto.rows) {
      throw new BadRequestException('table_code, name, domain, columns, and rows are required');
    }

    const hitPolicy = (dto.hit_policy || 'FIRST').toUpperCase() as HitPolicy;
    const allowedHitPolicies: HitPolicy[] = ['FIRST', 'FIRST_MATCH', 'UNIQUE', 'COLLECT'];
    if (!allowedHitPolicies.includes(hitPolicy)) {
      throw new BadRequestException(
        `Unsupported hit_policy '${dto.hit_policy}'. Must be one of: FIRST, UNIQUE, COLLECT`
      );
    }

    return this.db.withTenantTransaction(tenantId, async (client) => {
      const tableId = `tbl-${randomUUID().slice(0, 8)}`;
      const insertSql = `
        INSERT INTO gigalibs_rules.decision_tables (
          id, tenant_id, table_code, name, domain, hit_policy, columns, rows, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', NOW(), NOW())
        RETURNING *
      `;

      const res = await client.query(insertSql, [
        tableId,
        tenantId,
        dto.table_code,
        dto.name,
        dto.domain,
        hitPolicy === 'FIRST_MATCH' ? 'FIRST' : hitPolicy,
        JSON.stringify(dto.columns),
        JSON.stringify(dto.rows),
      ]);

      await client.query(
        `INSERT INTO gigalibs_rules.audit_events (id, tenant_id, entity_type, entity_id, action, payload, created_at)
         VALUES ($1, $2, 'DECISION_TABLE', $3, 'TABLE_CREATED', $4, NOW())`,
        [
          `aud-${randomUUID().slice(0, 8)}`,
          tenantId,
          tableId,
          JSON.stringify({ table_code: dto.table_code, domain: dto.domain, hit_policy: hitPolicy }),
        ]
      );

      return res.rows[0];
    });
  }

  async evaluateTable(
    tenantId: string,
    tableCode: string,
    inputContext: Record<string, any>,
    preview: boolean = false,
  ): Promise<DecisionTableEvaluationResponse> {
    if (!tenantId) {
      throw new BadRequestException('tenant_id is required');
    }
    if (!tableCode || !inputContext || typeof inputContext !== 'object') {
      throw new BadRequestException('table_code and inputContext object are required');
    }

    const startTime = performance.now();
    const table = await this.getTable(tenantId, tableCode);
    const columns = table.columns || { inputs: [], outputs: [] };
    const rows = table.rows || [];
    const rawHitPolicy = (table.hit_policy || 'FIRST').toUpperCase();

    const allowedHitPolicies = ['FIRST', 'FIRST_MATCH', 'UNIQUE', 'COLLECT'];
    if (!allowedHitPolicies.includes(rawHitPolicy)) {
      throw new BadRequestException(
        `Unsupported hit policy '${table.hit_policy}'. Advertised hit policies are: FIRST, UNIQUE, COLLECT`
      );
    }

    const hitPolicy = rawHitPolicy === 'FIRST_MATCH' ? 'FIRST' : rawHitPolicy;
    const matchingRows: any[] = [];

    for (const row of rows) {
      let rowMatches = true;
      for (const inputCol of columns.inputs) {
        const expectedExpr = row[inputCol.name];
        const actualVal = inputContext[inputCol.name];

        if (expectedExpr === 'ANY' || expectedExpr === undefined || expectedExpr === null || expectedExpr === '') {
          continue;
        }

        if (!this.matchCell(actualVal, expectedExpr)) {
          rowMatches = false;
          break;
        }
      }

      if (rowMatches) {
        matchingRows.push(row);
        if (hitPolicy === 'FIRST') {
          break; // Stop after first match
        }
      }
    }

    // Hit policy semantics verification (RL-02)
    if (hitPolicy === 'UNIQUE' && matchingRows.length > 1) {
      throw new BadRequestException(
        `Decision Table '${tableCode}' with UNIQUE hit policy encountered conflict: multiple rows (${matchingRows.length}) matched input context.`
      );
    }

    const latencyMs = Number((performance.now() - startTime).toFixed(3));
    let outputs: Record<string, any> | Array<Record<string, any>> = {};

    if (hitPolicy === 'COLLECT') {
      outputs = matchingRows.map((matchedRow) => {
        const rowOutput: Record<string, any> = {};
        for (const outCol of columns.outputs) {
          rowOutput[outCol.name] = matchedRow[outCol.name];
        }
        return rowOutput;
      });
    } else if (matchingRows.length > 0) {
      const primaryMatched = matchingRows[0];
      const singleOutput: Record<string, any> = {};
      for (const outCol of columns.outputs) {
        singleOutput[outCol.name] = primaryMatched[outCol.name];
      }
      outputs = singleOutput;
    }

    const hasMatch = matchingRows.length > 0;

    // Persist evaluation evidence
    await this.db.withTenantTransaction(tenantId, async (client) => {
      await client.query(
        `INSERT INTO gigalibs_rules.rule_evaluation_logs (
          id, tenant_id, rule_id, rule_code, rule_version_id, context_id, domain,
          input_payload, matched, evaluation_verdict, proposed_action, is_preview,
          execution_latency_ms, action_taken, evaluated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())`,
        [
          `log-${randomUUID().slice(0, 8)}`,
          tenantId,
          table.id,
          table.table_code,
          '1.0.0',
          inputContext.context_id || `ctx-${randomUUID().slice(0, 8)}`,
          table.domain,
          JSON.stringify(inputContext),
          hasMatch,
          hasMatch ? 'MATCH' : 'NO_MATCH',
          JSON.stringify(outputs),
          preview,
          latencyMs,
          `TABLE_${hitPolicy}`,
        ]
      );
    });

    return {
      success: true,
      table_code: table.table_code,
      table_name: table.name,
      domain: table.domain,
      hit_policy: hitPolicy,
      matched: hasMatch,
      matched_rows_count: matchingRows.length,
      matched_rows: matchingRows,
      outputs,
      execution_latency_ms: latencyMs,
      is_preview: preview,
      evaluated_at: new Date().toISOString(),
    };
  }

  public matchCell(actualVal: any, pattern: any): boolean {
    if (pattern === 'ANY' || pattern === '*' || pattern === undefined || pattern === null || pattern === '') {
      return true;
    }

    if (actualVal === undefined || actualVal === null) {
      return false;
    }

    const patternStr = String(pattern).trim();

    // Range syntax: "[10..50]" or "[10, 50]"
    const rangeMatch = patternStr.match(/^\[\s*(-?\d+(?:\.\d+)?)\s*(?:\.\.|,)\s*(-?\d+(?:\.\d+)?)\s*\]$/);
    if (rangeMatch) {
      const numActual = Number(actualVal);
      if (!Number.isFinite(numActual)) return false;
      const min = Number(rangeMatch[1]);
      const max = Number(rangeMatch[2]);
      return numActual >= min && numActual <= max;
    }

    // Set membership: "IN ('A', 'B', 'C')" or "['A', 'B']"
    if (patternStr.toUpperCase().startsWith('IN ') || (patternStr.startsWith('[') && patternStr.endsWith(']'))) {
      const cleanList = patternStr
        .replace(/^IN\s*\(/i, '')
        .replace(/\)$/, '')
        .replace(/^\[/, '')
        .replace(/\]$/, '')
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, '').toUpperCase());

      return cleanList.includes(String(actualVal).trim().toUpperCase());
    }

    // Comparison operators
    if (patternStr.startsWith('>=')) {
      const numActual = Number(actualVal);
      const numTarget = Number(patternStr.slice(2).trim());
      return Number.isFinite(numActual) && Number.isFinite(numTarget) && numActual >= numTarget;
    }
    if (patternStr.startsWith('<=')) {
      const numActual = Number(actualVal);
      const numTarget = Number(patternStr.slice(2).trim());
      return Number.isFinite(numActual) && Number.isFinite(numTarget) && numActual <= numTarget;
    }
    if (patternStr.startsWith('>')) {
      const numActual = Number(actualVal);
      const numTarget = Number(patternStr.slice(1).trim());
      return Number.isFinite(numActual) && Number.isFinite(numTarget) && numActual > numTarget;
    }
    if (patternStr.startsWith('<')) {
      const numActual = Number(actualVal);
      const numTarget = Number(patternStr.slice(1).trim());
      return Number.isFinite(numActual) && Number.isFinite(numTarget) && numActual < numTarget;
    }
    if (patternStr.startsWith('!=')) {
      return String(actualVal).trim().toUpperCase() !== patternStr.slice(2).trim().toUpperCase();
    }

    // Exact string / number equivalence
    return String(actualVal).trim().toUpperCase() === patternStr.toUpperCase();
  }
}
