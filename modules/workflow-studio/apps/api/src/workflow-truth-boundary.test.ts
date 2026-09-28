/**
 * Workflow Studio Truth-Boundary Tests
 *
 * Pure unit tests for DAG structural invariants. No DB, no network.
 * These validate the domain rules that workflow definitions must satisfy
 * before being persisted.
 */

import { describe, expect, it } from 'vitest';

// ── Domain types ────────────────────────────────────────────────────────────

interface DagNode {
  id: string;
  type: string;
  service_target: string;
  action: string;
  name?: string;
  config?: Record<string, unknown>;
}

interface DagEdge {
  from: string;
  to: string;
  condition?: string;
}

interface DagDefinition {
  nodes: DagNode[];
  edges: DagEdge[];
}

// ── Domain validator (the same logic workflow-studio API enforces) ───────────

const WORKFLOW_CODE_RE = /^[A-Z0-9][A-Z0-9-]{1,62}[A-Z0-9]$|^[A-Z0-9]{2}$/;

function validateWorkflowCode(code: string): string[] {
  const errors: string[] = [];
  if (!WORKFLOW_CODE_RE.test(code)) {
    errors.push(
      `workflow_code "${code}" must be 2-64 characters, uppercase alphanumeric and hyphens only.`,
    );
  }
  return errors;
}

function validateDagNode(node: Partial<DagNode>, index: number): string[] {
  const errors: string[] = [];
  if (!node.id || typeof node.id !== 'string' || node.id.trim() === '') {
    errors.push(`node[${index}].id is required and must be a non-empty string.`);
  }
  if (!node.type || typeof node.type !== 'string' || node.type.trim() === '') {
    errors.push(`node[${index}].type is required and must be a non-empty string.`);
  }
  if (!node.service_target || typeof node.service_target !== 'string' || node.service_target.trim() === '') {
    errors.push(`node[${index}].service_target is required and must be a non-empty string.`);
  }
  if (!node.action || typeof node.action !== 'string' || node.action.trim() === '') {
    errors.push(`node[${index}].action is required and must be a non-empty string.`);
  }
  return errors;
}

function validateDagEdge(edge: Partial<DagEdge>, index: number, nodeIds: Set<string>): string[] {
  const errors: string[] = [];
  if (!edge.from || !nodeIds.has(edge.from)) {
    errors.push(`edge[${index}].from "${edge.from}" does not reference an existing node id.`);
  }
  if (!edge.to || !nodeIds.has(edge.to)) {
    errors.push(`edge[${index}].to "${edge.to}" does not reference an existing node id.`);
  }
  if (edge.from && edge.to && edge.from === edge.to) {
    errors.push(`edge[${index}] is a self-loop: from and to are both "${edge.from}".`);
  }
  return errors;
}

function hasDagCycle(dag: DagDefinition): boolean {
  // Kahn's algorithm: topological sort via in-degree counting
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const node of dag.nodes) {
    inDegree.set(node.id, 0);
    adj.set(node.id, []);
  }
  for (const edge of dag.edges) {
    adj.get(edge.from)?.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }

  const queue = [...inDegree.entries()]
    .filter(([, deg]) => deg === 0)
    .map(([id]) => id);

  let visited = 0;
  while (queue.length > 0) {
    const node = queue.shift()!;
    visited++;
    for (const neighbour of adj.get(node) ?? []) {
      const deg = (inDegree.get(neighbour) ?? 0) - 1;
      inDegree.set(neighbour, deg);
      if (deg === 0) queue.push(neighbour);
    }
  }

  return visited !== dag.nodes.length; // cycle detected if not all visited
}

function validateDag(dag: DagDefinition): string[] {
  const errors: string[] = [];

  for (let i = 0; i < dag.nodes.length; i++) {
    errors.push(...validateDagNode(dag.nodes[i]!, i));
  }

  const nodeIds = new Set(dag.nodes.map((n) => n.id));

  for (let i = 0; i < dag.edges.length; i++) {
    errors.push(...validateDagEdge(dag.edges[i]!, i, nodeIds));
  }

  if (errors.length === 0 && hasDagCycle(dag)) {
    errors.push('DAG contains a cycle. Workflow definitions must be acyclic.');
  }

  return errors;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Workflow code validation', () => {
  it('accepts valid uppercase alphanumeric codes', () => {
    expect(validateWorkflowCode('WF-O2C-CROSS-BORDER')).toHaveLength(0);
    expect(validateWorkflowCode('WF01')).toHaveLength(0);
    expect(validateWorkflowCode('AB')).toHaveLength(0);
    expect(validateWorkflowCode('TREASURY-AUTO-HEDGE-V2')).toHaveLength(0);
  });

  it('rejects lowercase letters in workflow code', () => {
    const errors = validateWorkflowCode('wf-o2c');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('workflow_code');
  });

  it('rejects a single-character code', () => {
    const errors = validateWorkflowCode('A');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects codes with spaces', () => {
    const errors = validateWorkflowCode('WF O2C');
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('DAG node validation', () => {
  const validNode: DagNode = {
    id: 'node-1',
    type: 'SCHEMA_VALIDATE',
    service_target: 'Port 3800 Data Studio',
    action: 'VALIDATE_INGRESS',
  };

  it('accepts a valid node with all required fields', () => {
    expect(validateDagNode(validNode, 0)).toHaveLength(0);
  });

  it('rejects a node missing id', () => {
    const errors = validateDagNode({ ...validNode, id: '' }, 0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('id');
  });

  it('rejects a node missing type', () => {
    const errors = validateDagNode({ ...validNode, type: '' }, 0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('type');
  });

  it('rejects a node missing service_target', () => {
    const errors = validateDagNode({ ...validNode, service_target: '' }, 0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('service_target');
  });

  it('rejects a node missing action', () => {
    const errors = validateDagNode({ ...validNode, action: '' }, 0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('action');
  });

  it('rejects a node with multiple missing required fields', () => {
    const errors = validateDagNode({ id: '', type: '', service_target: '', action: '' }, 0);
    expect(errors).toHaveLength(4);
  });
});

describe('DAG edge validation', () => {
  const nodeIds = new Set(['node-1', 'node-2', 'node-3']);

  it('accepts valid edges referencing existing node IDs', () => {
    const errors = validateDagEdge({ from: 'node-1', to: 'node-2' }, 0, nodeIds);
    expect(errors).toHaveLength(0);
  });

  it('rejects an edge whose "from" node does not exist', () => {
    const errors = validateDagEdge({ from: 'node-ghost', to: 'node-2' }, 0, nodeIds);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('from');
  });

  it('rejects an edge whose "to" node does not exist', () => {
    const errors = validateDagEdge({ from: 'node-1', to: 'node-phantom' }, 0, nodeIds);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('to');
  });

  it('rejects a self-loop edge where from === to', () => {
    const errors = validateDagEdge({ from: 'node-1', to: 'node-1' }, 0, nodeIds);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('self-loop'))).toBe(true);
  });
});

describe('DAG acyclicity detection', () => {
  it('passes for a valid linear DAG: node-1 → node-2 → node-3', () => {
    const dag: DagDefinition = {
      nodes: [
        { id: 'node-1', type: 'T', service_target: 'S', action: 'A' },
        { id: 'node-2', type: 'T', service_target: 'S', action: 'A' },
        { id: 'node-3', type: 'T', service_target: 'S', action: 'A' },
      ],
      edges: [
        { from: 'node-1', to: 'node-2' },
        { from: 'node-2', to: 'node-3' },
      ],
    };
    expect(hasDagCycle(dag)).toBe(false);
    expect(validateDag(dag)).toHaveLength(0);
  });

  it('passes for a branching DAG with two paths converging', () => {
    const dag: DagDefinition = {
      nodes: [
        { id: 'n1', type: 'T', service_target: 'S', action: 'A' },
        { id: 'n2', type: 'T', service_target: 'S', action: 'A' },
        { id: 'n3', type: 'T', service_target: 'S', action: 'A' },
        { id: 'n4', type: 'T', service_target: 'S', action: 'A' },
      ],
      edges: [
        { from: 'n1', to: 'n2' },
        { from: 'n1', to: 'n3' },
        { from: 'n2', to: 'n4' },
        { from: 'n3', to: 'n4' },
      ],
    };
    expect(hasDagCycle(dag)).toBe(false);
  });

  it('detects a cycle: node-1 → node-2 → node-3 → node-1', () => {
    const dag: DagDefinition = {
      nodes: [
        { id: 'node-1', type: 'T', service_target: 'S', action: 'A' },
        { id: 'node-2', type: 'T', service_target: 'S', action: 'A' },
        { id: 'node-3', type: 'T', service_target: 'S', action: 'A' },
      ],
      edges: [
        { from: 'node-1', to: 'node-2' },
        { from: 'node-2', to: 'node-3' },
        { from: 'node-3', to: 'node-1' }, // cycle
      ],
    };
    expect(hasDagCycle(dag)).toBe(true);
    const errors = validateDag(dag);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('cycle'))).toBe(true);
  });

  it('detects a direct self-loop via edge validation', () => {
    const dag: DagDefinition = {
      nodes: [
        { id: 'node-1', type: 'T', service_target: 'S', action: 'A' },
      ],
      edges: [
        { from: 'node-1', to: 'node-1' }, // self-loop
      ],
    };
    const errors = validateDag(dag);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes('self-loop'))).toBe(true);
  });

  it('detects a two-node cycle: A → B → A', () => {
    const dag: DagDefinition = {
      nodes: [
        { id: 'A', type: 'T', service_target: 'S', action: 'A' },
        { id: 'B', type: 'T', service_target: 'S', action: 'A' },
      ],
      edges: [
        { from: 'A', to: 'B' },
        { from: 'B', to: 'A' },
      ],
    };
    expect(hasDagCycle(dag)).toBe(true);
  });
});

describe('Full DAG validation pipeline', () => {
  it('returns no errors for a complete valid workflow DAG', () => {
    const dag: DagDefinition = {
      nodes: [
        { id: 'ingest', type: 'SCHEMA_VALIDATE', service_target: 'Port 3800 Data Studio', action: 'VALIDATE_INGRESS' },
        { id: 'fx-norm', type: 'FX_NORMALIZATION', service_target: 'Port 3500 FX Engine', action: 'CONVERT_TO_BASE' },
        { id: 'rule-eval', type: 'RULE_EVALUATION', service_target: 'Port 3900 Rule Pro', action: 'EVALUATE_POLICY' },
        { id: 'ar-seal', type: 'LEDGER_DISPATCH', service_target: 'Port 3400 AR Core', action: 'CREATE_INVOICE_SEAL' },
      ],
      edges: [
        { from: 'ingest', to: 'fx-norm' },
        { from: 'fx-norm', to: 'rule-eval' },
        { from: 'rule-eval', to: 'ar-seal' },
      ],
    };
    expect(validateDag(dag)).toHaveLength(0);
  });

  it('accumulates errors for a DAG with invalid nodes AND referential edge errors', () => {
    const dag: DagDefinition = {
      nodes: [
        { id: '', type: '', service_target: 'S', action: 'A' }, // missing id + type
        { id: 'n2', type: 'T', service_target: 'S', action: 'A' },
      ],
      edges: [
        { from: 'ghost', to: 'n2' }, // ghost node
      ],
    };
    const errors = validateDag(dag);
    // Should have errors for both node[0] missing fields AND the ghost edge
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });
});
