import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Pool } from 'pg';
import { GIGAOPS_DB_POOL, PacksService } from '../packs/packs.service.js';
import {
  type DayInput,
  PAY_TYPE_CONFIGS,
  type PayTypeConfig,
  calculateWeekPay,
} from './payroll-engine.js';

export interface CreatePayPeriodDto {
  workUnitId: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string;   // YYYY-MM-DD
  payrollExportCode?: string;
}

@Injectable()
export class PayrollService {
  constructor(
    @Inject(GIGAOPS_DB_POOL) private readonly db: Pool,
    private readonly packsService: PacksService,
  ) {}

  async listPayPeriods(tenantId: string, workUnitId?: string) {
    let query = `
      SELECT pp.*, wu.name as work_unit_name
      FROM gigalibs_gigaops.pay_periods pp
      JOIN gigalibs_gigaops.work_units wu ON pp.work_unit_id = wu.id
      WHERE pp.tenant_id = $1
    `;
    const params: any[] = [tenantId];
    if (workUnitId) {
      query += ` AND pp.work_unit_id = $2`;
      params.push(workUnitId);
    }
    query += ` ORDER BY pp.period_start DESC`;

    const res = await this.db.query(query, params);
    return res.rows;
  }

  async getPayPeriodById(tenantId: string, id: string) {
    const res = await this.db.query(
      `SELECT pp.*, wu.name as work_unit_name
       FROM gigalibs_gigaops.pay_periods pp
       JOIN gigalibs_gigaops.work_units wu ON pp.work_unit_id = wu.id
       WHERE pp.tenant_id = $1 AND pp.id = $2`,
      [tenantId, id],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`Pay period '${id}' not found.`);
    }
    return res.rows[0];
  }

  async createPayPeriod(tenantId: string, dto: CreatePayPeriodDto) {
    const res = await this.db.query(
      `INSERT INTO gigalibs_gigaops.pay_periods (
        tenant_id, work_unit_id, period_start, period_end, payroll_export_code, status
      ) VALUES ($1, $2, $3, $4, $5, 'DRAFT')
      RETURNING *`,
      [
        tenantId,
        dto.workUnitId,
        dto.periodStart,
        dto.periodEnd,
        dto.payrollExportCode ?? 'STANDARD',
      ],
    );
    return res.rows[0];
  }

  async getRecords(tenantId: string, payPeriodId: string) {
    await this.getPayPeriodById(tenantId, payPeriodId);
    const res = await this.db.query(
      `SELECT wpr.*, w.first_name, w.last_name, w.email, w.worker_id_ext, p.title as position_title
       FROM gigalibs_gigaops.worker_pay_records wpr
       JOIN gigalibs_gigaops.workers w ON wpr.worker_id = w.id
       JOIN gigalibs_gigaops.positions p ON wpr.position_id = p.id
       WHERE wpr.tenant_id = $1 AND wpr.pay_period_id = $2
       ORDER BY w.last_name ASC, w.first_name ASC`,
      [tenantId, payPeriodId],
    );
    return res.rows;
  }

  async calculate(tenantId: string, payPeriodId: string) {
    const period = await this.getPayPeriodById(tenantId, payPeriodId);
    if (period.status === 'LOCKED') {
      throw new BadRequestException('Cannot recalculate a locked pay period.');
    }

    // Get active pack configuration for country rules
    const activePack = await this.packsService.getActivePack(tenantId);
    const countryPayroll = activePack.countryPayroll;

    // Fetch approved time entries in period for this work unit
    const entriesRes = await this.db.query(
      `SELECT te.*, p.rate_amount, p.rate_type, p.pay_type_code,
              p.exclude_payroll, p.is_vendor_pay, p.is_holiday_pay,
              w.state_code, w.payroll_ref
       FROM gigalibs_gigaops.time_entries te
       JOIN gigalibs_gigaops.positions p ON te.position_id = p.id
       JOIN gigalibs_gigaops.workers w ON te.worker_id = w.id
       WHERE te.tenant_id = $1 
         AND te.work_unit_id = $2 
         AND te.work_date >= $3 
         AND te.work_date <= $4
         AND te.status = 'APPROVED'
       ORDER BY te.work_date ASC`,
      [tenantId, period.work_unit_id, period.period_start, period.period_end],
    );

    // Group entries by worker_id + position_id
    const grouped = new Map<string, any[]>();
    for (const entry of entriesRes.rows) {
      const key = `${entry.worker_id}:${entry.position_id}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(entry);
    }

    // Clear previous calculations
    await this.db.query(
      `DELETE FROM gigalibs_gigaops.worker_pay_records 
       WHERE tenant_id = $1 AND pay_period_id = $2`,
      [tenantId, payPeriodId],
    );

    let periodRegPay = 0;
    let periodOtPay = 0;
    let periodDtPay = 0;
    let periodWeeklyOtPay = 0;
    let periodHolidayPay = 0;
    let periodFlatPay = 0;
    let periodPerDiem = 0;

    for (const [key, entries] of grouped.entries()) {
      const first = entries[0];
      const workerId = first.worker_id;
      const positionId = first.position_id;
      const payTypeCode = first.pay_type_code;
      const isCalifornia = first.state_code === 'CA' || payTypeCode === '8ST_8OT';

      // Resolve PayTypeConfig
      const baseConfig = PAY_TYPE_CONFIGS[payTypeCode] ?? PAY_TYPE_CONFIGS['10ST'];
      const config: PayTypeConfig = {
        ...baseConfig,
        dailyRegularCap: countryPayroll.dailyRegularCap ?? baseConfig.dailyRegularCap,
        dailyOtCap: countryPayroll.dailyOtCap ?? baseConfig.dailyOtCap,
        weeklyRegularCap: activePack.weeklyOtThreshold ?? baseConfig.weeklyRegularCap,
        otMultiplier: countryPayroll.otMultiplier ?? baseConfig.otMultiplier,
        dtMultiplier: countryPayroll.dtMultiplier ?? baseConfig.dtMultiplier,
        seventhDayRule: countryPayroll.seventhDayRule || baseConfig.seventhDayRule,
        isCalifornia,
      };

      // Format days for pure engine
      const daysInput: DayInput[] = entries.map((e) => {
        const d = new Date(e.work_date);
        return {
          date: d,
          dayOfWeekInPeriod: d.getUTCDay(),
          effectiveMinutes: Number(e.effective_minutes ?? e.net_minutes ?? 0),
          lunchMinutes: Number(e.lunch_minutes ?? 0),
          isHoliday: Boolean(e.is_holiday_pay),
          isGuaranteedDay: Boolean(e.use_guaranteed_hrs),
          useGuaranteedHours: Boolean(e.use_guaranteed_hrs),
          guaranteedMinutes: Number(e.guaranteed_minutes ?? 0),
          rateAmount: Number(first.rate_amount ?? 0),
          excludePayroll: Boolean(first.exclude_payroll),
          isVendorPay: Boolean(first.is_vendor_pay),
          rateType: first.rate_type ?? 'HOURLY',
          flatAmount: Number(first.rate_amount ?? 0),
        };
      });

      // Calculate with Pure Engine
      const calcResult = calculateWeekPay(daysInput, config);

      // Query per diem sum for worker in period
      const perDiemRes = await this.db.query(
        `SELECT COALESCE(SUM(amount), 0) as total_per_diem
         FROM gigalibs_gigaops.per_diem_entries
         WHERE tenant_id = $1 AND worker_id = $2 AND work_unit_id = $3
           AND work_date >= $4 AND work_date <= $5 AND status = 'APPROVE'`,
        [tenantId, workerId, period.work_unit_id, period.period_start, period.period_end],
      );
      const workerPerDiem = Number(perDiemRes.rows[0]?.total_per_diem ?? 0);

      const firstDate = entries[0]?.work_date;
      const lastDate = entries[entries.length - 1]?.work_date;

      // Insert worker_pay_record
      const recordInsert = await this.db.query(
        `INSERT INTO gigalibs_gigaops.worker_pay_records (
          tenant_id, pay_period_id, worker_id, position_id, pay_type_code,
          is_california, rate_amount, rate_type, exclude_payroll, is_vendor_pay,
          is_holiday_pay, regular_hours, daily_ot_hours, daily_dt_hours, weekly_ot_hours,
          guaranteed_hours_used, lunch_hours, regular_pay, daily_ot_pay, daily_dt_pay,
          weekly_ot_pay, holiday_pay, flat_rate_pay, per_diem_amount, total_days_worked,
          first_work_date, last_work_date, payroll_ref
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25, $26, $27, $28
        ) RETURNING id`,
        [
          tenantId,
          payPeriodId,
          workerId,
          positionId,
          payTypeCode,
          isCalifornia,
          first.rate_amount,
          first.rate_type,
          first.exclude_payroll,
          first.is_vendor_pay,
          first.is_holiday_pay,
          calcResult.totalRegularHours,
          calcResult.totalDailyOtHours,
          calcResult.totalDailyDtHours,
          calcResult.totalWeeklyOtHours,
          0,
          0,
          calcResult.totalRegularPay,
          calcResult.totalDailyOtPay,
          calcResult.totalDailyDtPay,
          calcResult.totalWeeklyOtPay,
          calcResult.totalHolidayPay,
          calcResult.totalFlatPay,
          workerPerDiem,
          entries.length,
          firstDate,
          lastDate,
          first.payroll_ref,
        ],
      );

      const workerPayId = recordInsert.rows[0].id;

      // Insert daily breakdowns
      for (let i = 0; i < calcResult.dailyBreakdowns.length; i++) {
        const bd = calcResult.dailyBreakdowns[i];
        const rawEntry = entries[i];
        await this.db.query(
          `INSERT INTO gigalibs_gigaops.daily_pay_breakdowns (
            tenant_id, worker_pay_id, time_entry_id, work_date, weekly_accum_hrs,
            regular_hours, daily_ot_hours, daily_dt_hours, weekly_ot_hrs,
            regular_amount, ot_amount, dt_amount, weekly_ot_amount, daily_total,
            is_seventh_day, is_holiday, is_guaranteed_day
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
          [
            tenantId,
            workerPayId,
            rawEntry.id,
            rawEntry.work_date,
            0,
            bd.regularHours,
            bd.dailyOtHours,
            bd.dailyDtHours,
            bd.weeklyOtHours,
            bd.regularPay,
            bd.dailyOtPay,
            bd.dailyDtPay,
            bd.weeklyOtPay,
            bd.dailyTotal,
            bd.isSeventhDay,
            bd.isHoliday,
            bd.isGuaranteedDay,
          ],
        );
      }

      periodRegPay += calcResult.totalRegularPay;
      periodOtPay += calcResult.totalDailyOtPay;
      periodDtPay += calcResult.totalDailyDtPay;
      periodWeeklyOtPay += calcResult.totalWeeklyOtPay;
      periodHolidayPay += calcResult.totalHolidayPay;
      periodFlatPay += calcResult.totalFlatPay;
      periodPerDiem += workerPerDiem;
    }

    const grandTotal =
      periodRegPay +
      periodOtPay +
      periodDtPay +
      periodWeeklyOtPay +
      periodHolidayPay +
      periodFlatPay +
      periodPerDiem;

    // Update pay period totals and status
    const updatedPeriod = await this.db.query(
      `UPDATE gigalibs_gigaops.pay_periods
       SET status = 'CALCULATED',
           total_regular_pay = $3,
           total_ot_pay = $4,
           total_dt_pay = $5,
           total_weekly_ot_pay = $6,
           total_holiday_pay = $7,
           total_flat_pay = $8,
           total_per_diem = $9,
           grand_total = $10,
           calculated_at = now(),
           updated_at = now()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [
        tenantId,
        payPeriodId,
        periodRegPay,
        periodOtPay,
        periodDtPay,
        periodWeeklyOtPay,
        periodHolidayPay,
        periodFlatPay,
        periodPerDiem,
        grandTotal,
      ],
    );

    return updatedPeriod.rows[0];
  }

  async approve(tenantId: string, payPeriodId: string, approverId: string) {
    const period = await this.getPayPeriodById(tenantId, payPeriodId);
    if (period.status !== 'CALCULATED') {
      throw new BadRequestException('Pay period must be CALCULATED before it can be APPROVED.');
    }

    const res = await this.db.query(
      `UPDATE gigalibs_gigaops.pay_periods
       SET status = 'APPROVED', approved_at = now(), approved_by = $3, updated_at = now()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [tenantId, payPeriodId, approverId],
    );
    return res.rows[0];
  }

  async export(tenantId: string, payPeriodId: string, exporterId: string) {
    const period = await this.getPayPeriodById(tenantId, payPeriodId);
    const records = await this.getRecords(tenantId, payPeriodId);

    // Generate CSV
    const headers = [
      'Worker_ID',
      'Worker_Name',
      'Payroll_Ref',
      'Regular_Hours',
      'Regular_Pay',
      'OT_Hours',
      'OT_Pay',
      'DT_Hours',
      'DT_Pay',
      'Weekly_OT_Hours',
      'Weekly_OT_Pay',
      'Holiday_Pay',
      'Flat_Pay',
      'Per_Diem',
      'Gross_Pay',
    ];

    const rows = records.map((r) => [
      r.worker_id_ext,
      `"${r.last_name}, ${r.first_name}"`,
      r.payroll_ref ?? '',
      r.regular_hours,
      r.regular_pay,
      r.daily_ot_hours,
      r.daily_ot_pay,
      r.daily_dt_hours,
      r.daily_dt_pay,
      r.weekly_ot_hours,
      r.weekly_ot_pay,
      r.holiday_pay,
      r.flat_rate_pay,
      r.per_diem_amount,
      r.gross_pay,
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

    await this.db.query(
      `UPDATE gigalibs_gigaops.pay_periods
       SET status = 'EXPORTED', exported_at = now(), exported_by = $3, updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, payPeriodId, exporterId],
    );

    return {
      payPeriodId,
      format: 'CSV',
      fileName: `gigaops-payroll-${period.id.slice(0, 8)}-${period.period_start}.csv`,
      data: csvContent,
    };
  }
}
