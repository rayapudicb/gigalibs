import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service.js';

export interface RuleDto {
  rule_code: string;
  name: string;
  description?: string;
  domain: string;
  scope?: string;
  department?: string;
  priority?: number;
  condition_ast: any;
  condition_expression: string;
  action_type: string;
  action_params?: any;
  effective_from?: string;
  effective_to?: string;
}

export type LifecycleStatus = 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'RETIRED';

@Injectable()
export class RulesService {
  constructor(private readonly db: DatabaseService) {}

  async getRules(
    tenantId: string,
    domain?: string,
    scope?: string,
    department?: string,
    status?: string,
    lifecycleStatus?: string,
    search?: string,
  ): Promise<any[]> {
    if (!tenantId) {
      throw new BadRequestException('tenant_id is required');
    }

    return this.db.withTenantTransaction(tenantId, async (client) => {
      let sql = `
        SELECT 
          r.id, r.tenant_id, r.rule_code, r.name, r.description, r.domain,
          r.scope, r.department, r.parent_rule_id, r.system_locked, r.priority,
          r.condition_ast, r.condition_expression, r.action_type, r.action_params,
          r.status, r.lifecycle_status, r.published_version, r.approver_id,
          r.effective_from, r.effective_to, r.created_at, r.updated_at,
          COUNT(v.id)::int AS versions_count
        FROM gigalibs_rules.rules r
        LEFT JOIN gigalibs_rules.rule_versions v ON r.id = v.rule_id
        WHERE (r.tenant_id = $1 OR r.scope = 'PLATFORM')
      `;
      const params: any[] = [tenantId];

      if (domain) {
        params.push(domain);
        sql += ` AND r.domain = $${params.length}`;
      }

      if (scope) {
        params.push(scope);
        sql += ` AND r.scope = $${params.length}`;
      }

      if (department) {
        params.push(department);
        sql += ` AND (r.department = $${params.length} OR r.department IS NULL)`;
      }

      if (status) {
        params.push(status);
        sql += ` AND r.status = $${params.length}`;
      }

      if (lifecycleStatus) {
        params.push(lifecycleStatus);
        sql += ` AND r.lifecycle_status = $${params.length}`;
      }

      if (search) {
        params.push(`%${search}%`);
        sql += ` AND (r.rule_code ILIKE $${params.length} OR r.name ILIKE $${params.length})`;
      }

      sql += ` GROUP BY r.id ORDER BY r.priority ASC, r.created_at ASC`;

      const res = await client.query(sql, params);
      return res.rows;
    });
  }

  async getRuleById(tenantId: string, id: string): Promise<any> {
    if (!tenantId) {
      throw new BadRequestException('tenant_id is required');
    }

    return this.db.withTenantTransaction(tenantId, async (client) => {
      const ruleRes = await client.query(
        `SELECT * FROM gigalibs_rules.rules WHERE id = $1 AND (tenant_id = $2 OR scope = 'PLATFORM')`,
        [id, tenantId]
      );

      if (ruleRes.rowCount === 0) {
        throw new NotFoundException(`Rule with ID '${id}' not found`);
      }

      const versionsRes = await client.query(
        `SELECT * FROM gigalibs_rules.rule_versions WHERE rule_id = $1 ORDER BY published_at DESC`,
        [id]
      );

      return {
        ...ruleRes.rows[0],
        versions: versionsRes.rows,
      };
    });
  }

  async createRule(tenantId: string, dto: RuleDto, creatorId: string = 'system'): Promise<any> {
    if (!tenantId) {
      throw new BadRequestException('tenant_id is required');
    }

    if (!dto.rule_code || !dto.name || !dto.domain || !dto.condition_ast || !dto.condition_expression || !dto.action_type) {
      throw new BadRequestException('Missing required fields for business rule creation');
    }

    const scope = dto.scope || 'TENANT';
    if (!['PLATFORM', 'TENANT', 'DEPARTMENT'].includes(scope)) {
      throw new BadRequestException(`Invalid scope '${scope}'. Must be PLATFORM, TENANT, or DEPARTMENT.`);
    }

    if (scope === 'DEPARTMENT' && !dto.department) {
      throw new BadRequestException('department is required when scope is DEPARTMENT');
    }

    return this.db.withTenantTransaction(tenantId, async (client) => {
      const ruleId = `rul-${randomUUID().slice(0, 8)}`;
      const versionId = `ver-${randomUUID().slice(0, 8)}`;

      const insertRuleSql = `
        INSERT INTO gigalibs_rules.rules (
          id, tenant_id, rule_code, name, description, domain, scope, department, system_locked,
          priority, condition_ast, condition_expression, action_type, action_params, status, lifecycle_status,
          published_version, effective_from, effective_to, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, $9, $10, $11, $12, $13, 'ACTIVE', 'DRAFT', '1.0.0', $14, $15, NOW(), NOW())
        RETURNING *
      `;

      const effectiveFrom = dto.effective_from ? new Date(dto.effective_from) : new Date();
      const effectiveTo = dto.effective_to ? new Date(dto.effective_to) : null;

      const ruleRes = await client.query(insertRuleSql, [
        ruleId,
        tenantId,
        dto.rule_code,
        dto.name,
        dto.description || '',
        dto.domain,
        scope,
        dto.department || null,
        dto.priority || 100,
        JSON.stringify(dto.condition_ast),
        dto.condition_expression,
        dto.action_type,
        JSON.stringify(dto.action_params || {}),
        effectiveFrom,
        effectiveTo,
      ]);

      const insertVersionSql = `
        INSERT INTO gigalibs_rules.rule_versions (
          id, rule_id, version, condition_ast, condition_expression, action_type, action_params, published_by, published_at
        ) VALUES ($1, $2, '1.0.0', $3, $4, $5, $6, $7, NOW())
        RETURNING *
      `;

      await client.query(insertVersionSql, [
        versionId,
        ruleId,
        JSON.stringify(dto.condition_ast),
        dto.condition_expression,
        dto.action_type,
        JSON.stringify(dto.action_params || {}),
        creatorId,
      ]);

      await client.query(
        `INSERT INTO gigalibs_rules.audit_events (id, tenant_id, entity_type, entity_id, action, payload, created_at)
         VALUES ($1, $2, 'BUSINESS_RULE', $3, 'RULE_CREATED', $4, NOW())`,
        [
          `aud-${randomUUID().slice(0, 8)}`,
          tenantId,
          ruleId,
          JSON.stringify({ rule_code: dto.rule_code, domain: dto.domain, scope }),
        ]
      );

      return ruleRes.rows[0];
    });
  }

  async publishRuleVersion(
    tenantId: string,
    ruleId: string,
    newVersion: string,
    approverId: string,
    updatedAst?: any,
    updatedExpression?: string,
    updatedActionType?: string,
    updatedActionParams?: any,
  ): Promise<any> {
    if (!tenantId) {
      throw new BadRequestException('tenant_id is required');
    }
    if (!approverId) {
      throw new BadRequestException('approver_id is required for publishing rule version');
    }

    return this.db.withTenantTransaction(tenantId, async (client) => {
      const ruleRes = await client.query(
        `SELECT * FROM gigalibs_rules.rules WHERE id = $1 AND (tenant_id = $2 OR scope = 'PLATFORM')`,
        [ruleId, tenantId]
      );

      if (ruleRes.rowCount === 0) {
        throw new NotFoundException(`Rule with ID '${ruleId}' not found`);
      }

      const rule = ruleRes.rows[0];
      if (rule.system_locked) {
        throw new ForbiddenException('Cannot modify system_locked platform statutory guardrails');
      }

      const versionId = `ver-${randomUUID().slice(0, 8)}`;
      const conditionAst = updatedAst ?? rule.condition_ast;
      const conditionExpression = updatedExpression ?? rule.condition_expression;
      const actionType = updatedActionType ?? rule.action_type;
      const actionParams = updatedActionParams ?? rule.action_params;

      await client.query(
        `INSERT INTO gigalibs_rules.rule_versions (
          id, rule_id, version, condition_ast, condition_expression, action_type, action_params, published_by, published_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          versionId,
          ruleId,
          newVersion,
          JSON.stringify(conditionAst),
          conditionExpression,
          actionType,
          JSON.stringify(actionParams),
          approverId,
        ]
      );

      const updateRes = await client.query(
        `UPDATE gigalibs_rules.rules
         SET published_version = $1,
             lifecycle_status = 'PUBLISHED',
             status = 'ACTIVE',
             approver_id = $2,
             condition_ast = $3,
             condition_expression = $4,
             action_type = $5,
             action_params = $6,
             updated_at = NOW()
         WHERE id = $7
         RETURNING *`,
        [
          newVersion,
          approverId,
          JSON.stringify(conditionAst),
          conditionExpression,
          actionType,
          JSON.stringify(actionParams),
          ruleId,
        ]
      );

      await client.query(
        `INSERT INTO gigalibs_rules.audit_events (id, tenant_id, entity_type, entity_id, action, payload, created_at)
         VALUES ($1, $2, 'BUSINESS_RULE', $3, 'VERSION_PUBLISHED', $4, NOW())`,
        [
          `aud-${randomUUID().slice(0, 8)}`,
          tenantId,
          ruleId,
          JSON.stringify({ version: newVersion, approver_id: approverId }),
        ]
      );

      return updateRes.rows[0];
    });
  }

  async updateRuleLifecycle(
    tenantId: string,
    id: string,
    lifecycleStatus: LifecycleStatus,
    approverId?: string,
  ): Promise<any> {
    if (!tenantId) {
      throw new BadRequestException('tenant_id is required');
    }

    const validStatuses: LifecycleStatus[] = ['DRAFT', 'REVIEW', 'PUBLISHED', 'RETIRED'];
    if (!validStatuses.includes(lifecycleStatus)) {
      throw new BadRequestException(`Invalid lifecycle status '${lifecycleStatus}'. Must be one of: ${validStatuses.join(', ')}`);
    }

    return this.db.withTenantTransaction(tenantId, async (client) => {
      const ruleRes = await client.query(
        `SELECT * FROM gigalibs_rules.rules WHERE id = $1 AND (tenant_id = $2 OR scope = 'PLATFORM')`,
        [id, tenantId]
      );

      if (ruleRes.rowCount === 0) {
        throw new NotFoundException(`Rule with ID '${id}' not found`);
      }

      const rule = ruleRes.rows[0];
      if (rule.system_locked && lifecycleStatus === 'RETIRED') {
        throw new ForbiddenException('Cannot retire system_locked platform statutory guardrails');
      }

      if (lifecycleStatus === 'PUBLISHED' && !approverId) {
        throw new BadRequestException('approver_id is required when transitioning to PUBLISHED status');
      }

      const newStatus = lifecycleStatus === 'RETIRED' ? 'INACTIVE' : 'ACTIVE';

      const updateRes = await client.query(
        `UPDATE gigalibs_rules.rules
         SET lifecycle_status = $1,
             status = $2,
             approver_id = COALESCE($3, approver_id),
             updated_at = NOW()
         WHERE id = $4
         RETURNING *`,
        [lifecycleStatus, newStatus, approverId || null, id]
      );

      await client.query(
        `INSERT INTO gigalibs_rules.audit_events (id, tenant_id, entity_type, entity_id, action, payload, created_at)
         VALUES ($1, $2, 'BUSINESS_RULE', $3, 'LIFECYCLE_STATUS_CHANGED', $4, NOW())`,
        [
          `aud-${randomUUID().slice(0, 8)}`,
          tenantId,
          id,
          JSON.stringify({
            old_lifecycle: rule.lifecycle_status,
            new_lifecycle: lifecycleStatus,
            approver_id: approverId,
          }),
        ]
      );

      return updateRes.rows[0];
    });
  }

  async updateRuleStatus(tenantId: string, id: string, status: string): Promise<any> {
    if (!tenantId) {
      throw new BadRequestException('tenant_id is required');
    }

    return this.db.withTenantTransaction(tenantId, async (client) => {
      const ruleRes = await client.query(
        `SELECT * FROM gigalibs_rules.rules WHERE id = $1 AND (tenant_id = $2 OR scope = 'PLATFORM')`,
        [id, tenantId]
      );

      if (ruleRes.rowCount === 0) {
        throw new NotFoundException(`Rule with ID '${id}' not found`);
      }

      const rule = ruleRes.rows[0];
      if (rule.system_locked && status !== 'ACTIVE') {
        throw new ForbiddenException('Cannot disable or modify system_locked platform statutory guardrails');
      }

      const updateRes = await client.query(
        `UPDATE gigalibs_rules.rules SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [status, id]
      );

      await client.query(
        `INSERT INTO gigalibs_rules.audit_events (id, tenant_id, entity_type, entity_id, action, payload, created_at)
         VALUES ($1, $2, 'BUSINESS_RULE', $3, 'STATUS_CHANGED', $4, NOW())`,
        [
          `aud-${randomUUID().slice(0, 8)}`,
          tenantId,
          id,
          JSON.stringify({ old_status: rule.status, new_status: status }),
        ]
      );

      return updateRes.rows[0];
    });
  }
}
