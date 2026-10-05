import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE as deleteRule, PATCH as patchRule } from '../app/api/rules/kernel/rules/[ruleId]/route';
import { POST as createRule } from '../app/api/rules/kernel/rules/route';
import { RuleNotFoundError, universalRuleKernelStore } from '../lib/universal-rule-kernel-store';
import { verifiedSession } from '../lib/verified-session';

// WI-OI-120e (U3.2, P0-04): Rule Studio changes act only on the signed-in tenant's own rules.
vi.mock('../lib/verified-session', () => ({ verifiedSession: vi.fn() }));

const origin = 'https://platform.example.invalid';
const writer = ['rules:read', 'rules:write'];

function signedIn(tenantId: string, permissions = writer) {
  vi.mocked(verifiedSession).mockResolvedValue({
    context: { tenant: { id: tenantId, features: ['rule-studio'] }, permissions },
  } as never);
}

function call(method: string, path: string, body?: unknown) {
  return new Request(`${origin}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', origin, host: 'platform.example.invalid' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const params = (ruleId: string) => ({ params: Promise.resolve({ ruleId }) });

function tenantRule(tenantId: string) {
  return universalRuleKernelStore.createRule({
    tenantId,
    ruleCode: `RULE-${tenantId}`,
    name: `Rule of ${tenantId}`,
    description: '',
    triggerEvent: 'CUSTOM_TRIGGER',
    scope: 'TENANT_DEFAULT',
    lifecycleStatus: 'ACTIVE',
    priority: 100,
    systemLocked: false,
    conditions: [{ id: 'c1', fieldPath: 'amount', operator: 'GREATER_THAN', value: 100 }],
    action: { actionType: 'BLOCK_DROP' },
  });
}

describe('Rule Studio tenant boundary', () => {
  const created: Array<{ id: string; tenantId: string }> = [];

  beforeEach(() => {
    vi.stubEnv('BFF_MAX_REQUEST_BYTES', '65536');
    vi.stubEnv('GIGALIBS_UAT_PREVIEW', 'disabled');
  });

  afterEach(() => {
    for (const rule of created.splice(0)) {
      try {
        universalRuleKernelStore.deleteRule(rule.id, rule.tenantId);
      } catch {
        // already removed by the test
      }
    }
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('answers 404 when tenant B updates, hijacks or deletes tenant A’s rule, and leaves it unchanged', async () => {
    const rule = tenantRule('tenant-a');
    created.push(rule);
    signedIn('tenant-b');

    expect((await patchRule(call('PATCH', `/api/rules/kernel/rules/${rule.id}`, { name: 'taken over' }), params(rule.id))).status).toBe(404);
    expect((await patchRule(call('PATCH', `/api/rules/kernel/rules/${rule.id}`, { action: 'TOGGLE_HIJACK' }), params(rule.id))).status).toBe(404);
    expect((await deleteRule(call('DELETE', `/api/rules/kernel/rules/${rule.id}`), params(rule.id))).status).toBe(404);

    const stored = universalRuleKernelStore.getRule(rule.id);
    expect(stored).toMatchObject({ tenantId: 'tenant-a', name: 'Rule of tenant-a', lifecycleStatus: 'ACTIVE' });
  });

  it('treats a platform GLOBAL_SYSTEM rule as not found for every tenant', async () => {
    const systemRule = universalRuleKernelStore.getRules().find((rule) => rule.scope === 'GLOBAL_SYSTEM');
    expect(systemRule).toBeDefined();
    signedIn('tenant-a');
    expect((await patchRule(call('PATCH', `/api/rules/kernel/rules/${systemRule!.id}`, { priority: 1 }), params(systemRule!.id))).status).toBe(404);
    expect(() => universalRuleKernelStore.deleteRule(systemRule!.id, systemRule!.tenantId)).toThrow(RuleNotFoundError);
  });

  it('ignores tenant, ID and statistics in an update body, and refuses the GLOBAL_SYSTEM scope', async () => {
    const rule = tenantRule('tenant-a');
    created.push(rule);
    signedIn('tenant-a');

    const moved = await patchRule(
      call('PATCH', `/api/rules/kernel/rules/${rule.id}`, {
        tenantId: 'tenant-b',
        id: 'rule-hijacked',
        systemLocked: true,
        stats: { totalEvaluations: 999, matchesCount: 999 },
        name: 'Renamed',
      }),
      params(rule.id),
    );
    expect(moved.status).toBe(200);
    expect(universalRuleKernelStore.getRule(rule.id)).toMatchObject({
      id: rule.id,
      tenantId: 'tenant-a',
      systemLocked: false,
      name: 'Renamed',
      stats: { totalEvaluations: 0, matchesCount: 0 },
    });

    const escalated = await patchRule(call('PATCH', `/api/rules/kernel/rules/${rule.id}`, { scope: 'GLOBAL_SYSTEM' }), params(rule.id));
    expect(escalated.status).toBe(400);
    expect(universalRuleKernelStore.getRule(rule.id)?.scope).toBe('TENANT_DEFAULT');
  });

  it('refuses to create a GLOBAL_SYSTEM rule, which would run for every tenant', async () => {
    signedIn('tenant-a');
    const response = await createRule(
      call('POST', '/api/rules/kernel/rules', {
        name: 'Everyone',
        ruleCode: 'RULE-GLOBAL',
        scope: 'GLOBAL_SYSTEM',
        conditions: [],
        action: { actionType: 'BLOCK_DROP' },
      }),
    );
    expect(response.status).toBe(400);
    expect(universalRuleKernelStore.getRules().some((rule) => rule.ruleCode === 'RULE-GLOBAL')).toBe(false);
  });

  it('needs rules:write to change a rule; rules:read is not enough', async () => {
    const rule = tenantRule('tenant-a');
    created.push(rule);
    signedIn('tenant-a', ['rules:read']);
    expect((await patchRule(call('PATCH', `/api/rules/kernel/rules/${rule.id}`, { name: 'x' }), params(rule.id))).status).toBe(403);
    expect((await deleteRule(call('DELETE', `/api/rules/kernel/rules/${rule.id}`), params(rule.id))).status).toBe(403);
    expect(
      (await createRule(call('POST', '/api/rules/kernel/rules', { name: 'n', ruleCode: 'R', conditions: [], action: { actionType: 'PASS' } }))).status,
    ).toBe(403);
  });

  it('still lets a tenant manage its own rule', async () => {
    const rule = tenantRule('tenant-a');
    signedIn('tenant-a');
    const hijacked = await patchRule(call('PATCH', `/api/rules/kernel/rules/${rule.id}`, { action: 'TOGGLE_HIJACK' }), params(rule.id));
    expect(hijacked.status).toBe(200);
    expect(universalRuleKernelStore.getRule(rule.id)?.lifecycleStatus).toBe('HIJACKED');
    expect((await deleteRule(call('DELETE', `/api/rules/kernel/rules/${rule.id}`), params(rule.id))).status).toBe(200);
    expect(universalRuleKernelStore.getRule(rule.id)).toBeUndefined();
  });
});
