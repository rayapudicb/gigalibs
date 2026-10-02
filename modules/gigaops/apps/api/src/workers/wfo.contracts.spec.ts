import { describe, expect, it } from 'vitest';
import {
  CreateWfoWorkerV1Schema,
  CreateWfoEngagementV1Schema,
  CreateWfoEngagementPositionV1Schema,
  CreateWfoComplianceDocV1Schema,
} from '@gigalibs/contracts';

describe('Universal WorkforceOps Contracts & Rules', () => {
  it('validates a correct universal worker creation payload', () => {
    const payload = {
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice.smith@example.com',
      workerType: 'INDIVIDUAL',
      skills: ['Rigging', 'Audio Engineering'],
    };
    const parsed = CreateWfoWorkerV1Schema.parse(payload);
    expect(parsed.firstName).toBe('Alice');
    expect(parsed.skills).toHaveLength(2);
  });

  it('rejects an invalid email for worker creation', () => {
    expect(() =>
      CreateWfoWorkerV1Schema.parse({
        firstName: 'Bob',
        lastName: 'Jones',
        email: 'invalid-email',
      }),
    ).toThrow();
  });

  it('validates a universal engagement across industries', () => {
    const eventPayload = {
      name: 'Seattle Summer Fest 2026',
      engagementType: 'EVENT',
      startsAt: '2026-07-15',
      endsAt: '2026-07-18',
      perDiemAllowed: true,
      perDiemAmount: 65.0,
    };
    const parsedEvent = CreateWfoEngagementV1Schema.parse(eventPayload);
    expect(parsedEvent.engagementType).toBe('EVENT');
    expect(parsedEvent.perDiemAmount).toBe(65.0);

    const workOrderPayload = {
      name: 'Turbine Maintenance Work Order 402',
      engagementType: 'WORK_ORDER',
      sourceType: 'IDEMPIERE_WORK_ORDER',
      startsAt: '2026-08-01',
      endsAt: '2026-08-05',
    };
    const parsedWO = CreateWfoEngagementV1Schema.parse(workOrderPayload);
    expect(parsedWO.sourceType).toBe('IDEMPIERE_WORK_ORDER');
  });

  it('validates position quotas and rates', () => {
    const posPayload = {
      title: 'Senior Stagehand',
      quantity: 10,
      rateType: 'HOURLY',
      rateAmount: 45.0,
    };
    const parsed = CreateWfoEngagementPositionV1Schema.parse(posPayload);
    expect(parsed.quantity).toBe(10);
    expect(parsed.rateAmount).toBe(45.0);
  });

  it('validates compliance document input', () => {
    const docPayload = {
      docType: 'I9',
      fileUrl: 'https://secure.storage.local/compliance/i9-alice.pdf',
      expiresAt: '2028-12-31',
    };
    const parsed = CreateWfoComplianceDocV1Schema.parse(docPayload);
    expect(parsed.docType).toBe('I9');
    expect(parsed.expiresAt).toBe('2028-12-31');
  });
});
