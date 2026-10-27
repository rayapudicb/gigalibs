import { describe, expect, it } from 'vitest';
import {
  BUILDER_TOOLS,
  type BuiltView,
  GENERATIVE_UI_MAX_DEPTH,
  type GenerativeUINode,
  applyBuilderOp,
  toolsForPermissions,
  validateBuiltView,
} from './index.js';

// WI-OI-120bc (Giga AI Companion, capability 3): the pure, path-addressed view editor and its safety re-validation.

const view: BuiltView = {
  id: 'v1',
  name: 'Overview',
  version: 1,
  createdBy: 'u',
  root: {
    kind: 'group',
    children: [
      { kind: 'text', text: 'a' },
      { kind: 'text', text: 'b' },
    ],
  },
};

describe('applyBuilderOp', () => {
  it('inserts into the root group, bumps the version, and does not mutate the input', () => {
    const r = applyBuilderOp(view, {
      op: 'insert',
      parentPath: [],
      index: 1,
      node: { kind: 'text', text: 'mid' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.view.version).toBe(2);
    expect(r.view.root.kind === 'group' && r.view.root.children).toHaveLength(3);
    expect(r.view.root.kind === 'group' && (r.view.root.children[1] as { text: string }).text).toBe(
      'mid',
    );
    // input untouched
    expect(view.version).toBe(1);
    expect(view.root.kind === 'group' && view.root.children).toHaveLength(2);
  });

  it('removes and replaces by path', () => {
    const removed = applyBuilderOp(view, { op: 'remove', path: [0] });
    expect(
      removed.ok && removed.view.root.kind === 'group' && removed.view.root.children,
    ).toHaveLength(1);

    const replaced = applyBuilderOp(view, {
      op: 'replace',
      path: [1],
      node: { kind: 'heading', text: 'H', level: 2 },
    });
    expect(
      replaced.ok && replaced.view.root.kind === 'group' && replaced.view.root.children[1]?.kind,
    ).toBe('heading');
  });

  it('refuses a path that does not resolve to a group position', () => {
    // parentPath [0] points at a text node, which has no children
    const r = applyBuilderOp(view, {
      op: 'insert',
      parentPath: [0],
      index: 0,
      node: { kind: 'text', text: 'x' },
    });
    expect(r.ok).toBe(false);
  });

  it('refuses to remove the root', () => {
    expect(applyBuilderOp(view, { op: 'remove', path: [] }).ok).toBe(false);
  });

  it('refuses an edit that would break the depth bound', () => {
    let deep: GenerativeUINode = { kind: 'text', text: 'leaf' };
    for (let i = 0; i < GENERATIVE_UI_MAX_DEPTH; i += 1) deep = { kind: 'group', children: [deep] };
    const r = applyBuilderOp(view, { op: 'insert', parentPath: [], index: 0, node: deep });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/nesting/);
  });
});

describe('validateBuiltView', () => {
  it('requires a name and a group root', () => {
    expect(validateBuiltView({ ...view, name: '  ' }).ok).toBe(false);
    expect(validateBuiltView({ ...view, root: { kind: 'text', text: 'x' } }).ok).toBe(false);
    expect(validateBuiltView(view).ok).toBe(true);
  });
});

describe('BUILDER_TOOLS least privilege', () => {
  it('separates read from write', () => {
    expect(
      toolsForPermissions(BUILDER_TOOLS, ['builder:read'])
        .map((t) => t.name)
        .sort(),
    ).toEqual(['builder.data.describe', 'builder.view.get']);
    expect(toolsForPermissions(BUILDER_TOOLS, ['builder:write']).map((t) => t.name)).toEqual([
      'builder.view.save',
    ]);
  });
});
