import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionService, DagDefinition } from './execution.service.js';

describe('ExecutionService (WF-01, WF-02, WF-03, WF-04)', () => {
  let service: ExecutionService;
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
    service = new ExecutionService(mockDb);
  });

  describe('Topological Sort & Cycle Detection (WF-01)', () => {
    it('sorts nodes in dependency order independent of JSON array order', () => {
      // In JSON array order: node-3, node-1, node-2
      // In Dependency order: node-1 -> node-2 -> node-3
      const dag: DagDefinition = {
        nodes: [
          { id: 'node-3', name: 'Step 3', type: 'NOTIFICATION' },
          { id: 'node-1', name: 'Trigger', type: 'TRIGGER' },
          { id: 'node-2', name: 'Step 2', type: 'TRANSFORM' },
        ],
        edges: [
          { source: 'node-1', target: 'node-2' },
          { source: 'node-2', target: 'node-3' },
        ],
      };

      const sorted = service.topologicalSort(dag);
      expect(sorted.map((n) => n.id)).toEqual(['node-1', 'node-2', 'node-3']);
    });

    it('detects cycles and throws explicit BadRequestException', () => {
      const cycleDag: DagDefinition = {
        nodes: [
          { id: 'node-A', name: 'A', type: 'TRANSFORM' },
          { id: 'node-B', name: 'B', type: 'TRANSFORM' },
        ],
        edges: [
          { source: 'node-A', target: 'node-B' },
          { source: 'node-B', target: 'node-A' },
        ],
      };

      expect(() => service.topologicalSort(cycleDag)).toThrow(/DAG contains a circular dependency or cycle/);
    });

    it('rejects broken edges with missing source or target node', () => {
      const brokenDag: DagDefinition = {
        nodes: [{ id: 'node-1', name: 'Node 1', type: 'TRIGGER' }],
        edges: [{ source: 'node-1', target: 'missing-node' }],
      };

      expect(() => service.topologicalSort(brokenDag)).toThrow(/DAG edge specifies missing target node 'missing-node'/);
    });
  });

  describe('Node Handlers (WF-02, WF-04)', () => {
    it('executes CONTRACT_VALIDATION node and verifies required fields', async () => {
      const validNode = {
        id: 'n1',
        name: 'Check Contract',
        type: 'CONTRACT_VALIDATION',
        config: { required_fields: ['customer_id', 'amount'] },
      };

      const result = await service.executeStepAction(validNode, { customer_id: 'CUST-1', amount: 500 });
      expect(result.contract_validated).toBe(true);

      await expect(
        service.executeStepAction(validNode, { customer_id: 'CUST-1' })
      ).rejects.toThrow(/Contract validation failed.*missing required field 'amount'/);
    });

    it('executes TRANSFORM node and applies dynamic expression', async () => {
      const transformNode = {
        id: 'n2',
        name: 'Calculate Tax Surcharge',
        type: 'TRANSFORM',
        config: {
          expression: 'MULTIPLY_BY_FACTOR',
          source_field: 'amount',
          factor: 1.15,
          target_property: 'amount_with_surcharge',
        },
      };

      const result = await service.executeStepAction(transformNode, { amount: 100 });
      expect(result.amount_with_surcharge).toBe(115);
    });

    it('executes ACTION_GATEWAY node and produces immutable action receipt (WF-04)', async () => {
      const actionNode = {
        id: 'n3',
        name: 'Dispatch Bank Transfer',
        type: 'ACTION_GATEWAY',
        config: {
          action_type: 'INITIATE_PAYOUT',
          target_endpoint: 'https://bank.gateway/payout',
        },
      };

      const result = await service.executeStepAction(actionNode, { amount: 5000 }, 'tenant-abc', 'run-123');
      expect(result.action_dispatched).toBe(true);
      expect(result._action_receipt).toBeDefined();
      expect(result._action_receipt.action_type).toBe('INITIATE_PAYOUT');
      expect(result._action_receipt.status).toBe('DISPATCHED_ACKNOWLEDGED');
      expect(result._action_receipt.idempotency_key).toBeDefined();
    });

    it('rejects unsupported node types with explicit error', async () => {
      const unknownNode = {
        id: 'n-unknown',
        name: 'Fake Step',
        type: 'MAGIC_AI_SOLVER',
      };

      await expect(
        service.executeStepAction(unknownNode, {})
      ).rejects.toThrow(/Unsupported workflow node type 'MAGIC_AI_SOLVER'/);
    });
  });

  describe('Durable Execution, Checkpointing & Recovery (WF-03)', () => {
    it('executes complete workflow with step checkpointing and lease fencing', async () => {
      const dag: DagDefinition = {
        nodes: [
          { id: 't1', name: 'Ingest Event', type: 'TRIGGER' },
          { id: 's1', name: 'Validate Contract', type: 'CONTRACT_VALIDATION', config: { required_fields: ['amount'] } },
          { id: 's2', name: 'FX Convert', type: 'FX_CONVERSION', config: { target_currency: 'USD' } },
        ],
        edges: [
          { source: 't1', target: 's1' },
          { source: 's1', target: 's2' },
        ],
      };

      mockClient.query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{
            id: 'wf-1',
            workflow_code: 'WF-O2C',
            name: 'Order to Cash',
            active_version: '1.0.0',
            version_record_id: 'ver-100',
            dag_definition: dag,
          }],
        })
        .mockResolvedValueOnce({ rows: [] }) // insert run
        .mockResolvedValueOnce({ rows: [] }) // insert step 1 START
        .mockResolvedValueOnce({ rows: [] }) // insert step 2 START
        .mockResolvedValueOnce({ rows: [] }) // update step 2 COMPLETED
        .mockResolvedValueOnce({ rows: [] }) // query latest seal
        .mockResolvedValueOnce({ rows: [] }); // update run COMPLETED

      const result = await service.executeWorkflow('tenant-100', 'WF-O2C', {
        trigger_payload: { amount: 1000, currency: 'EUR' },
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('COMPLETED');
      expect(result.seal_sequence).toBe(1);
      expect(result.seal_hash).toBeDefined();
      expect(result.steps_executed).toBe(2);
      expect(result.final_state.contract_validated).toBe(true);
      expect(result.final_state.converted_amount).toBeGreaterThan(1000);
    });

    it('pauses execution when an APPROVAL_GATE is encountered', async () => {
      const dag: DagDefinition = {
        nodes: [
          { id: 't1', name: 'Trigger', type: 'TRIGGER' },
          { id: 's1', name: 'Validate', type: 'CONTRACT_VALIDATION', config: { required_fields: ['amount'] } },
          { id: 's2', name: 'VP Approval', type: 'APPROVAL_GATE', config: { requires_human_approval: true, approval_role: 'VP_FINANCE' } },
        ],
        edges: [
          { source: 't1', target: 's1' },
          { source: 's1', target: 's2' },
        ],
      };

      mockClient.query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{
            id: 'wf-appr',
            workflow_code: 'WF-APPR',
            name: 'Approval Flow',
            active_version: '1.0.0',
            version_record_id: 'ver-200',
            dag_definition: dag,
          }],
        })
        .mockResolvedValueOnce({ rows: [] }) // insert run
        .mockResolvedValueOnce({ rows: [] }) // insert step 1 START
        .mockResolvedValueOnce({ rows: [] }) // update step 1 COMPLETED
        .mockResolvedValueOnce({ rows: [] }) // insert step 2 START
        .mockResolvedValueOnce({ rows: [] }) // update step 2 WAITING_APPROVAL
        .mockResolvedValueOnce({ rows: [] }) // query latest seal
        .mockResolvedValueOnce({ rows: [] }); // update run WAITING_APPROVAL

      const result = await service.executeWorkflow('tenant-100', 'WF-APPR', {
        trigger_payload: { amount: 50000 },
      });

      expect(result.status).toBe('WAITING_APPROVAL');
      expect(result.steps[1].status).toBe('WAITING_APPROVAL');
    });

    it('replays a run skipping already completed steps (Time-Travel replay)', async () => {
      const dag: DagDefinition = {
        nodes: [
          { id: 't1', name: 'Trigger', type: 'TRIGGER' },
          { id: 's1', name: 'Step 1 Completed', type: 'TRANSFORM' },
          { id: 's2', name: 'Step 2 Needs Replay', type: 'TRANSFORM' },
        ],
        edges: [
          { source: 't1', target: 's1' },
          { source: 's1', target: 's2' },
        ],
      };

      mockClient.query
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{
            id: 'run-prev',
            tenant_id: 'tenant-100',
            workflow_id: 'wf-1',
            version_id: 'ver-1',
            status: 'FAILED',
            state: { initial_val: 10 },
          }],
        })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ dag_definition: dag }],
        })
        .mockResolvedValueOnce({
          rows: [
            { step_id: 's1', status: 'COMPLETED' }, // already completed
            { step_id: 's2', status: 'FAILED' },
          ],
        })
        .mockResolvedValueOnce({ rows: [] }) // insert step 2 execution
        .mockResolvedValueOnce({ rows: [] }); // update run COMPLETED

      const replayResult = await service.replayRun('tenant-100', 'run-prev');
      expect(replayResult.success).toBe(true);
      expect(replayResult.replayed_steps_count).toBe(1);
      expect(replayResult.replayed_steps[0].step_id).toBe('s2');
    });
  });
});
