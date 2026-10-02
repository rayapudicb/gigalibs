/**
 * WI-OI-109e2 (ADR-0018 §3): the kernel worker's view of a published organization version, as modules receive it:
 * the tree and checksum, then every unit with its parent, code, name, order, status, and whether its type holds records. Read
 * tenant-scoped; only a published version is ever sent. Units are in byte order, the order of the checksum.
 */

import type { OrgReplicaUnitV1 } from '@gigalibs/contracts';
import { prisma } from '@gigalibs/db';
import type { OrganizationVersionSource } from './module-call.job.js';

export const prismaOrganizationVersions: OrganizationVersionSource = {
  async version(tenantId, versionId) {
    const version = await prisma.orgHierarchyVersion.findFirst({
      where: { tenantId, id: versionId, status: 'PUBLISHED' },
      select: { versionNumber: true, checksum: true, tree: { select: { id: true, kind: true } } },
    });
    if (!version?.checksum) return null;
    const units = await prisma.$queryRaw<OrgReplicaUnitV1[]>`
      SELECT e."unitId" AS unit_id, e."parentUnitId" AS parent_unit_id, u.code, u.name, e."sortOrder" AS sort_order,
             u.status::text AS status, t."holdsRecords" AS holds_records, t.code AS type_code
        FROM org_hierarchy_edges e
        JOIN org_units u ON u."tenantId" = e."tenantId" AND u.id = e."unitId"
        JOIN org_unit_types t ON t."tenantId" = u."tenantId" AND t.id = u."typeId"
       WHERE e."tenantId" = ${tenantId} AND e."versionId" = ${versionId}
       ORDER BY e."unitId" COLLATE "C"`;
    return {
      header: { tree_id: version.tree.id, tree_kind: version.tree.kind, version_number: version.versionNumber, checksum: version.checksum },
      units,
    };
  },
};
