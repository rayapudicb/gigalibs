import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowsService, CreateWorkflowDto } from './workflows.service.js';

describe('WorkflowsService', () => {
  let service: WorkflowsService;
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
    service = new WorkflowsService(mockDb);
  });

  it('rejects listing workflows without tenant_id', async () => {
    await expect(service.getWorkflows('')).rejects.toThrow('tenant_id is required');
  });

  it('creates workflow definition and immutable version 1.0.0 in tenant transaction', async () => {
    const dto: CreateWorkflowDto = {
      workflow_code: 'WF-DEFENSE-PAYOUT',
      name: 'Defense Supplier Payout',
      category: 'FINANCE',
      dag_definition: {
        nodes: [
          { id: 't1', name: 'Start', type: 'TRIGGER' },
          { id: 's1', name: 'Validate', type: 'CONTRACT_VALIDATION' },
        ],
        edges: [{ source: 't1', target: 's1' }],
      },
    };

    mockClient.query
      .mockResolvedValueOnce({ rows: [{ id: 'wf-99', workflow_code: dto.workflow_code, active_version: '1.0.0' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'ver-99' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'aud-99' }] });

    const result = await service.createWorkflow('tenant-corp-01', dto);
    expect(result.workflow_code).toBe('WF-DEFENSE-PAYOUT');
    expect(mockDb.withTenantTransaction).toHaveBeenCalledWith('tenant-corp-01', expect.any(Function));
    expect(mockClient.query).toHaveBeenCalledTimes(3);
  });

  it('rejects updating workflow without tenant_id', async () => {
    await expect(service.updateWorkflow('', 'RRR', { name: 'New Name' })).rejects.toThrow(
      'tenant_id is required',
    );
  });

  it('throws NotFoundException if workflow does not exist', async () => {
    mockClient.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(
      service.updateWorkflow('tenant-corp-01', 'NONEXISTENT', { name: 'New Name' }),
    ).rejects.toThrow("Workflow 'NONEXISTENT' not found");
  });

  it('updates workflow definition and dag_definition in tenant transaction', async () => {
    const existingWorkflow = {
      id: 'wf-123',
      tenant_id: 'tenant-corp-01',
      workflow_code: 'RRR',
      active_version: '1.0.0',
    };

    // 1. SELECT workflow
    mockClient.query.mockResolvedValueOnce({ rowCount: 1, rows: [existingWorkflow] });
    // 2. SELECT version
    mockClient.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'ver-123' }] });
    // 3. UPDATE version
    mockClient.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });
    // 4. UPDATE workflow definition
    mockClient.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ ...existingWorkflow, name: 'Updated RRR', active_version: '1.0.0' }],
    });
    // 5. INSERT audit event
    mockClient.query.mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const newDag = {
      nodes: [{ id: 'n1', name: 'Start', type: 'TRIGGER' }],
      edges: [],
    };

    const result = await service.updateWorkflow('tenant-corp-01', 'RRR', {
      name: 'Updated RRR',
      dag_definition: newDag,
    });

    expect(result.workflow_code).toBe('RRR');
    expect(result.name).toBe('Updated RRR');
    expect(result.dag_definition).toEqual(newDag);
    expect(mockDb.withTenantTransaction).toHaveBeenCalledWith('tenant-corp-01', expect.any(Function));
  });
});

