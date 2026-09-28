import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class AnalyticsService {
  constructor(private readonly db: DatabaseService) {}

  async getExecutiveMetrics(tenantId: string) {
    const pool = this.db.getPool();

    // Cost center budget sums
    const ccRes = await pool.query(
      `SELECT
        COUNT(*)::int as cost_centers_count,
        COALESCE(SUM(allocated_budget_minor), 0)::bigint as total_allocated_minor,
        COALESCE(SUM(committed_budget_minor), 0)::bigint as total_committed_minor,
        COALESCE(SUM(spent_budget_minor), 0)::bigint as total_spent_minor
      FROM gigalibs_spend.cost_centers
      WHERE tenant_id = $1 AND status = 'ACTIVE'`,
      [tenantId],
    );

    // Expenses metrics
    const expRes = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'SUBMITTED')::int as pending_approvals_count,
        COALESCE(SUM(amount_minor) FILTER (WHERE status = 'APPROVED'), 0)::bigint as approved_total_minor,
        COALESCE(SUM(amount_minor) FILTER (WHERE status = 'REIMBURSED'), 0)::bigint as reimbursed_total_minor
      FROM gigalibs_spend.expenses
      WHERE tenant_id = $1`,
      [tenantId],
    );

    // Category breakdown
    const catRes = await pool.query(
      `SELECT
        category,
        COUNT(*)::int as count,
        COALESCE(SUM(amount_minor), 0)::bigint as total_amount_minor
      FROM gigalibs_spend.expenses
      WHERE tenant_id = $1
      GROUP BY category
      ORDER BY total_amount_minor DESC`,
      [tenantId],
    );

    // SaaS run rate sum
    const saasRes = await pool.query(
      `SELECT
        COUNT(*)::int as active_subscriptions_count,
        COALESCE(SUM(annual_run_rate_minor), 0)::bigint as total_annual_run_rate_minor
      FROM gigalibs_spend.saas_subscriptions
      WHERE tenant_id = $1 AND status = 'ACTIVE'`,
      [tenantId],
    );

    // Imprest petty cash total
    const imprestRes = await pool.query(
      `SELECT
        COUNT(*)::int as wallets_count,
        COALESCE(SUM(current_balance_minor), 0)::bigint as total_petty_cash_minor
      FROM gigalibs_spend.imprest_wallets
      WHERE tenant_id = $1 AND status = 'ACTIVE'`,
      [tenantId],
    );

    const cc = ccRes.rows[0];
    const exp = expRes.rows[0];
    const saas = saasRes.rows[0];
    const imprest = imprestRes.rows[0];

    return {
      totalAllocatedMinor: Number(cc.total_allocated_minor),
      totalCommittedMinor: Number(cc.total_committed_minor),
      totalSpentMinor: Number(cc.total_spent_minor),
      costCentersCount: Number(cc.cost_centers_count),
      pendingApprovalsCount: Number(exp.pending_approvals_count),
      approvedTotalMinor: Number(exp.approved_total_minor),
      reimbursedTotalMinor: Number(exp.reimbursed_total_minor),
      activeSubscriptionsCount: Number(saas.active_subscriptions_count),
      saasAnnualRunRateMinor: Number(saas.total_annual_run_rate_minor),
      walletsCount: Number(imprest.wallets_count),
      totalPettyCashMinor: Number(imprest.total_petty_cash_minor),
      categoryBreakdown: catRes.rows.map((r: any) => ({
        category: r.category,
        count: Number(r.count),
        totalMinor: Number(r.total_amount_minor),
      })),
    };
  }
}
