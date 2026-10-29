import {
  PROJECT_WIP_ACCRUAL_REQUESTED_V1,
  ProjectWipAccrualRequestedPayloadV1Schema,
  RelayEnvelopeV1Schema,
  type RelayEnvelopeV1,
} from '@gigalibs/contracts';
import { receiveOnce, type InboxReceiptOptions } from '@gigalibs/module-sdk';
import { BadRequestException, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { SCHEMA } from '../config.js';
import { DatabaseService } from '../database.service.js';
import { CostingService } from '../costing/costing.service.js';
import { inventoryReceiptPostingDate } from '@gigalibs/posting-rules';
import { resolvePrimaryBookPostingContext } from '../posting/finance-posting-context.js';

const CONSUMER = 'finance.projects.wip_accrual';
const RECEIPTS: InboxReceiptOptions = {
  schema: SCHEMA,
  consumer: CONSUMER,
  sourceModule: 'project-operations',
  storeRawBody: true,
};

@Injectable()
export class ProjectsInboxService {
  constructor(
    private readonly database: DatabaseService,
    private readonly costing: CostingService,
  ) {}

  async receive(rawEnvelope: unknown, rawBody: string): Promise<{ status: string }> {
    const envelope = RelayEnvelopeV1Schema.parse(rawEnvelope);
    if (envelope.eventType !== PROJECT_WIP_ACCRUAL_REQUESTED_V1 || envelope.aggregateType !== 'project_cost_posting') {
      throw new BadRequestException({ code: 'FINANCE_PROJECTS_EVENT_UNSUPPORTED' });
    }
    return this.database.withTenantTransaction(envelope.tenantId, (client) =>
      receiveOnce(client, RECEIPTS, envelope, rawBody, () => this.applyWipAccrual(client, envelope)),
    );
  }

  private async applyWipAccrual(
    client: PoolClient,
    envelope: RelayEnvelopeV1,
  ): Promise<{ status: string; code?: string }> {
    const payload = ProjectWipAccrualRequestedPayloadV1Schema.parse(envelope.payload);
    if (envelope.aggregateId !== payload.postingId) {
      return { status: 'REJECTED', code: 'FINANCE_PROJECTS_AGGREGATE_MISMATCH' };
    }
    const postingDate = inventoryReceiptPostingDate(new Date().toISOString());
    const postingContext = await resolvePrimaryBookPostingContext(client, SCHEMA, envelope.tenantId, postingDate);
    if (typeof postingContext === 'string') {
      return { status: 'REJECTED', code: postingContext };
    }
    const profileRes = await client.query<{
      project_wip_gl_account_id: string | null;
      project_labor_expense_gl_account_id: string | null;
      inventory_gl_account_id: string | null;
    }>(
      `SELECT project_wip_gl_account_id, project_labor_expense_gl_account_id, inventory_gl_account_id
         FROM ${SCHEMA}.cost_profiles
        WHERE tenant_id = $1 AND is_active = true
        ORDER BY is_default DESC, created_at ASC
        LIMIT 1`,
      [envelope.tenantId],
    );
    const profile = profileRes.rows[0];
    if (!profile?.project_wip_gl_account_id) {
      return { status: 'REJECTED', code: 'FINANCE_PROJECTS_WIP_ACCOUNT_MISSING' };
    }
    const material = BigInt(payload.materialMinor);
    const labor = BigInt(payload.laborMinor);
    if (material > 0n && !profile.inventory_gl_account_id) {
      return { status: 'REJECTED', code: 'FINANCE_PROJECTS_INVENTORY_ACCOUNT_MISSING' };
    }
    if (labor > 0n && !profile.project_labor_expense_gl_account_id) {
      return { status: 'REJECTED', code: 'FINANCE_PROJECTS_LABOR_ACCOUNT_MISSING' };
    }

    const bookRes = await client.query<{ currency_code: string }>(
      `SELECT currency_code FROM ${SCHEMA}.accounting_books WHERE tenant_id = $1 AND id = $2`,
      [envelope.tenantId, postingContext.bookId],
    );
    const currencyCode = bookRes.rows[0]?.currency_code ?? payload.currencyCode;

    const lines: Array<{
      accountId: string;
      debitAmountMinor: string;
      creditAmountMinor: string;
      currencyCode: string;
      exchangeRate: string;
      memo: string;
    }> = [
      {
        accountId: profile.project_wip_gl_account_id,
        debitAmountMinor: payload.totalMinor,
        creditAmountMinor: '0',
        currencyCode,
        exchangeRate: '1.000000',
        memo: 'Project WIP accrual',
      },
    ];
    if (material > 0n) {
      lines.push({
        accountId: profile.inventory_gl_account_id!,
        debitAmountMinor: '0',
        creditAmountMinor: payload.materialMinor,
        currencyCode,
        exchangeRate: '1.000000',
        memo: 'Project material to WIP',
      });
    }
    if (labor > 0n) {
      lines.push({
        accountId: profile.project_labor_expense_gl_account_id!,
        debitAmountMinor: '0',
        creditAmountMinor: payload.laborMinor,
        currencyCode,
        exchangeRate: '1.000000',
        memo: 'Project labor to WIP',
      });
    }

    await this.costing.postInventoryTransferJournal(client, envelope.tenantId, 'relay:projects', {
      accountingBookId: postingContext.bookId,
      fiscalPeriodId: postingContext.periodId,
      postingDate: postingContext.postingDate,
      entryType: 'SUBLEDGER_INVENTORY',
      description: `Project WIP accrual ${payload.projectId}`,
      sourceDocumentType: 'PROJECT_WIP_ACCRUAL',
      sourceDocumentId: payload.postingId,
      lines,
    });
    return { status: 'PROCESSED', code: payload.postingId };
  }
}
