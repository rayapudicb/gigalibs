import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  managerName: string;
  managerEmail: string;
  currency: string;
  allocatedBudgetMinor: number;
  committedBudgetMinor: number;
  spentBudgetMinor: number;
  fiscalYear: number;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class BudgetsService {
  constructor(private readonly db: DatabaseService) {}

  async listCostCenters(tenantId: string): Promise<CostCenter[]> {
    const pool = this.db.getPool();
    const result = await pool.query(
      `SELECT
        id, code, name, manager_name, manager_email, currency,
        allocated_budget_minor, committed_budget_minor, spent_budget_minor,
        fiscal_year, status, version, created_at, updated_at
      FROM gigalibs_spend.cost_centers
      WHERE tenant_id = $1
      ORDER BY code ASC`,
      [tenantId],
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      managerName: row.manager_name,
      managerEmail: row.manager_email,
      currency: row.currency,
      allocatedBudgetMinor: Number(row.allocated_budget_minor),
      committedBudgetMinor: Number(row.committed_budget_minor),
      spentBudgetMinor: Number(row.spent_budget_minor),
      fiscalYear: Number(row.fiscal_year),
      status: row.status,
      version: Number(row.version),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async createCostCenter(
    tenantId: string,
    data: {
      code: string;
      name: string;
      managerName: string;
      managerEmail: string;
      currency?: string;
      allocatedBudgetMinor: number;
      fiscalYear?: number;
    },
  ): Promise<CostCenter> {
    const id = randomUUID();
    const currency = (data.currency || 'USD').toUpperCase();
    const fiscalYear = data.fiscalYear || new Date().getFullYear();

    const pool = this.db.getPool();
    const result = await pool.query(
      `INSERT INTO gigalibs_spend.cost_centers (
        tenant_id, id, code, name, manager_name, manager_email, currency,
        allocated_budget_minor, committed_budget_minor, spent_budget_minor, fiscal_year, status, version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, 0, $9, 'ACTIVE', 1)
      RETURNING *`,
      [
        tenantId,
        id,
        data.code.trim().toUpperCase(),
        data.name.trim(),
        data.managerName.trim(),
        data.managerEmail.trim(),
        currency,
        data.allocatedBudgetMinor,
        fiscalYear,
      ],
    );

    const row = result.rows[0];
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      managerName: row.manager_name,
      managerEmail: row.manager_email,
      currency: row.currency,
      allocatedBudgetMinor: Number(row.allocated_budget_minor),
      committedBudgetMinor: Number(row.committed_budget_minor),
      spentBudgetMinor: Number(row.spent_budget_minor),
      fiscalYear: Number(row.fiscal_year),
      status: row.status,
      version: Number(row.version),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async adjustBudget(
    tenantId: string,
    id: string,
    allocatedBudgetMinor: number,
  ): Promise<CostCenter> {
    return this.db.withTenantTransaction(tenantId, async (client) => {
      const lockRes = await client.query(
        `SELECT id, allocated_budget_minor, committed_budget_minor, spent_budget_minor
         FROM gigalibs_spend.cost_centers
         WHERE tenant_id = $1 AND id = $2
         FOR UPDATE`,
        [tenantId, id],
      );

      if (lockRes.rows.length === 0) {
        throw new NotFoundException(`Cost center ${id} not found.`);
      }

      const cc = lockRes.rows[0];
      const obligatedMinor = Number(cc.committed_budget_minor) + Number(cc.spent_budget_minor);
      if (allocatedBudgetMinor < obligatedMinor) {
        throw new Error(
          `Cannot reduce budget to ${allocatedBudgetMinor} minor units; committed + spent total is ${obligatedMinor}.`,
        );
      }

      const result = await client.query(
        `UPDATE gigalibs_spend.cost_centers
         SET allocated_budget_minor = $1, version = version + 1, updated_at = transaction_timestamp()
         WHERE tenant_id = $2 AND id = $3
         RETURNING *`,
        [allocatedBudgetMinor, tenantId, id],
      );

      const row = result.rows[0];
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        managerName: row.manager_name,
        managerEmail: row.manager_email,
        currency: row.currency,
        allocatedBudgetMinor: Number(row.allocated_budget_minor),
        committedBudgetMinor: Number(row.committed_budget_minor),
        spentBudgetMinor: Number(row.spent_budget_minor),
        fiscalYear: Number(row.fiscal_year),
        status: row.status,
        version: Number(row.version),
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      };
    });
  }
}
