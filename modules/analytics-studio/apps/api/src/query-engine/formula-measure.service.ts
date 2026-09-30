import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  CreateFormulaMeasureV1Schema,
  CreateFormulaMeasureVersionV1Schema,
  FormulaMeasureDecisionV1Schema,
  FormulaMeasureDefinitionV1Schema,
  inspectFormulaExpression,
  type CreateFormulaMeasureV1,
  type CreateFormulaMeasureVersionV1,
  type FormulaMeasureDecisionV1,
  type FormulaMeasureDefinitionV1,
  type FormulaMeasureV1,
  type FormulaMeasureVersionStateV1,
} from '@gigalibs/contracts';
import { z } from 'zod';
import type { AnalyticsPrincipal } from '../auth/authorization.js';
import { DatabaseService } from '../database/database.service.js';

const IdSchema = z.string().uuid();

interface FormulaRow {
  id: string;
  semantic_model_id: string;
  measure_name: string;
  created_by: string;
  created_at: string;
  current_published_version_id: string | null;
}

interface VersionRow {
  id: string;
  version_number: number;
  definition: unknown;
  content_hash: string;
  created_by: string;
  created_at: string;
  submitted_by: string | null;
  submitted_at: string | null;
  terminal_decision: 'APPROVED' | 'REJECTED' | null;
  reviewed_by: string | null;
  review_reason: string | null;
  reviewed_at: string | null;
}

/**
 * Versioned formula measures (WI-OI-103b).
 *
 * The definition and every review decision are append-only. Publishing changes only the formula's current-version
 * pointer, under a row lock, and requires an authenticated subject other than the version creator.
 */
@Injectable()
export class FormulaMeasureService {
  constructor(private readonly db: DatabaseService) {}

  async create(principal: AnalyticsPrincipal, input: unknown): Promise<FormulaMeasureV1> {
    const dto = parseBody(CreateFormulaMeasureV1Schema, input);
    try {
      return await this.db.withTenantTransaction(principal.tenantId, async (client) => {
        await this.assertModelAndReferences(client, dto.semanticModelId, dto.name, dto.definition);
        const formula = await client.query<{ id: string }>(
          `INSERT INTO gigalibs_analytics.formula_measures
             (semantic_model_id, tenant_id, measure_name, created_by)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [dto.semanticModelId, principal.tenantId, dto.name, principal.subject],
        );
        const formulaId = formula.rows[0]!.id;
        const versionId = await this.insertVersion(client, principal, formulaId, 1, dto.definition);
        await this.audit(client, principal, 'FORMULA_MEASURE_CREATED', formulaId, {
          semanticModelId: dto.semanticModelId,
          versionId,
          versionNumber: 1,
        });
        return this.getWithinTransaction(client, formulaId);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException(`Formula measure '${dto.name}' already exists in this model.`);
      throw error;
    }
  }

  async createVersion(
    principal: AnalyticsPrincipal,
    formulaMeasureId: string,
    input: unknown,
  ): Promise<FormulaMeasureV1> {
    const id = parseId(formulaMeasureId, 'formulaMeasureId');
    const dto = parseBody(CreateFormulaMeasureVersionV1Schema, input);
    return this.db.withTenantTransaction(principal.tenantId, async (client) => {
      const formula = await this.lockFormula(client, id);
      const latest = await this.latestVersionState(client, id, formula.current_published_version_id);
      if (latest && latest.state !== 'PUBLISHED' && latest.state !== 'SUPERSEDED' && latest.state !== 'REJECTED') {
        throw new ConflictException(`Version ${latest.versionNumber} must be reviewed before another version is created.`);
      }
      await this.assertModelAndReferences(client, formula.semantic_model_id, formula.measure_name, dto.definition);
      const versionNumber = (latest?.versionNumber ?? 0) + 1;
      const versionId = await this.insertVersion(client, principal, id, versionNumber, dto.definition);
      await this.audit(client, principal, 'FORMULA_MEASURE_VERSION_CREATED', id, { versionId, versionNumber });
      return this.getWithinTransaction(client, id);
    });
  }

  async submit(
    principal: AnalyticsPrincipal,
    formulaMeasureId: string,
    versionId: string,
    input: unknown,
  ): Promise<FormulaMeasureV1> {
    const decision = parseBody(FormulaMeasureDecisionV1Schema, input);
    return this.reviewTransition(principal, formulaMeasureId, versionId, 'SUBMITTED', decision);
  }

  async approve(
    principal: AnalyticsPrincipal,
    formulaMeasureId: string,
    versionId: string,
    input: unknown,
  ): Promise<FormulaMeasureV1> {
    const decision = parseBody(FormulaMeasureDecisionV1Schema, input);
    return this.reviewTransition(principal, formulaMeasureId, versionId, 'APPROVED', decision);
  }

  async reject(
    principal: AnalyticsPrincipal,
    formulaMeasureId: string,
    versionId: string,
    input: unknown,
  ): Promise<FormulaMeasureV1> {
    const decision = parseBody(FormulaMeasureDecisionV1Schema, input);
    return this.reviewTransition(principal, formulaMeasureId, versionId, 'REJECTED', decision);
  }

  async get(principal: AnalyticsPrincipal, formulaMeasureId: string): Promise<FormulaMeasureV1> {
    const id = parseId(formulaMeasureId, 'formulaMeasureId');
    return this.db.withTenantTransaction(principal.tenantId, (client) => this.getWithinTransaction(client, id));
  }

  async listForModel(principal: AnalyticsPrincipal, semanticModelId: string): Promise<FormulaMeasureV1[]> {
    const modelId = parseId(semanticModelId, 'semanticModelId');
    return this.db.withTenantTransaction(principal.tenantId, async (client) => {
      const result = await client.query<{ id: string }>(
        `SELECT id FROM gigalibs_analytics.formula_measures
         WHERE semantic_model_id = $1 ORDER BY measure_name`,
        [modelId],
      );
      const formulas: FormulaMeasureV1[] = [];
      for (const row of result.rows) formulas.push(await this.getWithinTransaction(client, row.id));
      return formulas;
    });
  }

  private async reviewTransition(
    principal: AnalyticsPrincipal,
    rawFormulaId: string,
    rawVersionId: string,
    decision: 'SUBMITTED' | 'APPROVED' | 'REJECTED',
    dto: FormulaMeasureDecisionV1,
  ): Promise<FormulaMeasureV1> {
    const formulaId = parseId(rawFormulaId, 'formulaMeasureId');
    const versionId = parseId(rawVersionId, 'versionId');
    return this.db.withTenantTransaction(principal.tenantId, async (client) => {
      const formula = await this.lockFormula(client, formulaId);
      const version = await this.versionOf(client, formulaId, versionId);
      const latest = await this.latestVersionState(client, formulaId, formula.current_published_version_id);
      if (!latest || latest.id !== versionId) throw new ConflictException('Only the latest formula version may be reviewed.');

      const reviews = await client.query<{ decision: 'SUBMITTED' | 'APPROVED' | 'REJECTED' }>(
        `SELECT decision FROM gigalibs_analytics.formula_measure_reviews
         WHERE formula_measure_version_id = $1`,
        [versionId],
      );
      const decisions = new Set(reviews.rows.map((row) => row.decision));
      if (decision === 'SUBMITTED') {
        if (version.created_by !== principal.subject) {
          throw new ForbiddenException('Only the version creator may submit it for review.');
        }
        if (decisions.size > 0) throw new ConflictException('This formula version has already entered review.');
      } else {
        if (version.created_by === principal.subject) {
          throw new ForbiddenException('A formula version must be reviewed by a second person.');
        }
        if (!decisions.has('SUBMITTED')) throw new ConflictException('The formula version has not been submitted.');
        if (decisions.has('APPROVED') || decisions.has('REJECTED')) {
          throw new ConflictException('The formula version already has a final review decision.');
        }
      }

      await client.query(
        `INSERT INTO gigalibs_analytics.formula_measure_reviews
           (formula_measure_version_id, tenant_id, decision, actor_subject, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [versionId, principal.tenantId, decision, principal.subject, dto.reason],
      );
      if (decision === 'APPROVED') {
        await client.query(
          `UPDATE gigalibs_analytics.formula_measures
           SET current_published_version_id = $2 WHERE id = $1`,
          [formulaId, versionId],
        );
      }
      const event =
        decision === 'SUBMITTED'
          ? 'FORMULA_MEASURE_SUBMITTED'
          : decision === 'APPROVED'
            ? 'FORMULA_MEASURE_PUBLISHED'
            : 'FORMULA_MEASURE_REJECTED';
      await this.audit(client, principal, event, formulaId, {
        versionId,
        versionNumber: Number(version.version_number),
        reason: dto.reason,
      });
      return this.getWithinTransaction(client, formulaId);
    });
  }

  private async assertModelAndReferences(
    client: PoolClient,
    semanticModelId: string,
    formulaName: string,
    definition: FormulaMeasureDefinitionV1,
  ): Promise<void> {
    const model = await client.query<{ id: string }>(
      `SELECT id FROM gigalibs_analytics.semantic_models WHERE id = $1`,
      [semanticModelId],
    );
    if (model.rows.length === 0) throw new NotFoundException(`Semantic model '${semanticModelId}' not found.`);

    const measures = await client.query<{ measure_name: string }>(
      `SELECT measure_name FROM gigalibs_analytics.semantic_measures WHERE model_id = $1`,
      [semanticModelId],
    );
    const baseNames = new Set(measures.rows.map((row) => row.measure_name));
    if (baseNames.has(formulaName)) {
      throw new ConflictException(`Measure name '${formulaName}' already belongs to a base measure.`);
    }
    const references = inspectFormulaExpression(definition.expression).measureNames;
    const unknown = [...references].filter((name) => !baseNames.has(name));
    if (unknown.length > 0) {
      throw new BadRequestException(`Formula references unknown base measure(s): ${unknown.sort().join(', ')}.`);
    }
  }

  private async insertVersion(
    client: PoolClient,
    principal: AnalyticsPrincipal,
    formulaId: string,
    versionNumber: number,
    definition: FormulaMeasureDefinitionV1,
  ): Promise<string> {
    const canonical = JSON.stringify(definition);
    const contentHash = createHash('sha256').update(canonical, 'utf8').digest('hex');
    const result = await client.query<{ id: string }>(
      `INSERT INTO gigalibs_analytics.formula_measure_versions
         (formula_measure_id, tenant_id, version_number, definition, content_hash, created_by)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       RETURNING id`,
      [formulaId, principal.tenantId, versionNumber, canonical, contentHash, principal.subject],
    );
    return result.rows[0]!.id;
  }

  private async lockFormula(client: PoolClient, formulaId: string): Promise<FormulaRow> {
    const result = await client.query<FormulaRow>(
      `SELECT id, semantic_model_id, measure_name, created_by, created_at::text,
              current_published_version_id
       FROM gigalibs_analytics.formula_measures WHERE id = $1 FOR UPDATE`,
      [formulaId],
    );
    if (result.rows.length === 0) throw new NotFoundException(`Formula measure '${formulaId}' not found.`);
    return result.rows[0]!;
  }

  /**
   * Versions are append-only (the runtime role has no UPDATE on them, so `FOR UPDATE` is refused). Review transitions
   * are serialised by the formula row lock taken first in `lockFormula`.
   */
  private async versionOf(client: PoolClient, formulaId: string, versionId: string) {
    const result = await client.query<{ id: string; version_number: number; created_by: string }>(
      `SELECT id, version_number, created_by
       FROM gigalibs_analytics.formula_measure_versions
       WHERE id = $1 AND formula_measure_id = $2`,
      [versionId, formulaId],
    );
    if (result.rows.length === 0) throw new NotFoundException(`Formula version '${versionId}' not found.`);
    return result.rows[0]!;
  }

  private async latestVersionState(client: PoolClient, formulaId: string, publishedId: string | null) {
    const result = await this.versionRows(client, formulaId);
    const row = result[0];
    return row
      ? { id: row.id, versionNumber: Number(row.version_number), state: versionState(row, publishedId) }
      : null;
  }

  private async versionRows(client: PoolClient, formulaId: string): Promise<VersionRow[]> {
    const result = await client.query<VersionRow>(
      `SELECT v.id, v.version_number, v.definition, v.content_hash, v.created_by, v.created_at::text,
              submitted.actor_subject AS submitted_by, submitted.recorded_at::text AS submitted_at,
              terminal.decision AS terminal_decision, terminal.actor_subject AS reviewed_by,
              terminal.reason AS review_reason, terminal.recorded_at::text AS reviewed_at
       FROM gigalibs_analytics.formula_measure_versions v
       LEFT JOIN LATERAL (
         SELECT actor_subject, recorded_at
         FROM gigalibs_analytics.formula_measure_reviews
         WHERE formula_measure_version_id = v.id AND decision = 'SUBMITTED'
         LIMIT 1
       ) submitted ON true
       LEFT JOIN LATERAL (
         SELECT decision, actor_subject, reason, recorded_at
         FROM gigalibs_analytics.formula_measure_reviews
         WHERE formula_measure_version_id = v.id AND decision IN ('APPROVED', 'REJECTED')
         ORDER BY recorded_at DESC LIMIT 1
       ) terminal ON true
       WHERE v.formula_measure_id = $1
       ORDER BY v.version_number DESC`,
      [formulaId],
    );
    return result.rows;
  }

  private async getWithinTransaction(client: PoolClient, formulaId: string): Promise<FormulaMeasureV1> {
    const formulaResult = await client.query<FormulaRow>(
      `SELECT id, semantic_model_id, measure_name, created_by, created_at::text,
              current_published_version_id
       FROM gigalibs_analytics.formula_measures WHERE id = $1`,
      [formulaId],
    );
    if (formulaResult.rows.length === 0) throw new NotFoundException(`Formula measure '${formulaId}' not found.`);
    const formula = formulaResult.rows[0]!;
    const versions = await this.versionRows(client, formulaId);
    return {
      id: formula.id,
      semanticModelId: formula.semantic_model_id,
      name: formula.measure_name,
      createdBy: formula.created_by,
      createdAt: formula.created_at,
      publishedVersionId: formula.current_published_version_id,
      versions: versions.map((row) => ({
        id: row.id,
        versionNumber: Number(row.version_number),
        definition: FormulaMeasureDefinitionV1Schema.parse(row.definition),
        contentHash: row.content_hash,
        state: versionState(row, formula.current_published_version_id),
        createdBy: row.created_by,
        createdAt: row.created_at,
        submittedBy: row.submitted_by,
        reviewedBy: row.reviewed_by,
        reviewReason: row.review_reason,
        reviewedAt: row.reviewed_at,
      })),
    };
  }

  private async audit(
    client: PoolClient,
    principal: AnalyticsPrincipal,
    event: string,
    formulaId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO gigalibs_analytics.analytics_audit_log
         (tenant_id, event_type, actor_subject, entity_id, entity_type, event_payload)
       VALUES ($1, $2::gigalibs_analytics.audit_event_type, $3, $4, 'FORMULA_MEASURE', $5::jsonb)`,
      [principal.tenantId, event, principal.subject, formulaId, JSON.stringify(payload)],
    );
  }
}

function versionState(row: VersionRow, publishedId: string | null): FormulaMeasureVersionStateV1 {
  if (row.terminal_decision === 'REJECTED') return 'REJECTED';
  if (row.terminal_decision === 'APPROVED') return row.id === publishedId ? 'PUBLISHED' : 'SUPERSEDED';
  if (row.submitted_by) return 'PENDING_REVIEW';
  return 'DRAFT';
}

function parseId(value: string, name: string): string {
  const result = IdSchema.safeParse(value);
  if (!result.success) throw new BadRequestException(`${name} must be a UUID.`);
  return result.data;
}

function parseBody<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new BadRequestException(`Invalid formula measure: ${issue?.path.join('.') || 'body'} ${issue?.message ?? ''}`.trim());
  }
  return result.data;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

export type { CreateFormulaMeasureV1, CreateFormulaMeasureVersionV1 };
