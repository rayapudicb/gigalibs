import { describe, expect, it } from 'vitest';
import {
  CreateWfoInvitationV1Schema,
  BulkInviteSubmitV1Schema,
  RespondWfoInvitationV1Schema,
  GenerateWfoContractV1Schema,
  SignWfoContractV1Schema,
} from '@gigalibs/contracts';

describe('Universal Staffing Flow & Bulk Invitations', () => {
  it('validates single invitation payload', () => {
    const input = {
      positionId: '11111111-1111-4111-a111-111111111111',
      workerId: '22222222-2222-4222-a222-222222222222',
      rateOverride: 48.5,
      message: 'Invitation to lead sound engineering',
    };
    const parsed = CreateWfoInvitationV1Schema.parse(input);
    expect(parsed.rateOverride).toBe(48.5);
  });

  it('validates bulk invite rows from spreadsheet parser', () => {
    const bulkData = {
      rows: [
        {
          email: 'stage1@crew.local',
          firstName: 'Dave',
          lastName: 'Miller',
          positionCode: 'Rigger',
          rateOverride: 50.0,
        },
        {
          email: 'stage2@crew.local',
          firstName: 'Sarah',
          lastName: 'Connor',
          positionCode: 'Electrician',
        },
      ],
    };
    const parsed = BulkInviteSubmitV1Schema.parse(bulkData);
    expect(parsed.rows).toHaveLength(2);
  });

  it('validates worker response accept/decline', () => {
    const accept = RespondWfoInvitationV1Schema.parse({ decision: 'ACCEPT' });
    expect(accept.decision).toBe('ACCEPT');

    const decline = RespondWfoInvitationV1Schema.parse({
      decision: 'DECLINE',
      reason: 'Schedule conflict with another show',
    });
    expect(decline.reason).toBe('Schedule conflict with another show');
  });

  it('validates contract generation and worker e-signature', () => {
    const contract = GenerateWfoContractV1Schema.parse({
      positionId: '11111111-1111-4111-a111-111111111111',
      workerId: '22222222-2222-4222-a222-222222222222',
      title: 'Standard Independent Crew Services Agreement',
      termsText: 'The contractor agrees to perform the designated services...',
    });
    expect(contract.templateCode).toBe('STANDARD_AGREEMENT');

    const signature = SignWfoContractV1Schema.parse({
      signatureHash: 'sha256-abcdef1234567890abcdef1234567890',
      signedByIp: '192.168.1.100',
    });
    expect(signature.signedByIp).toBe('192.168.1.100');
  });
});
