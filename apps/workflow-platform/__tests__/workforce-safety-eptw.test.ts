import { describe, expect, it } from 'vitest';
import {
  CreatePermitToWorkV1Schema,
  CreateShiftHandoverV1Schema,
} from '@gigalibs/contracts';

// WI-OI-120ak (S2): the web app's workforce safety service (`lib/workforce-safety-service.ts`, which nothing imported
// and which queried the database from the web app) was removed with its tests. The contract schemas keep theirs.
describe('Phase 4: Workforce Execution, ePTW Safety Gate & Shift Handover', () => {
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
});
