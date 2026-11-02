import { randomUUID } from 'node:crypto';
import {
  AuthorizeContractorEscortV1Schema,
  CheckoutContractorVisitV1Schema,
  CompleteContractorInductionV1Schema,
  CONTRACTOR_INDUCTION_VALID_DAYS,
  CONTRACTOR_PASS_VALID_DAYS,
  CONTRACTOR_QUIZ_PASS_SCORE,
  CreateContractorCompanyV1Schema,
  CreateContractorWorkerV1Schema,
  EnrollContractorWorkerV1Schema,
  UpdateContractorCompanyV1Schema,
  VerifyContractorPassV1Schema,
  scoreContractorQuiz,
  type ContractorCompanyV1,
  type ContractorPassIssuanceV1,
  type ContractorPassV1,
  type ContractorRosterV1,
  type ContractorVisitV1,
  type ContractorWorkerV1,
  type VerifyContractorPassResultV1,
} from '@gigalibs/contracts';
import { generateContractorPassSecret, hashContractorPassSecret } from '@gigalibs/contracts/frontline/contractor-secrets.js';
import { type ModuleCommandContext, type ModulePrincipal, moduleErrors, recordMutation } from '@gigalibs/module-sdk';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { SCHEMA, TOPIC } from '../config.js';
import { DatabaseService } from '../database.service.js';

export const errors = moduleErrors('SAFETY_OPERATIONS', 'Safety Operations');
const iso = (value: Date | string) => new Date(value).toISOString();
const dateOnly = (value: Date) => value.toISOString().slice(0, 10);
const addDays = (from: Date, days: number) => new Date(from.getTime() + days * 86_400_000);

function conflict(code: string, message: string): never {
  throw new ConflictException({ code: `SAFETY_OPERATIONS_${code}`, message });
}

@Injectable()
export class ContractorsService {
  constructor(private readonly database: DatabaseService) {}

  async createCompany(context: ModuleCommandContext, raw: unknown): Promise<ContractorCompanyV1> {
    const input = errors.parseInput(CreateContractorCompanyV1Schema, raw);
    const { tenantId } = context.principal;
    const id = randomUUID();
    return this.database.withTenantTransaction(tenantId, async (client) => {
      await client.query(
        `INSERT INTO ${SCHEMA}.contractor_companies (id, tenant_id, code, name, coi_expires_on)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, tenantId, input.code.toUpperCase(), input.name, input.coiExpiresOn],
      );
      return this.companyRow(client, tenantId, id);
    });
  }

  async listCompanies(principal: ModulePrincipal): Promise<{ items: ContractorCompanyV1[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const rows = await client.query(`SELECT id FROM ${SCHEMA}.contractor_companies WHERE tenant_id = $1 ORDER BY name`, [principal.tenantId]);
      return { items: await Promise.all(rows.rows.map((row) => this.companyRow(client, principal.tenantId, row.id))) };
    });
  }

  async updateCompany(context: ModuleCommandContext, companyId: string, raw: unknown): Promise<ContractorCompanyV1> {
    const input = errors.parseInput(UpdateContractorCompanyV1Schema, raw);
    const { tenantId } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const current = await this.companyRow(client, tenantId, companyId);
      if (current.version !== input.expectedVersion) conflict('VERSION', 'The company record changed; reload and try again.');
      await client.query(
        `UPDATE ${SCHEMA}.contractor_companies SET
           name = COALESCE($4, name),
           coi_expires_on = COALESCE($5, coi_expires_on),
           status = COALESCE($6, status),
           version = version + 1,
           updated_at = now()
         WHERE tenant_id = $1 AND id = $2 AND version = $3`,
        [tenantId, companyId, input.expectedVersion, input.name ?? null, input.coiExpiresOn ?? null, input.status ?? null],
      );
      return this.companyRow(client, tenantId, companyId);
    });
  }

  async createWorker(context: ModuleCommandContext, companyId: string, raw: unknown): Promise<ContractorWorkerV1> {
    const input = errors.parseInput(CreateContractorWorkerV1Schema, raw);
    const { tenantId } = context.principal;
    const id = randomUUID();
    return this.database.withTenantTransaction(tenantId, async (client) => {
      await this.requireCompany(client, tenantId, companyId);
      await client.query(
        `INSERT INTO ${SCHEMA}.contractor_workers (id, tenant_id, company_id, display_name, platform_user_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, tenantId, companyId, input.displayName, input.platformUserId ?? null],
      );
      return this.workerRow(client, tenantId, id);
    });
  }

  async enroll(context: ModuleCommandContext, raw: unknown): Promise<ContractorWorkerV1> {
    const input = errors.parseInput(EnrollContractorWorkerV1Schema, raw);
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const replay = await client.query<{ id: string }>(
        `SELECT id FROM ${SCHEMA}.contractor_workers WHERE tenant_id = $1 AND enroll_client_operation_id = $2`,
        [tenantId, input.clientOperationId],
      );
      if (replay.rows[0]) return this.workerRow(client, tenantId, replay.rows[0].id);

      const existing = await client.query<{ id: string }>(
        `SELECT id FROM ${SCHEMA}.contractor_workers WHERE tenant_id = $1 AND platform_user_id = $2`,
        [tenantId, subject],
      );
      if (existing.rows[0]) return this.workerRow(client, tenantId, existing.rows[0].id);

      const company = await client.query<{ id: string }>(
        `SELECT id FROM ${SCHEMA}.contractor_companies WHERE tenant_id = $1 AND code = $2 AND status = 'ACTIVE'`,
        [tenantId, input.companyCode.toUpperCase()],
      );
      if (!company.rows[0]) throw new NotFoundException({ code: 'SAFETY_OPERATIONS_COMPANY_NOT_FOUND', message: 'Unknown or inactive contractor company code.' });

      const id = randomUUID();
      await client.query(
        `INSERT INTO ${SCHEMA}.contractor_workers (id, tenant_id, company_id, display_name, platform_user_id, enroll_client_operation_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, tenantId, company.rows[0].id, input.displayName, subject, input.clientOperationId],
      );
      return this.workerRow(client, tenantId, id);
    });
  }

  async workerMine(principal: ModulePrincipal): Promise<{ worker: ContractorWorkerV1 | null }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const row = await client.query<{ id: string }>(
        `SELECT id FROM ${SCHEMA}.contractor_workers WHERE tenant_id = $1 AND platform_user_id = $2`,
        [principal.tenantId, principal.subject],
      );
      if (!row.rows[0]) return { worker: null };
      return { worker: await this.workerRow(client, principal.tenantId, row.rows[0].id) };
    });
  }

  async completeInduction(context: ModuleCommandContext, raw: unknown, now = new Date()): Promise<ContractorPassIssuanceV1> {
    const input = errors.parseInput(CompleteContractorInductionV1Schema, raw);
    const score = scoreContractorQuiz(input.answers);
    if (score < CONTRACTOR_QUIZ_PASS_SCORE) {
      throw new BadRequestException({ code: 'SAFETY_OPERATIONS_QUIZ_FAILED', message: 'Answer all induction questions correctly before receiving a pass.' });
    }
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const worker = await this.requireWorkerForSubject(client, tenantId, input.workerId, subject);
      await this.requireCompanyActive(client, tenantId, worker.companyId);

      const replay = await client.query(
        `SELECT 1 FROM ${SCHEMA}.contractor_inductions WHERE tenant_id = $1 AND worker_id = $2 AND client_operation_id = $3`,
        [tenantId, input.workerId, input.clientOperationId],
      );
      if ((replay.rowCount ?? 0) > 0) {
        const pass = await this.activePass(client, tenantId, input.workerId);
        if (!pass) conflict('PASS_MISSING', 'Induction was recorded but no active pass exists.');
        return { replayed: true, pass: pass.view, passSecret: '0'.repeat(64) };
      }

      const validUntil = addDays(now, CONTRACTOR_INDUCTION_VALID_DAYS);
      await client.query(
        `INSERT INTO ${SCHEMA}.contractor_inductions (worker_id, tenant_id, quiz_key, score, passed, client_operation_id, valid_until)
         VALUES ($1, $2, $3, $4, true, $5, $6)`,
        [input.workerId, tenantId, input.quizKey, score, input.clientOperationId, dateOnly(validUntil)],
      );

      await client.query(
        `UPDATE ${SCHEMA}.contractor_passes SET status = 'REVOKED', revoked_at = now()
         WHERE tenant_id = $1 AND worker_id = $2 AND status = 'ACTIVE'`,
        [tenantId, input.workerId],
      );

      const passSecret = generateContractorPassSecret();
      const passId = randomUUID();
      const expiresAt = addDays(now, CONTRACTOR_PASS_VALID_DAYS);
      await client.query(
        `INSERT INTO ${SCHEMA}.contractor_passes (id, tenant_id, worker_id, secret_hash, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [passId, tenantId, input.workerId, hashContractorPassSecret(passSecret), expiresAt],
      );
      const view = await this.passView(client, tenantId, passId, worker);
      return { replayed: false, pass: view, passSecret };
    });
  }

  async myPass(principal: ModulePrincipal): Promise<{ pass: ContractorPassV1 | null }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const worker = await client.query<{ id: string }>(
        `SELECT id FROM ${SCHEMA}.contractor_workers WHERE tenant_id = $1 AND platform_user_id = $2`,
        [principal.tenantId, principal.subject],
      );
      if (!worker.rows[0]) return { pass: null };
      const active = await this.activePass(client, principal.tenantId, worker.rows[0].id);
      return { pass: active?.view ?? null };
    });
  }

  async verifyPass(context: ModuleCommandContext, raw: unknown, now = new Date()): Promise<VerifyContractorPassResultV1> {
    const input = errors.parseInput(VerifyContractorPassV1Schema, raw);
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const replay = await client.query<{ id: string }>(
        `SELECT id FROM ${SCHEMA}.contractor_visits WHERE tenant_id = $1 AND check_in_operation_id = $2`,
        [tenantId, input.clientOperationId],
      );
      if (replay.rows[0]) {
        const visit = await this.visitRow(client, tenantId, replay.rows[0].id);
        return { replayed: true, allowed: true, reasonCode: null, visit };
      }

      const pass = await client.query<{
        id: string;
        worker_id: string;
        secret_hash: string;
        expires_at: Date;
        status: string;
        revoked_at: Date | null;
      }>(
        `SELECT id, worker_id, secret_hash, expires_at, status, revoked_at FROM ${SCHEMA}.contractor_passes
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, input.passId],
      );
      const row = pass.rows[0];
      if (!row || row.secret_hash !== hashContractorPassSecret(input.passSecret)) {
        return { replayed: false, allowed: false, reasonCode: 'PASS_INVALID', visit: null };
      }
      if (row.status !== 'ACTIVE' || row.revoked_at || row.expires_at.getTime() < now.getTime()) {
        return { replayed: false, allowed: false, reasonCode: 'PASS_EXPIRED', visit: null };
      }

      const worker = await this.workerRow(client, tenantId, row.worker_id);
      const company = await this.requireCompany(client, tenantId, worker.companyId);
      if (company.status !== 'ACTIVE') return { replayed: false, allowed: false, reasonCode: 'COMPANY_SUSPENDED', visit: null };
      if (Date.parse(`${company.coiExpiresOn}T23:59:59.999Z`) < now.getTime()) {
        return { replayed: false, allowed: false, reasonCode: 'COI_EXPIRED', visit: null };
      }

      const induction = await client.query<{ valid_until: string }>(
        `SELECT valid_until FROM ${SCHEMA}.contractor_inductions WHERE worker_id = $1 AND passed = true ORDER BY completed_at DESC LIMIT 1`,
        [row.worker_id],
      );
      if (!induction.rows[0] || Date.parse(`${induction.rows[0].valid_until}T23:59:59.999Z`) < now.getTime()) {
        return { replayed: false, allowed: false, reasonCode: 'INDUCTION_EXPIRED', visit: null };
      }

      const visitId = randomUUID();
      await client.query(
        `INSERT INTO ${SCHEMA}.contractor_visits (id, tenant_id, worker_id, pass_id, site_ref, check_in_operation_id, checked_in_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [visitId, tenantId, row.worker_id, row.id, input.siteRef ?? null, input.clientOperationId, subject],
      );
      const visit = await this.visitRow(client, tenantId, visitId);
      await recordMutation(client, { schema: SCHEMA, topic: TOPIC }, context, {
        action: 'CONTRACTOR_CHECKED_IN',
        aggregateType: 'contractor-visit',
        aggregateId: visitId,
        aggregateVersion: 1,
        payload: { workerId: row.worker_id, passId: row.id },
      });
      return { replayed: false, allowed: true, reasonCode: null, visit };
    });
  }

  async checkout(context: ModuleCommandContext, visitId: string, raw: unknown, now = new Date()): Promise<ContractorVisitV1> {
    const input = errors.parseInput(CheckoutContractorVisitV1Schema, raw);
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const visit = await this.visitRow(client, tenantId, visitId);
      if (visit.checkedOutAt) return visit;
      await client.query(
        `UPDATE ${SCHEMA}.contractor_visits SET checked_out_at = $3, checked_out_by = $4
         WHERE tenant_id = $1 AND id = $2 AND checked_out_at IS NULL`,
        [tenantId, visitId, now, subject],
      );
      return this.visitRow(client, tenantId, visitId);
    });
  }

  async escort(context: ModuleCommandContext, visitId: string, raw: unknown, now = new Date()): Promise<ContractorVisitV1> {
    const input = errors.parseInput(AuthorizeContractorEscortV1Schema, raw);
    const { tenantId, subject } = context.principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      await this.visitRow(client, tenantId, visitId);
      await client.query(
        `INSERT INTO ${SCHEMA}.contractor_escorts (id, tenant_id, visit_id, area, authorized_by, client_operation_id)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (tenant_id, client_operation_id) DO NOTHING`,
        [randomUUID(), tenantId, visitId, input.area, subject, input.clientOperationId],
      );
      return this.visitRow(client, tenantId, visitId);
    });
  }

  async roster(principal: ModulePrincipal, now = new Date()): Promise<ContractorRosterV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const rows = await client.query<{ id: string }>(
        `SELECT id FROM ${SCHEMA}.contractor_visits WHERE tenant_id = $1 AND checked_out_at IS NULL ORDER BY checked_in_at DESC`,
        [principal.tenantId],
      );
      const visits = await Promise.all(rows.rows.map((row) => this.visitRow(client, principal.tenantId, row.id)));
      return { asOf: iso(now), onSiteCount: visits.length, visits };
    });
  }

  private async requireCompany(client: PoolClient, tenantId: string, companyId: string) {
    try {
      return await this.companyRow(client, tenantId, companyId);
    } catch {
      throw new NotFoundException({ code: 'SAFETY_OPERATIONS_COMPANY_NOT_FOUND', message: 'Contractor company not found.' });
    }
  }

  private async requireCompanyActive(client: PoolClient, tenantId: string, companyId: string) {
    const company = await this.requireCompany(client, tenantId, companyId);
    if (company.status !== 'ACTIVE') conflict('COMPANY_SUSPENDED', 'The contractor company is suspended.');
    return company;
  }

  private async requireWorkerForSubject(client: PoolClient, tenantId: string, workerId: string, subject: string) {
    const worker = await this.workerRow(client, tenantId, workerId);
    if (worker.platformUserId !== subject) throw new ForbiddenException({ code: 'SAFETY_OPERATIONS_WORKER_FORBIDDEN', message: 'This worker profile belongs to another user.' });
    return worker;
  }

  private async companyRow(client: PoolClient, tenantId: string, id: string): Promise<ContractorCompanyV1> {
    const row = await client.query<{ code: string; name: string; coi_expires_on: string; status: 'ACTIVE' | 'SUSPENDED'; version: number }>(
      `SELECT code, name, coi_expires_on::text, status, version FROM ${SCHEMA}.contractor_companies WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    if (!row.rows[0]) throw new NotFoundException();
    const value = row.rows[0];
    return { id, code: value.code, name: value.name, coiExpiresOn: value.coi_expires_on.slice(0, 10), status: value.status, version: value.version };
  }

  private async workerRow(client: PoolClient, tenantId: string, id: string): Promise<ContractorWorkerV1> {
    const row = await client.query<{ company_id: string; company_name: string; display_name: string; platform_user_id: string | null; version: number }>(
      `SELECT w.company_id, c.name AS company_name, w.display_name, w.platform_user_id, w.version
       FROM ${SCHEMA}.contractor_workers w
       JOIN ${SCHEMA}.contractor_companies c ON c.id = w.company_id AND c.tenant_id = w.tenant_id
       WHERE w.tenant_id = $1 AND w.id = $2`,
      [tenantId, id],
    );
    if (!row.rows[0]) throw new NotFoundException();
    const value = row.rows[0];
    return {
      id,
      companyId: value.company_id,
      companyName: value.company_name,
      displayName: value.display_name,
      platformUserId: value.platform_user_id,
      version: value.version,
    };
  }

  private async passView(client: PoolClient, tenantId: string, passId: string, worker: ContractorWorkerV1): Promise<ContractorPassV1> {
    const row = await client.query<{ issued_at: Date; expires_at: Date; status: string }>(
      `SELECT issued_at, expires_at, status FROM ${SCHEMA}.contractor_passes WHERE tenant_id = $1 AND id = $2`,
      [tenantId, passId],
    );
    if (!row.rows[0]) throw new NotFoundException();
    return {
      passId,
      workerId: worker.id,
      displayName: worker.displayName,
      companyName: worker.companyName,
      issuedAt: iso(row.rows[0].issued_at),
      expiresAt: iso(row.rows[0].expires_at),
      revoked: row.rows[0].status !== 'ACTIVE',
    };
  }

  private async activePass(client: PoolClient, tenantId: string, workerId: string) {
    const row = await client.query<{ id: string }>(
      `SELECT id FROM ${SCHEMA}.contractor_passes WHERE tenant_id = $1 AND worker_id = $2 AND status = 'ACTIVE' ORDER BY issued_at DESC LIMIT 1`,
      [tenantId, workerId],
    );
    if (!row.rows[0]) return null;
    const worker = await this.workerRow(client, tenantId, workerId);
    return { view: await this.passView(client, tenantId, row.rows[0].id, worker) };
  }

  private async visitRow(client: PoolClient, tenantId: string, visitId: string): Promise<ContractorVisitV1> {
    const row = await client.query<{
      worker_id: string;
      pass_id: string;
      site_ref: string | null;
      checked_in_at: Date;
      checked_in_by: string;
      checked_out_at: Date | null;
      display_name: string;
      company_name: string;
    }>(
      `SELECT v.worker_id, v.pass_id, v.site_ref, v.checked_in_at, v.checked_in_by, v.checked_out_at,
              w.display_name, c.name AS company_name
       FROM ${SCHEMA}.contractor_visits v
       JOIN ${SCHEMA}.contractor_workers w ON w.id = v.worker_id
       JOIN ${SCHEMA}.contractor_companies c ON c.id = w.company_id
       WHERE v.tenant_id = $1 AND v.id = $2`,
      [tenantId, visitId],
    );
    if (!row.rows[0]) throw new NotFoundException();
    const escorts = await client.query<{ area: string; authorized_by: string; authorized_at: Date }>(
      `SELECT area, authorized_by, authorized_at FROM ${SCHEMA}.contractor_escorts WHERE tenant_id = $1 AND visit_id = $2 ORDER BY authorized_at`,
      [tenantId, visitId],
    );
    const value = row.rows[0];
    return {
      id: visitId,
      workerId: value.worker_id,
      workerName: value.display_name,
      companyName: value.company_name,
      passId: value.pass_id,
      siteRef: value.site_ref,
      checkedInAt: iso(value.checked_in_at),
      checkedInBy: value.checked_in_by,
      checkedOutAt: value.checked_out_at ? iso(value.checked_out_at) : null,
      escorts: escorts.rows.map((entry) => ({ area: entry.area, authorizedBy: entry.authorized_by, authorizedAt: iso(entry.authorized_at) })),
    };
  }
}
