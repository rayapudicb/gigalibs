import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RulesService, RuleDto } from './rules.service.js';

describe('RulesService (RL-01: Policy lifecycle, scope, and effective dates)', () => {
  let service: RulesService;
  let mockDb: any;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
    };
    mockDb = {
      withTenantTransaction: vi.fn(async (tenantId: string, op: any) => {
        return op(mockClient);
      }),
    };
    service = new RulesService(mockDb);
  });

  it('rejects rule queries without a tenant ID', async () => {
    await expect(service.getRules('')).rejects.toThrow('tenant_id is required');
  });

  it('retrieves rules scoped to tenant, platform statutory rules, and specific department', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'rul-1',
          rule_code: 'STAT-01',
          scope: 'PLATFORM',
          domain: 'FINANCE',
          lifecycle_status: 'PUBLISHED',
        },
        {
          id: 'rul-2',
          rule_code: 'DEPT-HR-01',
          scope: 'DEPARTMENT',
          department: 'HR',
          domain: 'FINANCE',
          lifecycle_status: 'PUBLISHED',
        },
      ],
    });

    const result = await service.getRules('tenant-abc', 'FINANCE', undefined, 'HR');
    expect(result).toHaveLength(2);
    expect(mockDb.withTenantTransaction).toHaveBeenCalledWith('tenant-abc', expect.any(Function));
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('r.domain = $2 AND (r.department = $3 OR r.department IS NULL)'),
      ['tenant-abc', 'FINANCE', 'HR']
    );
  });

  it('creates rule in DRAFT lifecycle status and requires department if scope is DEPARTMENT', async () => {
    const invalidDto: RuleDto = {
      rule_code: 'RUL-INVALID',
      name: 'Department Rule Without Department',
      domain: 'SPEND',
      scope: 'DEPARTMENT',
      condition_ast: { field: 'amount', operator: '>', value: 100 },
      condition_expression: 'amount > 100',
      action_type: 'HOLD',
    };

    await expect(service.createRule('tenant-abc', invalidDto)).rejects.toThrow(
      'department is required when scope is DEPARTMENT'
    );

    const validDto: RuleDto = {
      rule_code: 'RUL-DEPT-VALID',
      name: 'Department Rule Valid',
      domain: 'SPEND',
      scope: 'DEPARTMENT',
      department: 'OPERATIONS',
      condition_ast: { field: 'amount', operator: '>', value: 100 },
      condition_expression: 'amount > 100',
      action_type: 'HOLD',
    };

    mockClient.query
      .mockResolvedValueOnce({ rows: [{ id: 'rul-101', ...validDto, lifecycle_status: 'DRAFT', published_version: '1.0.0' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ver-101', version: '1.0.0' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'aud-101' }] });

    const created = await service.createRule('tenant-abc', validDto, 'user-admin');
    expect(created.id).toBe('rul-101');
    expect(mockClient.query).toHaveBeenCalledTimes(3);
  });

  it('publishes a new immutable version and updates rule published_version and approver_id', async () => {
    mockClient.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{
          id: 'rul-101',
          tenant_id: 'tenant-abc',
          rule_code: 'RUL-1',
          scope: 'TENANT',
          system_locked: false,
          condition_ast: {},
          condition_expression: '',
          action_type: 'APPROVE',
          action_params: {},
        }],
      })
      .mockResolvedValueOnce({ rows: [{ id: 'ver-2' }] }) // insert version
      .mockResolvedValueOnce({ rows: [{ id: 'rul-101', published_version: '2.0.0', lifecycle_status: 'PUBLISHED' }] }) // update rule
      .mockResolvedValueOnce({ rows: [{ id: 'aud-2' }] }); // insert audit

    const updated = await service.publishRuleVersion(
      'tenant-abc',
      'rul-101',
      '2.0.0',
      'approver-exec-01',
      { field: 'amount', operator: '<', value: 50 },
      'amount < 50',
      'AUTO_APPROVE',
      { channel: 'slack' }
    );

    expect(updated.published_version).toBe('2.0.0');
    expect(updated.lifecycle_status).toBe('PUBLISHED');
  });

  it('forbids retiring system_locked platform statutory guardrails', async () => {
    mockClient.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        id: 'rul-stat',
        tenant_id: 'tenant-abc',
        rule_code: 'STAT-TAX-01',
        scope: 'PLATFORM',
        system_locked: true,
      }],
    });

    await expect(
      service.updateRuleLifecycle('tenant-abc', 'rul-stat', 'RETIRED')
    ).rejects.toThrow('Cannot retire system_locked platform statutory guardrails');
  });
});
