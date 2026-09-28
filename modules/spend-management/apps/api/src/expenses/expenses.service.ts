import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export interface ExpenseLine {
  id: string;
  lineNumber: number;
  description: string;
  glCode: string;
  amountMinor: number;
  taxMinor: number;
}

export interface Expense {
  id: string;
  costCenterId: string;
  costCenterCode?: string;
  costCenterName?: string;
  employeeName: string;
  employeeEmail: string;
  merchant: string;
  category: string;
  paymentMethod: string;
  currency: string;
  amountMinor: number;
  taxMinor: number;
  receiptUrl?: string;
  receiptFilename?: string;
  status: string;
  policyViolationFlag: boolean;
  policyViolationNotes?: string;
  approverName?: string;
  approvedAt?: string;
  reimbursedAt?: string;
  version: number;
  lines: ExpenseLine[];
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class ExpensesService {
  constructor(private readonly db: DatabaseService) {}

  async listExpenses(tenantId: string, status?: string): Promise<Expense[]> {
    const pool = this.db.getPool();
    let query = `
      SELECT
        e.id, e.cost_center_id, cc.code as cost_center_code, cc.name as cost_center_name,
        e.employee_name, e.employee_email, e.merchant, e.category, e.payment_method,
        e.currency, e.amount_minor, e.tax_minor, e.receipt_url, e.receipt_filename,
        e.status, e.policy_violation_flag, e.policy_violation_notes, e.approver_name,
        e.approved_at, e.reimbursed_at, e.version, e.created_at, e.updated_at
      FROM gigalibs_spend.expenses e
      LEFT JOIN gigalibs_spend.cost_centers cc ON cc.tenant_id = e.tenant_id AND cc.id = e.cost_center_id
      WHERE e.tenant_id = $1
    `;
    const params: (string | number)[] = [tenantId];

    if (status) {
      params.push(status);
      query += ` AND e.status = $${params.length}`;
    }

    query += ' ORDER BY e.created_at DESC';

    const result = await pool.query(query, params);

    // Fetch lines for these expenses
    const expenseIds = result.rows.map((r: any) => r.id);
    const linesByExpense = new Map<string, ExpenseLine[]>();

    if (expenseIds.length > 0) {
      const linesResult = await pool.query(
        `SELECT id, expense_id, line_number, description, gl_code, amount_minor, tax_minor
         FROM gigalibs_spend.expense_lines
         WHERE tenant_id = $1 AND expense_id = ANY($2)
         ORDER BY line_number ASC`,
        [tenantId, expenseIds],
      );

      for (const row of (linesResult.rows as any[])) {
        const line: ExpenseLine = {
          id: row.id,
          lineNumber: Number(row.line_number),
          description: row.description,
          glCode: row.gl_code,
          amountMinor: Number(row.amount_minor),
          taxMinor: Number(row.tax_minor),
        };
        const list = linesByExpense.get(row.expense_id) ?? [];
        list.push(line);
        linesByExpense.set(row.expense_id, list);
      }
    }

    return result.rows.map((row: any) => ({
      id: row.id,
      costCenterId: row.cost_center_id,
      costCenterCode: row.cost_center_code,
      costCenterName: row.cost_center_name,
      employeeName: row.employee_name,
      employeeEmail: row.employee_email,
      merchant: row.merchant,
      category: row.category,
      paymentMethod: row.payment_method,
      currency: row.currency,
      amountMinor: Number(row.amount_minor),
      taxMinor: Number(row.tax_minor),
      receiptUrl: row.receipt_url ?? undefined,
      receiptFilename: row.receipt_filename ?? undefined,
      status: row.status,
      policyViolationFlag: Boolean(row.policy_violation_flag),
      policyViolationNotes: row.policy_violation_notes ?? undefined,
      approverName: row.approver_name ?? undefined,
      approvedAt: row.approved_at ? row.approved_at.toISOString() : undefined,
      reimbursedAt: row.reimbursed_at ? row.reimbursed_at.toISOString() : undefined,
      version: Number(row.version),
      lines: linesByExpense.get(row.id) ?? [],
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async createExpense(
    tenantId: string,
    data: {
      costCenterId: string;
      employeeName: string;
      employeeEmail: string;
      merchant: string;
      category: string;
      paymentMethod?: string;
      currency?: string;
      amountMinor: number;
      taxMinor?: number;
      receiptFilename?: string;
      receiptUrl?: string;
      policyViolationFlag?: boolean;
      policyViolationNotes?: string;
      lines?: { description: string; glCode: string; amountMinor: number; taxMinor?: number }[];
    },
  ): Promise<Expense> {
    const expenseId = randomUUID();
    const currency = (data.currency || 'USD').toUpperCase();
    const paymentMethod = data.paymentMethod || 'CORPORATE_CARD';
    const taxMinor = data.taxMinor || 0;

    return this.db.withTenantTransaction(tenantId, async (client) => {
      // Check cost center exists and lock it to verify remaining budget envelope
      const ccCheck = await client.query(
        `SELECT id, allocated_budget_minor, committed_budget_minor, spent_budget_minor
         FROM gigalibs_spend.cost_centers
         WHERE tenant_id = $1 AND id = $2
         FOR UPDATE`,
        [tenantId, data.costCenterId],
      );
      if (ccCheck.rows.length === 0) {
        throw new NotFoundException(`Cost center ${data.costCenterId} does not exist.`);
      }

      const costCenter = ccCheck.rows[0];
      const currentAvailable =
        Number(costCenter.allocated_budget_minor) -
        (Number(costCenter.committed_budget_minor) + Number(costCenter.spent_budget_minor));

      if (data.amountMinor > currentAvailable) {
        throw new BadRequestException(
          `Expense exceeds cost center remaining available budget (${currentAvailable} minor units available, ${data.amountMinor} requested).`,
        );
      }

      // SP-02: Receipt policy enforcement - expenses >= $75.00 (7500 minor) require receipt attachment
      let policyViolationFlag = Boolean(data.policyViolationFlag);
      let policyViolationNotes = data.policyViolationNotes || null;
      if (data.amountMinor >= 7500 && !data.receiptUrl && !data.receiptFilename) {
        policyViolationFlag = true;
        policyViolationNotes = policyViolationNotes
          ? `${policyViolationNotes}; Receipt missing for expense >= $75.00`
          : 'Receipt missing for expense >= $75.00';
      }

      // Reserve committed budget
      await client.query(
        `UPDATE gigalibs_spend.cost_centers
         SET committed_budget_minor = committed_budget_minor + $1,
             version = version + 1,
             updated_at = transaction_timestamp()
         WHERE tenant_id = $2 AND id = $3`,
        [data.amountMinor, tenantId, data.costCenterId],
      );

      // Insert expense
      const expenseInsert = await client.query(
        `INSERT INTO gigalibs_spend.expenses (
          tenant_id, id, cost_center_id, employee_name, employee_email, merchant, category,
          payment_method, currency, amount_minor, tax_minor, receipt_url, receipt_filename,
          status, policy_violation_flag, policy_violation_notes, version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'SUBMITTED', $14, $15, 1)
        RETURNING *`,
        [
          tenantId,
          expenseId,
          data.costCenterId,
          data.employeeName.trim(),
          data.employeeEmail.trim(),
          data.merchant.trim(),
          data.category.trim(),
          paymentMethod,
          currency,
          data.amountMinor,
          taxMinor,
          data.receiptUrl || null,
          data.receiptFilename || null,
          policyViolationFlag,
          policyViolationNotes,
        ],
      );

      const insertedLines: ExpenseLine[] = [];
      const linesData =
        data.lines && data.lines.length > 0
          ? data.lines
          : [
              {
                description: `${data.merchant} - ${data.category}`,
                glCode: 'GL-6900-OPERATING',
                amountMinor: data.amountMinor,
                taxMinor,
              },
            ];

      // Verify line totals match expense amount exactly
      const linesSum = linesData.reduce((sum, line) => sum + line.amountMinor, 0);
      if (linesSum !== data.amountMinor) {
        throw new BadRequestException(
          `Line items total (${linesSum}) does not equal expense total (${data.amountMinor}).`,
        );
      }

      for (let i = 0; i < linesData.length; i++) {
        const lineItem = linesData[i]!;
        const lineId = randomUUID();
        const lineRes = await client.query(
          `INSERT INTO gigalibs_spend.expense_lines (
            tenant_id, id, expense_id, line_number, description, gl_code, amount_minor, tax_minor
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *`,
          [
            tenantId,
            lineId,
            expenseId,
            i + 1,
            lineItem.description,
            lineItem.glCode,
            lineItem.amountMinor,
            lineItem.taxMinor || 0,
          ],
        );
        insertedLines.push({
          id: lineRes.rows[0].id,
          lineNumber: Number(lineRes.rows[0].line_number),
          description: lineRes.rows[0].description,
          glCode: lineRes.rows[0].gl_code,
          amountMinor: Number(lineRes.rows[0].amount_minor),
          taxMinor: Number(lineRes.rows[0].tax_minor),
        });
      }

      // Record audit
      await client.query(
        `INSERT INTO gigalibs_spend.audit_events (
          tenant_id, id, entity_type, entity_id, action, actor_id, actor_role, details
        ) VALUES ($1, $2, 'EXPENSE', $3, 'SUBMIT', $4, 'EMPLOYEE', $5)`,
        [
          tenantId,
          randomUUID(),
          expenseId,
          data.employeeEmail,
          JSON.stringify({
            amountMinor: data.amountMinor,
            merchant: data.merchant,
            policyViolationFlag,
          }),
        ],
      );

      const row = expenseInsert.rows[0];
      return {
        id: row.id,
        costCenterId: row.cost_center_id,
        employeeName: row.employee_name,
        employeeEmail: row.employee_email,
        merchant: row.merchant,
        category: row.category,
        paymentMethod: row.payment_method,
        currency: row.currency,
        amountMinor: Number(row.amount_minor),
        taxMinor: Number(row.tax_minor),
        receiptUrl: row.receipt_url ?? undefined,
        receiptFilename: row.receipt_filename ?? undefined,
        status: row.status,
        policyViolationFlag: Boolean(row.policy_violation_flag),
        policyViolationNotes: row.policy_violation_notes ?? undefined,
        version: Number(row.version),
        lines: insertedLines,
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      };
    });
  }

  async approveExpense(
    tenantId: string,
    id: string,
    approverName: string,
    expectedVersion?: number,
  ): Promise<Expense> {
    return this.db.withTenantTransaction(tenantId, async (client) => {
      const expRes = await client.query(
        `SELECT * FROM gigalibs_spend.expenses WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, id],
      );
      if (expRes.rows.length === 0) {
        throw new NotFoundException(`Expense ${id} not found.`);
      }

      const current = expRes.rows[0];
      if (current.status !== 'SUBMITTED') {
        throw new BadRequestException(`Cannot approve expense in status ${current.status}`);
      }

      if (expectedVersion !== undefined && Number(current.version) !== expectedVersion) {
        throw new BadRequestException(`Concurrency conflict: expected version ${expectedVersion}, got ${current.version}`);
      }

      // Update expense
      const updateRes = await client.query(
        `UPDATE gigalibs_spend.expenses
         SET status = 'APPROVED', approver_name = $1, approved_at = transaction_timestamp(),
             version = version + 1, updated_at = transaction_timestamp()
         WHERE tenant_id = $2 AND id = $3
         RETURNING *`,
        [approverName, tenantId, id],
      );

      // Transition cost center budget: release committed, increment spent
      await client.query(
        `UPDATE gigalibs_spend.cost_centers
         SET committed_budget_minor = GREATEST(committed_budget_minor - $1, 0),
             spent_budget_minor = spent_budget_minor + $1,
             version = version + 1, updated_at = transaction_timestamp()
         WHERE tenant_id = $2 AND id = $3`,
        [current.amount_minor, tenantId, current.cost_center_id],
      );

      // Write outbox event
      await client.query(
        `INSERT INTO gigalibs_spend.outbox_events (
          tenant_id, id, event_type, payload
        ) VALUES ($1, $2, 'spend.expense.approved.v1', $3)`,
        [
          tenantId,
          randomUUID(),
          JSON.stringify({ expenseId: id, amountMinor: current.amount_minor, approver: approverName }),
        ],
      );

      const row = updateRes.rows[0];
      return {
        id: row.id,
        costCenterId: row.cost_center_id,
        employeeName: row.employee_name,
        employeeEmail: row.employee_email,
        merchant: row.merchant,
        category: row.category,
        paymentMethod: row.payment_method,
        currency: row.currency,
        amountMinor: Number(row.amount_minor),
        taxMinor: Number(row.tax_minor),
        receiptUrl: row.receipt_url ?? undefined,
        receiptFilename: row.receipt_filename ?? undefined,
        status: row.status,
        policyViolationFlag: Boolean(row.policy_violation_flag),
        approverName: row.approver_name ?? undefined,
        approvedAt: row.approved_at ? row.approved_at.toISOString() : undefined,
        version: Number(row.version),
        lines: [],
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      };
    });
  }

  async reimburseExpense(tenantId: string, id: string): Promise<Expense> {
    return this.db.withTenantTransaction(tenantId, async (client) => {
      const expRes = await client.query(
        `SELECT * FROM gigalibs_spend.expenses WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, id],
      );

      if (expRes.rows.length === 0) {
        throw new NotFoundException(`Expense ${id} not found.`);
      }

      const current = expRes.rows[0];
      if (current.status !== 'APPROVED') {
        throw new BadRequestException(`Cannot reimburse expense in status ${current.status}; must be APPROVED.`);
      }

      // SP-03: Generate durable payment action receipt for Action Gateway settlement
      const idempotencyKey = `reimburse_${id}_${Date.now()}`;
      const actionReceipt = {
        actionId: randomUUID(),
        actionType: 'DISBURSE_REIMBURSEMENT',
        idempotencyKey,
        targetEmployee: current.employee_email,
        amountMinor: Number(current.amount_minor),
        currency: current.currency,
        paymentMethod: current.payment_method,
        status: 'SETTLED',
        settledAt: new Date().toISOString(),
      };

      const result = await client.query(
        `UPDATE gigalibs_spend.expenses
         SET status = 'REIMBURSED',
             reimbursed_at = transaction_timestamp(),
             action_receipt = $1,
             version = version + 1,
             updated_at = transaction_timestamp()
         WHERE tenant_id = $2 AND id = $3 AND status = 'APPROVED'
         RETURNING *`,
        [JSON.stringify(actionReceipt), tenantId, id],
      );

      // Write outbox event for Action Gateway / Accounting sync
      await client.query(
        `INSERT INTO gigalibs_spend.outbox_events (
          tenant_id, id, event_type, payload
        ) VALUES ($1, $2, 'spend.expense.reimbursed.v1', $3)`,
        [
          tenantId,
          randomUUID(),
          JSON.stringify({
            expenseId: id,
            amountMinor: Number(current.amount_minor),
            recipient: current.employee_email,
            actionReceipt,
          }),
        ],
      );

      // Record audit event
      await client.query(
        `INSERT INTO gigalibs_spend.audit_events (
          tenant_id, id, entity_type, entity_id, action, actor_id, actor_role, details
        ) VALUES ($1, $2, 'EXPENSE', $3, 'REIMBURSE', 'SYSTEM_DISBURSER', 'PAYROLL_SYSTEM', $4)`,
        [
          tenantId,
          randomUUID(),
          id,
          JSON.stringify({ actionReceipt }),
        ],
      );

      const row = result.rows[0];
      return {
        id: row.id,
        costCenterId: row.cost_center_id,
        employeeName: row.employee_name,
        employeeEmail: row.employee_email,
        merchant: row.merchant,
        category: row.category,
        paymentMethod: row.payment_method,
        currency: row.currency,
        amountMinor: Number(row.amount_minor),
        taxMinor: Number(row.tax_minor),
        status: row.status,
        policyViolationFlag: Boolean(row.policy_violation_flag),
        reimbursedAt: row.reimbursed_at.toISOString(),
        version: Number(row.version),
        lines: [],
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      };
    });
  }
}
