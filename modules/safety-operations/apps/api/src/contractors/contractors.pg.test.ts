import { randomUUID } from 'node:crypto';
import { CONTRACTOR_QUIZ_CORRECT, CONTRACTOR_QUIZ_KEY } from '@gigalibs/contracts';
import type { ModuleCommandContext, ModulePrincipal } from '@gigalibs/module-sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SCHEMA_CONTRACT_VERSION } from '../config.js';
import { DatabaseService } from '../database.service.js';
import { ContractorsService } from './contractors.service.js';

const url = process.env['SAFETY_OPERATIONS_PG_URL'];
const TENANT = `contr-${randomUUID().slice(0, 8)}`;
const principal = (subject: string, permissions: string[]): ModulePrincipal => ({
  tenantId: TENANT, subject, sessionId: 'session', authVersion: 1, permissions, roles: [], persona: 'WORKFORCE_MEMBER',
  departmentScope: { mode: 'ALL' }, placeScope: { mode: 'ALL' },
} as ModulePrincipal);
const context = (who: ModulePrincipal): ModuleCommandContext => ({ principal: who, correlationId: randomUUID() } as ModuleCommandContext);
const admin = principal('admin-1', ['safety-operations.contractors.admin', 'safety-operations.contractors.roster']);
const workerUser = principal('contractor-1', ['safety-operations.contractors.worker']);
const gate = principal('guard-1', ['safety-operations.contractors.gate', 'safety-operations.contractors.roster']);
const escort = principal('host-1', ['safety-operations.contractors.escort']);
const coiFuture = () => new Date(Date.now() + 180 * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(!url)('contractor pass on PostgreSQL (WI-OI-143)', () => {
  let database: DatabaseService;
  let contractors: ContractorsService;

  beforeAll(async () => {
    database = new DatabaseService({
      databaseUrl: url!, databasePoolSize: 2, expectedMigrationVersion: SCHEMA_CONTRACT_VERSION,
    } as never);
    await database.onModuleInit();
    contractors = new ContractorsService(database);
  });
  afterAll(async () => database?.onModuleDestroy());

  it('issues a pass after induction and verifies at the gate once per operation', async () => {
    const company = await contractors.createCompany(context(admin), { code: 'APEX-1', name: 'Apex Electrical', coiExpiresOn: coiFuture() });
    const enrolled = await contractors.enroll(context(workerUser), {
      clientOperationId: randomUUID(), companyCode: 'APEX-1', displayName: 'John Doe',
    });
    expect(enrolled.companyName).toBe('Apex Electrical');
    const issuance = await contractors.completeInduction(context(workerUser), {
      clientOperationId: randomUUID(),
      workerId: enrolled.id,
      quizKey: CONTRACTOR_QUIZ_KEY,
      answers: CONTRACTOR_QUIZ_CORRECT,
    });
    expect(issuance.replayed).toBe(false);
    expect(issuance.passSecret).toMatch(/^[a-f0-9]{64}$/);
    const verifyBody = {
      clientOperationId: randomUUID(),
      passId: issuance.pass.passId,
      passSecret: issuance.passSecret,
    };
    const checkIn = await contractors.verifyPass(context(gate), verifyBody);
    expect(checkIn).toMatchObject({ allowed: true, replayed: false, visit: expect.objectContaining({ workerName: 'John Doe' }) });
    expect(await contractors.verifyPass(context(gate), verifyBody)).toMatchObject({ allowed: true, replayed: true });
    const roster = await contractors.roster(gate);
    expect(roster.onSiteCount).toBe(1);
    await contractors.escort(context(escort), checkIn.visit!.id, { clientOperationId: randomUUID(), area: 'Line 3 skid' });
    const checkedOut = await contractors.checkout(context(gate), checkIn.visit!.id, { clientOperationId: randomUUID() });
    expect(checkedOut.checkedOutAt).toBeTruthy();
    expect((await contractors.roster(gate)).onSiteCount).toBe(0);
  });

  it('rejects a bad pass secret without creating a visit', async () => {
    const company = await contractors.createCompany(context(admin), { code: 'BETA-2', name: 'Beta Crew', coiExpiresOn: coiFuture() });
    const enrolled = await contractors.enroll(context(principal('contractor-2', ['safety-operations.contractors.worker'])), {
      clientOperationId: randomUUID(), companyCode: 'BETA-2', displayName: 'Sam',
    });
    const issued = await contractors.completeInduction(context(principal('contractor-2', ['safety-operations.contractors.worker'])), {
      clientOperationId: randomUUID(), workerId: enrolled.id, quizKey: CONTRACTOR_QUIZ_KEY, answers: CONTRACTOR_QUIZ_CORRECT,
    });
    const denied = await contractors.verifyPass(context(gate), {
      clientOperationId: randomUUID(), passId: issued.pass.passId, passSecret: 'b'.repeat(64),
    });
    expect(denied).toMatchObject({ allowed: false, reasonCode: 'PASS_INVALID', visit: null });
    expect((await contractors.roster(gate)).visits.some((visit) => visit.passId === issued.pass.passId)).toBe(false);
    expect(issued.passSecret).toMatch(/^[a-f0-9]{64}$/);
  });
});
