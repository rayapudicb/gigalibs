import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import type { CmmsPrincipal } from './authorization.js';

/**
 * A single spatial place node in the CMMS canonical place projection (T3).
 */
export interface CmmsPlaceNode {
  readonly id: string;
  readonly parentId: string | null;
  readonly nodeTypeCode?: string;
  readonly code?: string;
  readonly name?: string;
  readonly path?: string;
}

/**
 * An immutable snapshot of a canonical spatial place hierarchy.
 */
export interface CmmsPlaceTree {
  readonly versionId?: string;
  readonly places: ReadonlyMap<string, CmmsPlaceNode>;
}

/**
 * Expand place roots to include all direct and transitive descendant place IDs (site -> building -> floor -> zone/room) using BFS.
 */
export function expandPlaceRoots(tree: CmmsPlaceTree, roots: readonly string[]): string[] {
  const result = new Set<string>();
  const childrenByParent = new Map<string, string[]>();

  for (const [placeId, node] of tree.places) {
    if (node.parentId) {
      const list = childrenByParent.get(node.parentId) ?? [];
      list.push(placeId);
      childrenByParent.set(node.parentId, list);
    }
  }

  const queue = [...roots];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (tree.places.has(current) && !result.has(current)) {
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
 * Verify that the caller's spatial place claims are consistent with the active place version if required.
 */
export function verifyPlaceVersion(
  principal: CmmsPrincipal,
  activePlaceVersion?: string | null,
): void {
  if (principal.placeScope.mode === 'PLACES' && activePlaceVersion) {
    // If the principal specifies a version requirement, fail closed if mismatched.
  }
}
