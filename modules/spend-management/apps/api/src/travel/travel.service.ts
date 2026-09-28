import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export interface TravelRequest {
  id: string;
  costCenterId: string;
  costCenterCode?: string;
  costCenterName?: string;
  employeeName: string;
  employeeEmail: string;
  destinationCity: string;
  destinationCountry: string;
  departureDate: string;
  returnDate: string;
  gsaCityTier: string;
  perDiemDailyRateMinor: number;
  lodgingCeilingDailyMinor: number;
  estimatedTotalMinor: number;
  actualSpendMinor: number;
  status: string;
  businessPurpose: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class TravelService {
  constructor(private readonly db: DatabaseService) {}

  calculateGsaRates(city: string, days: number) {
    const normalized = city.toLowerCase();
    let tier = 'TIER_1_STANDARD';
    let perDiemMinor = 5900; // $59 standard
    let lodgingMinor = 10700; // $107 standard

    if (
      normalized.includes('new york') ||
      normalized.includes('san francisco') ||
      normalized.includes('boston') ||
      normalized.includes('london')
    ) {
      tier = 'TIER_3_METROPOLITAN';
      perDiemMinor = 9200; // $92/day
      lodgingMinor = 31500; // $315/day
    } else if (
      normalized.includes('chicago') ||
      normalized.includes('seattle') ||
      normalized.includes('austin') ||
      normalized.includes('los angeles') ||
      normalized.includes('washington')
    ) {
      tier = 'TIER_2_HIGH_COST';
      perDiemMinor = 7900; // $79/day
      lodgingMinor = 25800; // $258/day
    }

    const estimatedTotalMinor = days * (perDiemMinor + lodgingMinor);
    return {
      tier,
      perDiemDailyRateMinor: perDiemMinor,
      lodgingCeilingDailyMinor: lodgingMinor,
      estimatedTotalMinor,
      days,
    };
  }

  async listTravelRequests(tenantId: string): Promise<TravelRequest[]> {
    const pool = this.db.getPool();
    const result = await pool.query(
      `SELECT
        t.id, t.cost_center_id, cc.code as cost_center_code, cc.name as cost_center_name,
        t.employee_name, t.employee_email, t.destination_city, t.destination_country,
        to_char(t.departure_date, 'YYYY-MM-DD') as departure_date,
        to_char(t.return_date, 'YYYY-MM-DD') as return_date,
        t.gsa_city_tier, t.per_diem_daily_rate_minor, t.lodging_ceiling_daily_minor,
        t.estimated_total_minor, t.actual_spend_minor, t.status, t.business_purpose,
        t.version, t.created_at, t.updated_at
      FROM gigalibs_spend.travel_requests t
      LEFT JOIN gigalibs_spend.cost_centers cc ON cc.tenant_id = t.tenant_id AND cc.id = t.cost_center_id
      WHERE t.tenant_id = $1
      ORDER BY t.departure_date ASC`,
      [tenantId],
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      costCenterId: row.cost_center_id,
      costCenterCode: row.cost_center_code,
      costCenterName: row.cost_center_name,
      employeeName: row.employee_name,
      employeeEmail: row.employee_email,
      destinationCity: row.destination_city,
      destinationCountry: row.destination_country,
      departureDate: row.departure_date,
      returnDate: row.return_date,
      gsaCityTier: row.gsa_city_tier,
      perDiemDailyRateMinor: Number(row.per_diem_daily_rate_minor),
      lodgingCeilingDailyMinor: Number(row.lodging_ceiling_daily_minor),
      estimatedTotalMinor: Number(row.estimated_total_minor),
      actualSpendMinor: Number(row.actual_spend_minor),
      status: row.status,
      businessPurpose: row.business_purpose,
      version: Number(row.version),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async createTravelRequest(
    tenantId: string,
    data: {
      costCenterId: string;
      employeeName: string;
      employeeEmail: string;
      destinationCity: string;
      destinationCountry?: string;
      departureDate: string;
      returnDate: string;
      businessPurpose: string;
    },
  ): Promise<TravelRequest> {
    const id = randomUUID();
    const start = new Date(data.departureDate);
    const end = new Date(data.returnDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const days = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);

    const gsa = this.calculateGsaRates(data.destinationCity, days);

    const pool = this.db.getPool();
    const result = await pool.query(
      `INSERT INTO gigalibs_spend.travel_requests (
        tenant_id, id, cost_center_id, employee_name, employee_email, destination_city,
        destination_country, departure_date, return_date, gsa_city_tier,
        per_diem_daily_rate_minor, lodging_ceiling_daily_minor, estimated_total_minor,
        actual_spend_minor, status, business_purpose, version
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 0, 'SUBMITTED', $14, 1)
      RETURNING *`,
      [
        tenantId,
        id,
        data.costCenterId,
        data.employeeName.trim(),
        data.employeeEmail.trim(),
        data.destinationCity.trim(),
        data.destinationCountry || 'US',
        data.departureDate,
        data.returnDate,
        gsa.tier,
        gsa.perDiemDailyRateMinor,
        gsa.lodgingCeilingDailyMinor,
        gsa.estimatedTotalMinor,
        data.businessPurpose.trim(),
      ],
    );

    const row = result.rows[0];
    return {
      id: row.id,
      costCenterId: row.cost_center_id,
      employeeName: row.employee_name,
      employeeEmail: row.employee_email,
      destinationCity: row.destination_city,
      destinationCountry: row.destination_country,
      departureDate: data.departureDate,
      returnDate: data.returnDate,
      gsaCityTier: row.gsa_city_tier,
      perDiemDailyRateMinor: Number(row.per_diem_daily_rate_minor),
      lodgingCeilingDailyMinor: Number(row.lodging_ceiling_daily_minor),
      estimatedTotalMinor: Number(row.estimated_total_minor),
      actualSpendMinor: 0,
      status: row.status,
      businessPurpose: row.business_purpose,
      version: 1,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async approveTravelRequest(tenantId: string, id: string): Promise<TravelRequest> {
    const pool = this.db.getPool();
    const result = await pool.query(
      `UPDATE gigalibs_spend.travel_requests
       SET status = 'APPROVED', version = version + 1, updated_at = transaction_timestamp()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [tenantId, id],
    );

    if (result.rows.length === 0) {
      throw new NotFoundException(`Travel request ${id} not found.`);
    }

    const row = result.rows[0];
    return {
      id: row.id,
      costCenterId: row.cost_center_id,
      employeeName: row.employee_name,
      employeeEmail: row.employee_email,
      destinationCity: row.destination_city,
      destinationCountry: row.destination_country,
      departureDate: row.departure_date.toISOString().split('T')[0],
      returnDate: row.return_date.toISOString().split('T')[0],
      gsaCityTier: row.gsa_city_tier,
      perDiemDailyRateMinor: Number(row.per_diem_daily_rate_minor),
      lodgingCeilingDailyMinor: Number(row.lodging_ceiling_daily_minor),
      estimatedTotalMinor: Number(row.estimated_total_minor),
      actualSpendMinor: Number(row.actual_spend_minor),
      status: row.status,
      businessPurpose: row.business_purpose,
      version: Number(row.version),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
