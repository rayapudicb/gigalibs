import { MAX_ROLE_INCLUSION_DEPTH, MAX_ROLE_INCLUSIONS, isTenantPermissionCode } from '@gigalibs/contracts';
import type { Prisma } from '@gigalibs/db';
import { UnprocessableEntityException } from '@nestjs/common';

// WI-OI-120w (R2 slice 2c, ADR-0034 §2): a workspace's roles and which include which. A role grants its own permissions
// and, transitively, those of the roles it includes; the graph is kept acyclic and shallow on every save.

export interface RoleGraph {
  /** Each role's own tenant permission codes. */
  readonly own: ReadonlyMap<string, readonly string[]>;
  /** The roles each role includes directly. */
  readonly includes: ReadonlyMap<string, readonly string[]>;
  readonly names: ReadonlyMap<string, string>;
}

export async function loadRoleGraph(tx: Prisma.TransactionClient, tenantId: string): Promise<RoleGraph> {
  const [roles, edges] = await Promise.all([
    tx.customRole.findMany({ where: { tenantId }, select: { id: true, name: true, permissions: true } }),
    tx.customRoleInclusion.findMany({ where: { tenantId }, select: { roleId: true, includedRoleId: true } }),
  ]);
  const includes = new Map<string, string[]>();
  for (const edge of edges) includes.set(edge.roleId, [...(includes.get(edge.roleId) ?? []), edge.includedRoleId]);
  return {
    own: new Map(roles.map((role) => [role.id, Array.isArray(role.permissions) ? role.permissions.filter(isTenantPermissionCode) : []])),
    includes,
    names: new Map(roles.map((role) => [role.id, role.name])),
  };
}

/** The graph as it would be after `roleId` takes these permissions or inclusions. */
export function withRole(
  graph: RoleGraph,
  roleId: string,
  change: { readonly permissions?: readonly string[]; readonly includes?: readonly string[]; readonly name?: string },
): RoleGraph {
  const own = new Map(graph.own);
  const includes = new Map(graph.includes);
  const names = new Map(graph.names);
  if (change.permissions) own.set(roleId, change.permissions.filter(isTenantPermissionCode));
  else if (!own.has(roleId)) own.set(roleId, []);
  if (change.includes) includes.set(roleId, [...change.includes]);
  if (change.name) names.set(roleId, change.name);
  return { own, includes, names };
}

// Security review of 2c (M1): every walk visits each role once. Expansions are kept per graph, so the many holder checks
// of one request share them; a graph is never mutated (`withRole` builds a new one).
const expansions = new WeakMap<RoleGraph, Map<string, readonly string[]>>();

/**
 * What `roleId` grants: its own codes and those of every role it includes within MAX_ROLE_INCLUSION_DEPTH steps (the
 * same reach as the session's recursive query). Breadth first, so each role is visited once, at its nearest distance.
 */
export function expandRole(graph: RoleGraph, roleId: string): readonly string[] {
  let cache = expansions.get(graph);
  if (!cache) expansions.set(graph, (cache = new Map()));
  const cached = cache.get(roleId);
  if (cached) return cached;
  const codes = new Set<string>(graph.own.get(roleId) ?? []);
  const seen = new Set<string>([roleId]);
  let frontier = [roleId];
  for (let depth = 0; depth < MAX_ROLE_INCLUSION_DEPTH && frontier.length > 0; depth += 1) {
    const next: string[] = [];
    for (const id of frontier)
      for (const included of graph.includes.get(id) ?? [])
        if (!seen.has(included)) {
          seen.add(included);
          next.push(included);
          for (const code of graph.own.get(included) ?? []) codes.add(code);
        }
    frontier = next;
  }
  // Frozen: the same array is shared by every check of this request (re-check of 2c).
  const result = Object.freeze([...codes]);
  cache.set(roleId, result);
  return result;
}

/** Every role that includes `roleId`, directly or through others (each role visited once). */
export function rolesIncluding(graph: RoleGraph, roleId: string): string[] {
  const includedBy = new Map<string, string[]>();
  for (const [id, included] of graph.includes) for (const target of included) includedBy.set(target, [...(includedBy.get(target) ?? []), id]);
  const found = new Set<string>();
  const queue = [roleId];
  while (queue.length > 0) {
    for (const id of includedBy.get(queue.shift()!) ?? [])
      if (id !== roleId && !found.has(id)) {
        found.add(id);
        queue.push(id);
      }
  }
  return [...found];
}

/** The longest chain of inclusions from each role, remembered; null for a role that reaches a cycle. */
function chainLengths(graph: RoleGraph): (roleId: string) => number | null {
  const done = new Map<string, number | null>();
  const onPath = new Set<string>();
  const visit = (id: string): number | null => {
    if (done.has(id)) return done.get(id)!;
    if (onPath.has(id)) return null;
    onPath.add(id);
    let longest: number | null = 0;
    for (const next of graph.includes.get(id) ?? []) {
      const below = visit(next);
      if (below === null) {
        longest = null;
        break;
      }
      longest = Math.max(longest, below + 1);
    }
    onPath.delete(id);
    done.set(id, longest);
    return longest;
  };
  return visit;
}

/** Refuses inclusions of `roleId` that name a role outside the workspace, itself, too many, a cycle or too deep. */
export function assertInclusionsValid(graph: RoleGraph, roleId: string): void {
  const includes = graph.includes.get(roleId) ?? [];
  if (includes.length > MAX_ROLE_INCLUSIONS)
    throw new UnprocessableEntityException({ code: 'ROLE_INCLUSION_LIMIT', message: `A role includes at most ${MAX_ROLE_INCLUSIONS} roles.` });
  if (includes.includes(roleId)) throw new UnprocessableEntityException({ code: 'ROLE_INCLUSION_SELF', message: 'A role cannot include itself.' });
  const unknown = includes.filter((id) => !graph.own.has(id));
  if (unknown.length > 0)
    throw new UnprocessableEntityException({ code: 'ROLE_INCLUSION_UNKNOWN', message: 'Include roles of this workspace only.', missing: unknown });
  const lengthOf = chainLengths(graph);
  for (const root of [roleId, ...rolesIncluding(graph, roleId)]) {
    const length = lengthOf(root);
    if (length === null)
      throw new UnprocessableEntityException({
        code: 'ROLE_INCLUSION_CYCLE',
        message: `${graph.names.get(root) ?? 'A role'} would end up including itself; remove one of the inclusions.`,
      });
    if (length > MAX_ROLE_INCLUSION_DEPTH)
      throw new UnprocessableEntityException({
        code: 'ROLE_INCLUSION_TOO_DEEP',
        message: `${graph.names.get(root) ?? 'A role'} would include roles more than ${MAX_ROLE_INCLUSION_DEPTH} levels deep.`,
      });
  }
}
