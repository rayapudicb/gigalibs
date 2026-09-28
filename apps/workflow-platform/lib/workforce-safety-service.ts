import { prisma } from '@gigalibs/db';
import type {
  CreatePermitToWorkV1,
  ApprovePermitToWorkV1,
  PermitToWorkResponseV1,
  CreateShiftHandoverV1,
  CountersignShiftHandoverV1,
  ShiftHandoverResponseV1,
} from '@gigalibs/contracts';

interface PermitRow {
  id: string;
  permit_number: string;
  permit_type: string;
  work_order_id: string | null;
  site_ref: string | null;
  asset_id: string | null;
  status: string;
  hazards_identified: string[];
  ppe_required: string[];
  isolation_confirmed: boolean;
  gas_testing_required: boolean;
  valid_from: Date;
  valid_until: Date;
  applicant_id: string;
  applicant_name: string;
  supervisor_id: string | null;
  supervisor_name: string | null;
  approved_at: Date | null;
  closed_at: Date | null;
  created_at: Date;
}

interface HandoverRow {
  id: string;
  handover_number: string;
  shift_name: string;
  site_ref: string;
  status: string;
  outgoing_lead_id: string;
  outgoing_lead_name: string;
  outgoing_signed_at: Date;
  oncoming_lead_id: string | null;
  oncoming_lead_name: string | null;
  oncoming_signed_at: Date | null;
  completed_work_orders: string[];
  pending_work_orders: string[];
  offline_equipment: string[];
  active_permits: string[];
  safety_incidents_reported: number;
  notes: string | null;
  created_at: Date;
}

export class WorkforceSafetyService {
  /**
   * Creates a new ePTW (Electronic Permit to Work).
   * If linked to a CMMS Work Order, locks the work order into PENDING_SAFETY_CLEARANCE.
   */
  async createPermitToWork(
    tenantId: string,
    applicantId: string,
    dto: CreatePermitToWorkV1
  ): Promise<PermitToWorkResponseV1> {
    const permitNumber = `PTW-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;

    const rows = await prisma.$queryRaw<PermitRow[]>`
      INSERT INTO gigalibs_workforce.permits_to_work (
        tenant_id,
        permit_number,
        permit_type,
        work_order_id,
        site_ref,
        asset_id,
        status,
        hazards_identified,
        ppe_required,
        isolation_confirmed,
        gas_testing_required,
        gas_test_results,
        valid_from,
        valid_until,
        applicant_id,
        applicant_name,
        applicant_signature,
        checklist_submission_id
      ) VALUES (
        ${tenantId},
        ${permitNumber},
        ${dto.permitType},
        ${dto.workOrderId ? dto.workOrderId : null}::uuid,
        ${dto.siteRef ? dto.siteRef : null}::uuid,
        ${dto.assetId ? dto.assetId : null}::uuid,
        'SUBMITTED',
        ${dto.hazardsIdentified}::text[],
        ${dto.ppeRequired}::text[],
        ${dto.isolationConfirmed},
        ${dto.gasTestingRequired},
        ${dto.gasTestResults ? JSON.stringify(dto.gasTestResults) : null}::jsonb,
        ${new Date(dto.validFrom)},
        ${new Date(dto.validUntil)},
        ${applicantId},
        ${dto.applicantName},
        ${dto.applicantSignature},
        ${dto.checklistSubmissionId || null}
      )
      RETURNING *;
    `;

    const permit = rows[0]!;

    // Pre-task gate: If work order exists, lock it in PENDING_SAFETY_CLEARANCE
    if (dto.workOrderId) {
      await prisma.$executeRaw`
        UPDATE gigalibs_cmms.work_orders
        SET 
          requires_permit = true,
          permit_id = ${permit.id}::uuid,
          status = 'PENDING_SAFETY_CLEARANCE',
          updated_at = now()
        WHERE tenant_id = ${tenantId}::gigalibs_cmms.tenant_ref
          AND id = ${dto.workOrderId}::uuid;
      `;
    }

    return this.mapPermit(permit);
  }

  /**
   * Approves an ePTW permit.
   * Unlocks the linked CMMS Work Order so technicians can safely begin execution.
   */
  async approvePermitToWork(
    tenantId: string,
    permitId: string,
    supervisorId: string,
    dto: ApprovePermitToWorkV1
  ): Promise<PermitToWorkResponseV1> {
    const rows = await prisma.$queryRaw<PermitRow[]>`
      UPDATE gigalibs_workforce.permits_to_work
      SET 
        status = 'APPROVED',
        supervisor_id = ${supervisorId},
        supervisor_name = ${dto.supervisorName},
        supervisor_signature = ${dto.supervisorSignature},
        approved_at = now(),
        updated_at = now()
      WHERE tenant_id = ${tenantId}
        AND id = ${permitId}::uuid
      RETURNING *;
    `;

    if (!rows || rows.length === 0) {
      throw new Error(`Permit "${permitId}" not found in tenant "${tenantId}".`);
    }

    const permit = rows[0]!;

    // Release pre-task gate on linked work order
    if (permit.work_order_id) {
      await prisma.$executeRaw`
        UPDATE gigalibs_cmms.work_orders
        SET 
          status = 'OPEN',
          updated_at = now()
        WHERE tenant_id = ${tenantId}::gigalibs_cmms.tenant_ref
          AND id = ${permit.work_order_id}::uuid
          AND status = 'PENDING_SAFETY_CLEARANCE';
      `;
    }

    return this.mapPermit(permit);
  }

  /**
   * Closes an ePTW permit when work is complete or shift ends.
   */
  async closePermitToWork(
    tenantId: string,
    permitId: string
  ): Promise<PermitToWorkResponseV1> {
    const rows = await prisma.$queryRaw<PermitRow[]>`
      UPDATE gigalibs_workforce.permits_to_work
      SET 
        status = 'CLOSED',
        closed_at = now(),
        updated_at = now()
      WHERE tenant_id = ${tenantId}
        AND id = ${permitId}::uuid
      RETURNING *;
    `;

    if (!rows || rows.length === 0) {
      throw new Error(`Permit "${permitId}" not found.`);
    }

    return this.mapPermit(rows[0]!);
  }

  /**
   * List permits for a tenant with optional filtering.
   */
  async listPermitsToWork(
    tenantId: string,
    filters?: { siteRef?: string; status?: string; workOrderId?: string }
  ): Promise<PermitToWorkResponseV1[]> {
    let rows: PermitRow[];

    if (filters?.workOrderId) {
      rows = await prisma.$queryRaw<PermitRow[]>`
        SELECT * FROM gigalibs_workforce.permits_to_work
        WHERE tenant_id = ${tenantId}
          AND work_order_id = ${filters.workOrderId}::uuid
        ORDER BY created_at DESC;
      `;
    } else if (filters?.siteRef) {
      rows = await prisma.$queryRaw<PermitRow[]>`
        SELECT * FROM gigalibs_workforce.permits_to_work
        WHERE tenant_id = ${tenantId}
          AND site_ref = ${filters.siteRef}::uuid
        ORDER BY created_at DESC;
      `;
    } else {
      rows = await prisma.$queryRaw<PermitRow[]>`
        SELECT * FROM gigalibs_workforce.permits_to_work
        WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC
        LIMIT 50;
      `;
    }

    return rows.map((r) => this.mapPermit(r));
  }

  /**
   * Initiates a two-party structured shift handover.
   */
  async createShiftHandover(
    tenantId: string,
    outgoingLeadId: string,
    dto: CreateShiftHandoverV1
  ): Promise<ShiftHandoverResponseV1> {
    const handoverNumber = `SHO-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;

    const rows = await prisma.$queryRaw<HandoverRow[]>`
      INSERT INTO gigalibs_workforce.shift_handovers (
        tenant_id,
        handover_number,
        shift_name,
        site_ref,
        status,
        outgoing_lead_id,
        outgoing_lead_name,
        outgoing_signature,
        completed_work_orders,
        pending_work_orders,
        offline_equipment,
        active_permits,
        safety_incidents_reported,
        notes
      ) VALUES (
        ${tenantId},
        ${handoverNumber},
        ${dto.shiftName},
        ${dto.siteRef}::uuid,
        'PENDING_COUNTERSIGN',
        ${outgoingLeadId},
        ${dto.outgoingLeadName},
        ${dto.outgoingSignature},
        ${dto.completedWorkOrders}::text[],
        ${dto.pendingWorkOrders}::text[],
        ${dto.offlineEquipment}::text[],
        ${dto.activePermits}::text[],
        ${dto.safetyIncidentsReported},
        ${dto.notes || null}
      )
      RETURNING *;
    `;

    return this.mapHandover(rows[0]!);
  }

  /**
   * Countersigns and finalizes a shift handover by the oncoming shift supervisor.
   */
  async countersignShiftHandover(
    tenantId: string,
    handoverId: string,
    oncomingLeadId: string,
    dto: CountersignShiftHandoverV1
  ): Promise<ShiftHandoverResponseV1> {
    const rows = await prisma.$queryRaw<HandoverRow[]>`
      UPDATE gigalibs_workforce.shift_handovers
      SET 
        status = 'COMPLETED',
        oncoming_lead_id = ${oncomingLeadId},
        oncoming_lead_name = ${dto.oncomingLeadName},
        oncoming_signature = ${dto.oncomingSignature},
        oncoming_signed_at = now(),
        notes = CASE 
                  WHEN ${dto.remarks || null} IS NOT NULL 
                  THEN coalesce(notes, '') || E'\n[Oncoming Remarks]: ' || ${dto.remarks || ''}
                  ELSE notes 
                END,
        updated_at = now()
      WHERE tenant_id = ${tenantId}
        AND id = ${handoverId}::uuid
      RETURNING *;
    `;

    if (!rows || rows.length === 0) {
      throw new Error(`Shift handover "${handoverId}" not found in tenant "${tenantId}".`);
    }

    return this.mapHandover(rows[0]!);
  }

  /**
   * Lists shift handovers for a site.
   */
  async listShiftHandovers(
    tenantId: string,
    siteRef?: string
  ): Promise<ShiftHandoverResponseV1[]> {
    let rows: HandoverRow[];

    if (siteRef) {
      rows = await prisma.$queryRaw<HandoverRow[]>`
        SELECT * FROM gigalibs_workforce.shift_handovers
        WHERE tenant_id = ${tenantId}
          AND site_ref = ${siteRef}::uuid
        ORDER BY created_at DESC;
      `;
    } else {
      rows = await prisma.$queryRaw<HandoverRow[]>`
        SELECT * FROM gigalibs_workforce.shift_handovers
        WHERE tenant_id = ${tenantId}
        ORDER BY created_at DESC
        LIMIT 50;
      `;
    }

    return rows.map((r) => this.mapHandover(r));
  }

  private mapPermit(r: PermitRow): PermitToWorkResponseV1 {
    return {
      id: r.id,
      permitNumber: r.permit_number,
      permitType: r.permit_type as any,
      workOrderId: r.work_order_id,
      siteRef: r.site_ref,
      assetId: r.asset_id,
      status: r.status as any,
      hazardsIdentified: r.hazards_identified || [],
      ppeRequired: r.ppe_required || [],
      isolationConfirmed: r.isolation_confirmed,
      gasTestingRequired: r.gas_testing_required,
      validFrom: r.valid_from.toISOString(),
      validUntil: r.valid_until.toISOString(),
      applicantId: r.applicant_id,
      applicantName: r.applicant_name,
      supervisorId: r.supervisor_id,
      supervisorName: r.supervisor_name,
      approvedAt: r.approved_at?.toISOString() || null,
      closedAt: r.closed_at?.toISOString() || null,
      createdAt: r.created_at.toISOString(),
    };
  }

  private mapHandover(r: HandoverRow): ShiftHandoverResponseV1 {
    return {
      id: r.id,
      handoverNumber: r.handover_number,
      shiftName: r.shift_name,
      siteRef: r.site_ref,
      status: r.status as any,
      outgoingLeadId: r.outgoing_lead_id,
      outgoingLeadName: r.outgoing_lead_name,
      outgoingSignedAt: r.outgoing_signed_at.toISOString(),
      oncomingLeadId: r.oncoming_lead_id,
      oncomingLeadName: r.oncoming_lead_name,
      oncomingSignedAt: r.oncoming_signed_at?.toISOString() || null,
      completedWorkOrders: r.completed_work_orders || [],
      pendingWorkOrders: r.pending_work_orders || [],
      offlineEquipment: r.offline_equipment || [],
      activePermits: r.active_permits || [],
      safetyIncidentsReported: r.safety_incidents_reported,
      notes: r.notes,
      createdAt: r.created_at.toISOString(),
    };
  }
}

export const workforceSafetyService = new WorkforceSafetyService();
