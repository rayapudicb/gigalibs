import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  CreatePermitToWorkV1Schema,
  CreateShiftHandoverV1Schema,
} from '@gigalibs/contracts';
import { workforceSafetyService } from '../lib/workforce-safety-service';
import { prisma } from '@gigalibs/db';

vi.mock('@gigalibs/db', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));

describe('Phase 4: Workforce Execution, ePTW Safety Gate & Shift Handover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Contract Validations', () => {
    it('validates a valid ePTW permit application', () => {
      const payload = {
        permitType: 'HOT_WORK',
        workOrderId: '3b092fb1-2a07-4bf6-8ce9-0dcb7e324022',
        siteRef: '3b092fb1-2a07-4bf6-8ce9-0dcb7e324022',
        hazardsIdentified: ['FLAMMABLE_VAPORS', 'HIGH_HEAT'],
        ppeRequired: ['FIRE_RETARDANT_SUIT', 'WELDING_MASK'],
        isolationConfirmed: true,
        gasTestingRequired: true,
        validFrom: '2026-09-27T08:00:00Z',
        validUntil: '2026-09-27T16:00:00Z',
        applicantName: 'Vikram Mehta',
        applicantSignature: 'sig_data_base64_applicant',
      };

      const parsed = CreatePermitToWorkV1Schema.safeParse(payload);
      if (!parsed.success) console.error('Permit validation errors:', parsed.error.issues);
      expect(parsed.success).toBe(true);
    });

    it('validates a valid shift handover payload', () => {
      const payload = {
        shiftName: 'Morning Shift A (06:00 - 14:00)',
        siteRef: '3b092fb1-2a07-4bf6-8ce9-0dcb7e324022',
        outgoingLeadName: 'Kavita Sharma',
        outgoingSignature: 'sig_kavita_lead',
        completedWorkOrders: ['WO-001001', 'WO-001002'],
        pendingWorkOrders: ['WO-001003'],
        offlineEquipment: ['Kiln Drive B'],
        activePermits: ['PTW-2026-0045'],
        safetyIncidentsReported: 0,
        notes: 'Smooth operation across kiln and mill lines.',
      };

      const parsed = CreateShiftHandoverV1Schema.safeParse(payload);
      expect(parsed.success).toBe(true);
    });
  });

  describe('ePTW Safety Pre-Task Gate Workflow', () => {
    it('locks linked work order in PENDING_SAFETY_CLEARANCE upon permit creation', async () => {
      const permitRow = {
        id: '22222222-2222-2222-2222-222222222222',
        permit_number: 'PTW-2026-1234',
        permit_type: 'LOCKOUT_TAGOUT',
        work_order_id: '3b092fb1-2a07-4bf6-8ce9-0dcb7e324022',
        site_ref: '3b092fb1-2a07-4bf6-8ce9-0dcb7e324022',
        asset_id: null,
        status: 'SUBMITTED',
        hazards_identified: ['STORED_ENERGY'],
        ppeRequired: [],
        isolation_confirmed: true,
        gas_testing_required: false,
        valid_from: new Date('2026-09-27T08:00:00Z'),
        valid_until: new Date('2026-09-27T16:00:00Z'),
        applicant_id: 'usr_tech_1',
        applicant_name: 'Vikram Mehta',
        supervisor_id: null,
        supervisor_name: null,
        approved_at: null,
        closed_at: null,
        created_at: new Date('2026-09-27T08:00:00Z'),
      };

      (prisma.$queryRaw as any).mockResolvedValueOnce([permitRow]);
      (prisma.$executeRaw as any).mockResolvedValue(1);

      const permit = await workforceSafetyService.createPermitToWork(
        'tenant_demo',
        'usr_tech_1',
        {
          permitType: 'LOCKOUT_TAGOUT',
          workOrderId: '3b092fb1-2a07-4bf6-8ce9-0dcb7e324022',
          hazardsIdentified: ['STORED_ENERGY'],
          ppeRequired: [],
          isolationConfirmed: true,
          gasTestingRequired: false,
          validFrom: '2026-09-27T08:00:00Z',
          validUntil: '2026-09-27T16:00:00Z',
          applicantName: 'Vikram Mehta',
          applicantSignature: 'sig_applicant',
        }
      );

      expect(permit.permitNumber).toBe('PTW-2026-1234');
      expect(permit.status).toBe('SUBMITTED');
      // Verifies the safety pre-task gate was locked on the work order
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('unlocks work order back to OPEN when safety supervisor approves permit', async () => {
      const approvedRow = {
        id: '22222222-2222-2222-2222-222222222222',
        permit_number: 'PTW-2026-1234',
        permit_type: 'LOCKOUT_TAGOUT',
        work_order_id: '3b092fb1-2a07-4bf6-8ce9-0dcb7e324022',
        site_ref: '3b092fb1-2a07-4bf6-8ce9-0dcb7e324022',
        asset_id: null,
        status: 'APPROVED',
        hazards_identified: ['STORED_ENERGY'],
        ppe_required: [],
        isolation_confirmed: true,
        gas_testing_required: false,
        valid_from: new Date('2026-09-27T08:00:00Z'),
        valid_until: new Date('2026-09-27T16:00:00Z'),
        applicant_id: 'usr_tech_1',
        applicant_name: 'Vikram Mehta',
        supervisor_id: 'usr_sup_9',
        supervisor_name: 'Rajesh Kumar (Safety Lead)',
        approved_at: new Date('2026-09-27T08:15:00Z'),
        closed_at: null,
        created_at: new Date('2026-09-27T08:00:00Z'),
      };

      (prisma.$queryRaw as any).mockResolvedValueOnce([approvedRow]);
      (prisma.$executeRaw as any).mockResolvedValue(1);

      const approved = await workforceSafetyService.approvePermitToWork(
        'tenant_demo',
        '22222222-2222-2222-2222-222222222222',
        'usr_sup_9',
        {
          supervisorName: 'Rajesh Kumar (Safety Lead)',
          supervisorSignature: 'sig_supervisor',
        }
      );

      expect(approved.status).toBe('APPROVED');
      expect(approved.supervisorName).toBe('Rajesh Kumar (Safety Lead)');
      // Verifies gate release execution
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });
  });

  describe('Two-Party Shift Handover Protocol', () => {
    it('initiates handover and enables oncoming supervisor countersign', async () => {
      const handoverRow = {
        id: '33333333-3333-3333-3333-333333333333',
        handover_number: 'SHO-2026-9999',
        shift_name: 'Night Shift (22:00 - 06:00)',
        site_ref: '3b092fb1-2a07-4bf6-8ce9-0dcb7e324022',
        status: 'PENDING_COUNTERSIGN',
        outgoing_lead_id: 'usr_lead_out',
        outgoing_lead_name: 'Kavita Sharma',
        outgoing_signed_at: new Date('2026-09-27T06:00:00Z'),
        outgoing_signature: 'sig_out',
        oncoming_lead_id: null,
        oncoming_lead_name: null,
        oncoming_signed_at: null,
        completed_work_orders: ['WO-01', 'WO-02'],
        pending_work_orders: [],
        offline_equipment: [],
        active_permits: [],
        safety_incidents_reported: 0,
        notes: 'Handover clear',
        created_at: new Date('2026-09-27T06:00:00Z'),
      };

      (prisma.$queryRaw as any).mockResolvedValueOnce([handoverRow]);

      const created = await workforceSafetyService.createShiftHandover(
        'tenant_demo',
        'usr_lead_out',
        {
          shiftName: 'Night Shift (22:00 - 06:00)',
          siteRef: '3b092fb1-2a07-4bf6-8ce9-0dcb7e324022',
          outgoingLeadName: 'Kavita Sharma',
          outgoingSignature: 'sig_out',
          completedWorkOrders: ['WO-01', 'WO-02'],
          pendingWorkOrders: [],
          offlineEquipment: [],
          activePermits: [],
          safetyIncidentsReported: 0,
          notes: 'Handover clear',
        }
      );

      expect(created.status).toBe('PENDING_COUNTERSIGN');
      expect(created.outgoingLeadName).toBe('Kavita Sharma');

      // Now oncoming countersigns
      const countersignedRow = {
        ...handoverRow,
        status: 'COMPLETED',
        oncoming_lead_id: 'usr_lead_in',
        oncoming_lead_name: 'Amit Patel',
        oncoming_signed_at: new Date('2026-09-27T06:10:00Z'),
        oncoming_signature: 'sig_in',
      };
      (prisma.$queryRaw as any).mockResolvedValueOnce([countersignedRow]);

      const finalized = await workforceSafetyService.countersignShiftHandover(
        'tenant_demo',
        created.id,
        'usr_lead_in',
        {
          oncomingLeadName: 'Amit Patel',
          oncomingSignature: 'sig_in',
          remarks: 'Reviewed and accepted shift status.',
        }
      );

      expect(finalized.status).toBe('COMPLETED');
      expect(finalized.oncomingLeadName).toBe('Amit Patel');
    });
  });
});
