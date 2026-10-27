import type { AgentToolSpec, GenerativeUINode } from './index.js';
import { validateGenerativeUI } from './index.js';

// WI-OI-120bc (Giga AI Companion, capability 3 — generative-UI builder): compose and save a screen as a generative-UI
// view. The pure core is a path-addressed, immutable tree editor (insert/remove/replace) whose result is re-validated
// against the same allow-list and depth/node bounds as any agent output — so a built view can never hold anything the
// renderer would refuse. Persisting and data-binding are tools (runtime). Only `group` nodes have children, so paths
// address positions within groups. `validateGenerativeUI` is used inside functions (never at module load), so this
// module stays cycle-free when re-exported from the agent barrel.

/** A saved, versioned screen: a `group` root of generative-UI nodes. */
export interface BuiltView {
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly root: GenerativeUINode;
  readonly createdBy: string;
}

/** An edit addressed by a path of child indices from the root (root group = `[]`). */
export type BuilderOp =
  | {
      readonly op: 'insert';
      readonly parentPath: readonly number[];
      readonly index: number;
      readonly node: GenerativeUINode;
    }
  | { readonly op: 'remove'; readonly path: readonly number[] }
  | { readonly op: 'replace'; readonly path: readonly number[]; readonly node: GenerativeUINode };

export type BuilderResult =
  | { readonly ok: true; readonly view: BuiltView }
  | { readonly ok: false; readonly reason: string };

/** Transform the children of the group at `path`, immutably. Returns null if the path does not resolve to a group. */
function mapGroupChildren(
  node: GenerativeUINode,
  path: readonly number[],
  fn: (children: readonly GenerativeUINode[]) => readonly GenerativeUINode[] | null,
): GenerativeUINode | null {
  if (node.kind !== 'group') return null;
  if (path.length === 0) {
    const next = fn(node.children);
    return next === null ? null : { ...node, kind: 'group', children: next };
  }
  const [i, ...rest] = path;
  if (i === undefined || i < 0 || i >= node.children.length) return null;
  const updatedChild = mapGroupChildren(node.children[i]!, rest, fn);
  if (updatedChild === null) return null;
  return { ...node, children: node.children.map((c, idx) => (idx === i ? updatedChild : c)) };
}

/**
 * Apply one edit to a view, purely. The root must be a `group`. The edit is rejected (with a reason, never a throw) if
 * its path does not resolve to a group, an index is out of range, or the result would break the generative-UI safety
 * bounds. On success the view's version is bumped and the input is left untouched.
 */
export function applyBuilderOp(view: BuiltView, edit: BuilderOp): BuilderResult {
  if (view.root.kind !== 'group') return { ok: false, reason: 'the view root must be a group' };

  let nextRoot: GenerativeUINode | null;
  if (edit.op === 'insert') {
    nextRoot = mapGroupChildren(view.root, edit.parentPath, (children) => {
      if (edit.index < 0 || edit.index > children.length) return null;
      return [...children.slice(0, edit.index), edit.node, ...children.slice(edit.index)];
    });
  } else {
    const path = edit.path;
    if (path.length === 0) return { ok: false, reason: 'cannot remove or replace the root' };
    const parent = path.slice(0, -1);
    const target = path[path.length - 1]!;
    nextRoot = mapGroupChildren(view.root, parent, (children) => {
      if (target < 0 || target >= children.length) return null;
      if (edit.op === 'remove')
        return [...children.slice(0, target), ...children.slice(target + 1)];
      return children.map((c, idx) => (idx === target ? edit.node : c));
    });
  }

  if (nextRoot === null)
    return { ok: false, reason: 'the path does not resolve to a group position' };
  const check = validateGenerativeUI(nextRoot);
  if (!check.ok)
    return { ok: false, reason: check.reason ?? 'the edit breaks the generative-UI bounds' };
  return { ok: true, view: { ...view, root: nextRoot, version: view.version + 1 } };
}

/** A built view is valid when it is named, its root is a group, and the whole tree passes the generative-UI bounds. */
export function validateBuiltView(view: BuiltView): BuilderResult {
  if (view.name.trim().length === 0) return { ok: false, reason: 'the view needs a name' };
  if (view.root.kind !== 'group') return { ok: false, reason: 'the view root must be a group' };
  const check = validateGenerativeUI(view.root);
  return check.ok ? { ok: true, view } : { ok: false, reason: check.reason ?? 'invalid view' };
}

/** The builder tools the Companion may call. The `builder:*` codes are new and join the catalogue with the module. */
export const BUILDER_TOOLS: readonly AgentToolSpec[] = [
  {
    name: 'builder.data.describe',
    description: 'Describe the data and fields available to bind into a view.',
    input: { type: 'object', properties: { source: { type: 'string' } }, required: ['source'] },
    requiresPermission: 'builder:read',
  },
  {
    name: 'builder.view.get',
    description: 'Load a saved view by id.',
    input: { type: 'object', properties: { viewId: { type: 'string' } }, required: ['viewId'] },
    requiresPermission: 'builder:read',
  },
  {
    name: 'builder.view.save',
    description:
      'Save a composed view (validated against the generative-UI allow-list and bounds).',
    input: {
      type: 'object',
      properties: { viewId: { type: 'string' }, name: { type: 'string' } },
      required: ['name'],
    },
    requiresPermission: 'builder:write',
  },
];
