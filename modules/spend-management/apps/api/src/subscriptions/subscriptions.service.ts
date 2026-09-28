import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export interface SaasSubscription {
  id: string;
  vendorName: string;
  category: string;
  costCenterId: string;
  costCenterCode?: string;
  costCenterName?: string;
  ownerEmail: string;
  billingFrequency: string;
  seatsAllocated: number;
  seatsUtilized: number;
  costPerSeatMinor: number;
  annualRunRateMinor: number;
  renewalDate: string;
  status: string;
  autoRenew: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class SubscriptionsService {
  constructor(private readonly db: DatabaseService) {}

  async listSubscriptions(tenantId: string): Promise<SaasSubscription[]> {
    const pool = this.db.getPool();
    const result = await pool.query(
      `SELECT
        s.id, s.vendor_name, s.category, s.cost_center_id, cc.code as cost_center_code, cc.name as cost_center_name,
        s.owner_email, s.billing_frequency, s.seats_allocated, s.seats_utilized,
        s.cost_per_seat_minor, s.annual_run_rate_minor,
        to_char(s.renewal_date, 'YYYY-MM-DD') as renewal_date,
        s.status, s.auto_renew, s.version, s.created_at, s.updated_at
      FROM gigalibs_spend.saas_subscriptions s
      LEFT JOIN gigalibs_spend.cost_centers cc ON cc.tenant_id = s.tenant_id AND cc.id = s.cost_center_id
      WHERE s.tenant_id = $1
      ORDER BY s.annual_run_rate_minor DESC`,
      [tenantId],
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      vendorName: row.vendor_name,
      category: row.category,
      costCenterId: row.cost_center_id,
      costCenterCode: row.cost_center_code,
      costCenterName: row.cost_center_name,
      ownerEmail: row.owner_email,
      billingFrequency: row.billing_frequency,
      seatsAllocated: Number(row.seats_allocated),
      seatsUtilized: Number(row.seats_utilized),
      costPerSeatMinor: Number(row.cost_per_seat_minor),
      annualRunRateMinor: Number(row.annual_run_rate_minor),
      renewalDate: row.renewal_date,
      status: row.status,
      autoRenew: Boolean(row.auto_renew),
      version: Number(row.version),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async createSubscription(
    tenantId: string,
    data: {
      vendorName: string;
      category: string;
      costCenterId: string;
      ownerEmail: string;
      billingFrequency?: string;
      seatsAllocated?: number;
      seatsUtilized?: number;
      costPerSeatMinor?: number;
      annualRunRateMinor: number;
      renewalDate: string;
      autoRenew?: boolean;
    },
  ): Promise<SaasSubscription> {
    const id = randomUUID();
    const billingFrequency = data.billingFrequency || 'ANNUAL';
    const seatsAllocated = data.seatsAllocated || 1;
    const seatsUtilized = data.seatsUtilized || 1;
    const costPerSeatMinor = data.costPerSeatMinor || 0;
    const autoRenew = data.autoRenew ?? true;

    const pool = this.db.getPool();
    const result = await pool.query(
      `INSERT INTO gigalibs_spend.saas_subscriptions (
        tenant_id, id, vendor_name, category, cost_center_id, owner_email,
        billing_frequency, seats_allocated, seats_utilized, cost_per_seat_minor,
        annual_run_rate_minor, renewal_date, status, auto_renew, version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'ACTIVE', $13, 1)
      RETURNING *`,
      [
        tenantId,
        id,
        data.vendorName.trim(),
        data.category.trim(),
        data.costCenterId,
        data.ownerEmail.trim(),
        billingFrequency,
        seatsAllocated,
        seatsUtilized,
        costPerSeatMinor,
        data.annualRunRateMinor,
        data.renewalDate,
        autoRenew,
      ],
    );

    const row = result.rows[0];
    return {
      id: row.id,
      vendorName: row.vendor_name,
      category: row.category,
      costCenterId: row.cost_center_id,
      ownerEmail: row.owner_email,
      billingFrequency: row.billing_frequency,
      seatsAllocated: Number(row.seats_allocated),
      seatsUtilized: Number(row.seats_utilized),
      costPerSeatMinor: Number(row.cost_per_seat_minor),
      annualRunRateMinor: Number(row.annual_run_rate_minor),
      renewalDate: data.renewalDate,
      status: row.status,
      autoRenew: Boolean(row.auto_renew),
      version: 1,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async updateSubscriptionStatus(
    tenantId: string,
    id: string,
    status: string,
  ): Promise<SaasSubscription> {
    const pool = this.db.getPool();
    const result = await pool.query(
      `UPDATE gigalibs_spend.saas_subscriptions
       SET status = $1, version = version + 1, updated_at = transaction_timestamp()
       WHERE tenant_id = $2 AND id = $3
       RETURNING *`,
      [status, tenantId, id],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Subscription ${id} not found.`);
    }

    const row = result.rows[0];
    return {
      id: row.id,
      vendorName: row.vendor_name,
      category: row.category,
      costCenterId: row.cost_center_id,
      ownerEmail: row.owner_email,
      billingFrequency: row.billing_frequency,
      seatsAllocated: Number(row.seats_allocated),
      seatsUtilized: Number(row.seats_utilized),
      costPerSeatMinor: Number(row.cost_per_seat_minor),
      annualRunRateMinor: Number(row.annual_run_rate_minor),
      renewalDate: row.renewal_date.toISOString().split('T')[0],
      status: row.status,
      autoRenew: Boolean(row.auto_renew),
      version: Number(row.version),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
