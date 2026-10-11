import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import type { CmmsPrincipal } from './authorization.js';

/**
 * A single organization unit in the CMMS unit-tree projection.
 */
export interface CmmsUnitNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly code?: string;
  readonly name?: string;
}

/**
 * An immutable snapshot of an organization hierarchy version.
 */
export interface CmmsOrganizationTree {
  readonly versionId: string;
  readonly units: ReadonlyMap<string, CmmsUnitNode>;
}

/**
 * Expand unit roots to include all direct and transitive descendant unit IDs using BFS.
 */
export function expandUnitRoots(tree: CmmsOrganizationTree, roots: readonly string[]): string[] {
  const result = new Set<string>();
  const childrenByParent = new Map<string, string[]>();

  for (const [unitId, node] of tree.units) {
    if (node.parentId) {
      const list = childrenByParent.get(node.parentId) ?? [];
      list.push(unitId);
      childrenByParent.set(node.parentId, list);
    }
  }

  const queue = [...roots];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (tree.units.has(current) && !result.has(current)) {
      result.add(current);
      const children = childrenByParent.get(current);
      if (children) {
        for (const child of children) {
          if (!result.has(child)) queue.push(child);
        }
      }
    }
  }

  return [...result];
}

/**
 * Verify that the caller's organization scope claims are consistent with the module's active tree version.
 * Fails closed if the tree version is missing, pending convergence, or if the scope is explicitly DENIED.
 */
export function verifyOrganizationVersion(
  principal: CmmsPrincipal,
  activeTreeVersion?: string | null,
): void {
  if (principal.organization?.mode === 'DENIED') {
    throw new ForbiddenException({
      code: 'CMMS_OUT_OF_SCOPE',
      message: 'Organization scope denied.',
    });
  }

  if (principal.organization?.mode === 'UNITS') {
    const required = principal.organization.tree_version;
    if (!activeTreeVersion || activeTreeVersion !== required) {
      throw new ServiceUnavailableException({
        code: 'ORGANIZATION_VERSION_PENDING',
        message: 'The organization tree version is not available or pending convergence.',
      });
    }
  }

  if (principal.organization?.mode === 'TENANT' && principal.organization.tree_version) {
    const required = principal.organization.tree_version;
    if (!activeTreeVersion || activeTreeVersion !== required) {
      throw new ServiceUnavailableException({
        code: 'ORGANIZATION_VERSION_PENDING',
        message: 'The organization tree version is not available or pending convergence.',
      });
    }
  }
}
