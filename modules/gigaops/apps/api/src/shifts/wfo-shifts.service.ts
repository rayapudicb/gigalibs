import {
  type ClaimWfoShiftV1,
  type CreateWfoShiftSwapV1,
  type RespondWfoShiftSwapV1,
  type WfoOpenShiftV1,
  type WfoShiftSwapRecordV1,
  ClaimWfoShiftV1Schema,
  CreateWfoShiftSwapV1Schema,
  RespondWfoShiftSwapV1Schema,
} from '@gigalibs/contracts';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import type { GigaOpsPrincipal } from '../auth/authorization.js';
import { WorkforceDatabaseService } from '../database/database.service.js';

@Injectable()
export class WfoShiftsService {
  constructor(private readonly database: WorkforceDatabaseService) {}

  async listOpenShifts(
    principal: GigaOpsPrincipal,
    filters: { orgUnitId?: string; skillId?: string } = {},
  ): Promise<WfoOpenShiftV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      // Fetch open positions from engagements
      const res = await client.query(
        `SELECT
           p.id as "positionId",
           p.engagement_id as "engagementId",
           e.title as "engagementTitle",
           p.org_unit_id as "orgUnitId",
           p.title as "positionTitle",
           p.rate_amount as "hourlyRate",
           p.quantity,
           p.filled,
           e.starts_at as "startsAt",
           e.ends_at as "endsAt"
         FROM gigalibs_workforce.wfo_engagement_positions p
         JOIN gigalibs_workforce.wfo_engagements e
           ON e.id = p.engagement_id AND e.tenant_id = p.tenant_id
         WHERE p.tenant_id = $1
           AND p.status = 'OPEN'
           AND p.quantity > p.filled
           AND e.ends_at > now()
         ORDER BY e.starts_at ASC
         LIMIT 50`,
        [principal.tenantId],
      );

      return res.rows.map((row) => ({
        bookingId: row.positionId, // mapped ID for open position slot
        engagementId: row.engagementId,
        engagementTitle: row.engagementTitle,
        orgUnitId: row.orgUnitId || 'GLOBAL',
        positionTitle: row.positionTitle,
        skillRequired: undefined,
        startsAt: new Date(row.startsAt).toISOString(),
        endsAt: new Date(row.endsAt).toISOString(),
        hourlyRate: Number(row.hourlyRate || 25),
        location: 'Field Site Alpha',
        status: 'OPEN',
      }));
    });
  }

  async claimShift(
    principal: GigaOpsPrincipal,
    input: unknown,
  ): Promise<{ status: string; bookingId: string; workerId: string }> {
    const data: ClaimWfoShiftV1 = ClaimWfoShiftV1Schema.parse(input);

    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      // Verify worker is active
      const workerRes = await client.query(
        `SELECT id, lifecycle_status FROM gigalibs_workforce.wfo_workers
         WHERE tenant_id = $1 AND id = $2`,
        [principal.tenantId, data.workerId],
      );
      if (!workerRes.rowCount || workerRes.rowCount === 0) {
        throw new NotFoundException(`Worker ${data.workerId} not found.`);
      }
      if (workerRes.rows[0].lifecycle_status !== 'ACTIVE') {
        throw new BadRequestException('Only ACTIVE workers can claim open shifts.');
      }

      // Check if open position slot exists
      const posRes = await client.query(
        `SELECT id, quantity, filled, engagement_id FROM gigalibs_workforce.wfo_engagement_positions
         WHERE tenant_id = $1 AND id = $2 AND status = 'OPEN'`,
        [principal.tenantId, data.bookingId],
      );

      if (posRes.rowCount && posRes.rowCount > 0) {
        const pos = posRes.rows[0];
        if (pos.filled >= pos.quantity) {
          throw new ConflictException('This shift position has already been fully filled.');
        }

        // Increment filled count
        await client.query(
          `UPDATE gigalibs_workforce.wfo_engagement_positions
           SET filled = filled + 1, updated_at = now()
           WHERE tenant_id = $1 AND id = $2`,
          [principal.tenantId, pos.id],
        );

        return {
          status: 'CLAIMED',
          bookingId: pos.id,
          workerId: data.workerId,
        };
      }

      // If it's a booking row
      const bookingRes = await client.query(
        `SELECT id, starts_at, ends_at FROM gigalibs_workforce.bookings
         WHERE tenant_id = $1 AND id = $2`,
        [principal.tenantId, data.bookingId],
      );
      if (!bookingRes.rowCount || bookingRes.rowCount === 0) {
        throw new NotFoundException(`Shift or booking ${data.bookingId} not found.`);
      }

      const booking = bookingRes.rows[0];

      // Overlap guard
      const overlapRes = await client.query(
        `SELECT id FROM gigalibs_workforce.bookings
         WHERE tenant_id = $1
           AND resource_id = $2
           AND status NOT IN ('CANCELLED')
           AND starts_at < $3
           AND ends_at > $4`,
        [principal.tenantId, data.workerId, booking.ends_at, booking.starts_at],
      );
      if (overlapRes.rowCount && overlapRes.rowCount > 0) {
        throw new ConflictException('Worker already has a conflicting shift during this window.');
      }

      await client.query(
        `UPDATE gigalibs_workforce.bookings
         SET resource_id = $1, status = 'CONFIRMED', updated_at = now(), updated_by = $2
         WHERE tenant_id = $3 AND id = $4`,
        [data.workerId, principal.subject, principal.tenantId, data.bookingId],
      );

      return {
        status: 'CLAIMED',
        bookingId: data.bookingId,
        workerId: data.workerId,
      };
    });
  }

  async createShiftSwap(
    principal: GigaOpsPrincipal,
    input: unknown,
  ): Promise<WfoShiftSwapRecordV1> {
    const data: CreateWfoShiftSwapV1 = CreateWfoShiftSwapV1Schema.parse(input);

    if (data.fromWorkerId === data.toWorkerId) {
      throw new BadRequestException('A worker cannot swap a shift with themselves.');
    }

    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      // Validate booking
      const bookingRes = await client.query(
        `SELECT id, resource_id, starts_at, ends_at FROM gigalibs_workforce.bookings
         WHERE tenant_id = $1 AND id = $2`,
        [principal.tenantId, data.fromBookingId],
      );
      if (!bookingRes.rowCount || bookingRes.rowCount === 0) {
        throw new NotFoundException(`Booking ${data.fromBookingId} not found.`);
      }

      // Validate target worker
      const toWorkerRes = await client.query(
        `SELECT id, lifecycle_status, first_name, last_name FROM gigalibs_workforce.wfo_workers
         WHERE tenant_id = $1 AND id = $2`,
        [principal.tenantId, data.toWorkerId],
      );
      if (!toWorkerRes.rowCount || toWorkerRes.rowCount === 0) {
        throw new NotFoundException(`Target worker ${data.toWorkerId} not found.`);
      }
      if (toWorkerRes.rows[0].lifecycle_status !== 'ACTIVE') {
        throw new BadRequestException('Target worker must be ACTIVE to accept a shift swap.');
      }

      // Check target worker overlap
      const booking = bookingRes.rows[0];
      const overlapRes = await client.query(
        `SELECT id FROM gigalibs_workforce.bookings
         WHERE tenant_id = $1
           AND resource_id = $2
           AND status NOT IN ('CANCELLED')
           AND starts_at < $3
           AND ends_at > $4`,
        [principal.tenantId, data.toWorkerId, booking.ends_at, booking.starts_at],
      );
      if (overlapRes.rowCount && overlapRes.rowCount > 0) {
        throw new ConflictException('Target worker has a scheduling overlap for this shift.');
      }

      // Insert swap request
      const insertRes = await client.query(
        `INSERT INTO gigalibs_workforce.wfo_shift_swap_requests (
           tenant_id, from_booking_id, from_worker_id, to_worker_id, reason, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, tenant_id as "tenantId", from_booking_id as "fromBookingId",
                   from_worker_id as "fromWorkerId", to_worker_id as "toWorkerId",
                   status, reason, created_at as "createdAt", updated_at as "updatedAt"`,
        [principal.tenantId, data.fromBookingId, data.fromWorkerId, data.toWorkerId, data.reason || null, principal.subject],
      );

      return insertRes.rows[0];
    });
  }

  async listShiftSwaps(
    principal: GigaOpsPrincipal,
    status?: string,
  ): Promise<WfoShiftSwapRecordV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      let sql = `
        SELECT
          s.id,
          s.tenant_id as "tenantId",
          s.from_booking_id as "fromBookingId",
          s.from_worker_id as "fromWorkerId",
          w1.first_name || ' ' || w1.last_name as "fromWorkerName",
          s.to_worker_id as "toWorkerId",
          w2.first_name || ' ' || w2.last_name as "toWorkerName",
          b.starts_at::text as "shiftStartsAt",
          b.ends_at::text as "shiftEndsAt",
          s.status,
          s.reason,
          s.rejection_reason as "rejectionReason",
          s.approved_by as "approvedBy",
          s.approved_at as "approvedAt",
          s.created_at as "createdAt",
          s.updated_at as "updatedAt"
        FROM gigalibs_workforce.wfo_shift_swap_requests s
        LEFT JOIN gigalibs_workforce.wfo_workers w1 ON w1.id = s.from_worker_id AND w1.tenant_id = s.tenant_id
        LEFT JOIN gigalibs_workforce.wfo_workers w2 ON w2.id = s.to_worker_id AND w2.tenant_id = s.tenant_id
        LEFT JOIN gigalibs_workforce.bookings b ON b.id = s.from_booking_id AND b.tenant_id = s.tenant_id
        WHERE s.tenant_id = $1
      `;
      const params: unknown[] = [principal.tenantId];

      if (status) {
        params.push(status);
        sql += ` AND s.status = $${params.length}`;
      }

      sql += ` ORDER BY s.created_at DESC`;

      const res = await client.query(sql, params);
      return res.rows;
    });
  }

  async respondShiftSwap(
    principal: GigaOpsPrincipal,
    swapId: string,
    input: unknown,
  ): Promise<WfoShiftSwapRecordV1> {
    const data: RespondWfoShiftSwapV1 = RespondWfoShiftSwapV1Schema.parse(input);

    return this.database.withTenantTransaction(principal.tenantId, async (client: PoolClient) => {
      const swapRes = await client.query(
        `SELECT id, from_booking_id, from_worker_id, to_worker_id, status
         FROM gigalibs_workforce.wfo_shift_swap_requests
         WHERE tenant_id = $1 AND id = $2`,
        [principal.tenantId, swapId],
      );
      if (!swapRes.rowCount || swapRes.rowCount === 0) {
        throw new NotFoundException(`Swap request ${swapId} not found.`);
      }

      const swap = swapRes.rows[0];
      if (swap.status !== 'PENDING') {
        throw new BadRequestException(`Swap request is already ${swap.status}.`);
      }

      // Four-eyes check: approver cannot be requester
      if (principal.subject === String(swap.from_worker_id) || principal.subject === String(swap.to_worker_id)) {
        throw new ForbiddenException('A worker cannot approve their own shift swap request.');
      }

      if (data.decision === 'REJECT') {
        const rejectRes = await client.query(
          `UPDATE gigalibs_workforce.wfo_shift_swap_requests
           SET status = 'REJECTED', rejection_reason = $1, updated_at = now()
           WHERE tenant_id = $2 AND id = $3
           RETURNING id, tenant_id as "tenantId", from_booking_id as "fromBookingId",
                     from_worker_id as "fromWorkerId", to_worker_id as "toWorkerId",
                     status, rejection_reason as "rejectionReason", updated_at as "updatedAt"`,
          [data.reason || 'Rejected by manager', principal.tenantId, swapId],
        );
        return rejectRes.rows[0];
      }

      // For APPROVE: atomically update booking resource_id to to_worker_id
      await client.query(
        `UPDATE gigalibs_workforce.bookings
         SET resource_id = $1, updated_at = now(), updated_by = $2
         WHERE tenant_id = $3 AND id = $4`,
        [swap.to_worker_id, principal.subject, principal.tenantId, swap.from_booking_id],
      );

      const approveRes = await client.query(
        `UPDATE gigalibs_workforce.wfo_shift_swap_requests
         SET status = 'APPROVED', approved_by = $1, approved_at = now(), updated_at = now()
         WHERE tenant_id = $2 AND id = $3
         RETURNING id, tenant_id as "tenantId", from_booking_id as "fromBookingId",
                   from_worker_id as "fromWorkerId", to_worker_id as "toWorkerId",
                   status, approved_by as "approvedBy", approved_at as "approvedAt",
                   updated_at as "updatedAt"`,
        [principal.subject, principal.tenantId, swapId],
      );

      return approveRes.rows[0];
    });
  }
}
