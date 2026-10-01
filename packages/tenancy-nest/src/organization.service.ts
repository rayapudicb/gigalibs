import { createHash } from 'node:crypto';
import {
  type ActivateOrgHierarchyV1,
  type OrgActiveVersionV1,
  type CreateOrgDraftVersionV1,
  type CreateOrgScopeGrantV1,
  type CreateOrgTreeV1,
  type CreateOrgUnitTypeV1,
  type CreateOrgUnitV1,
  MAX_ORG_GRANTS_PER_MEMBER,
  MAX_ORG_UNITS,
  type OrgAsOfQuery,
  type OrgEdgeListQuery,
  type OrgEdgeViewV1,
  type OrgGrantListQuery,
  type OrgHierarchyActivationV1,
  type OrgHierarchyVersionDetailV1,
  type OrgHierarchyVersionV1,
  type OrgImpactV1,
  type OrgPage,
  type OrgRecordStatusChangeV1,
  type OrgScopeGrantV1,
  type OrgTreeV1,
  type OrgUnitListQuery,
  type OrgUnitTypeV1,
  type OrgUnitV1,
  type OrgValidationResultV1,
  type OrgVersionCheckV1,
  type OrgVersionTransitionV1,
  type RevokeOrgScopeGrantV1,
  type UpdateOrgDraftEdgesV1,
  type UpdateOrgUnitTypeV1,
  type UpdateOrgUnitV1,
} from '@gigalibs/contracts';
import { Prisma, prisma } from '@gigalibs/db';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';

// WI-OI-109c (ADR-0018): the organization hierarchy's administration. Every transaction runs as the NOLOGIN
// `gigalibs_org_tenant` role with the tenant set, so forced row-level security bounds every organization query;
// audit, outbox and membership reads step out to the control plane for one statement at a time. Drafts never affect
// runtime: a version is validated, submitted, approved by a second person, published (closure and checksum built
// once) and activated from an effective time.

type Tx = Prisma.TransactionClient;
type ControlStep = <R>(step: () => Promise<R>) => Promise<R>;
type Page<T> = OrgPage<T>;

const ORG_ROLE = 'gigalibs_org_tenant';
/** Activations and grants may start this much before the server's clock (client clock skew), never earlier. */
const PAST_TOLERANCE_MS = 60_000;
/** Lists in an impact report are capped; totals stay exact. */
const IMPACT_LIST_LIMIT = 500;

type UnitTypeRow = Awaited<ReturnType<Tx['orgUnitType']['findFirstOrThrow']>>;
type UnitRow = Prisma.OrgUnitGetPayload<{ include: { type: { select: { code: true; capabilities: true } } } }>;
type VersionRow = Awaited<ReturnType<Tx['orgHierarchyVersion']['findFirstOrThrow']>>;
type GrantRow = Awaited<ReturnType<Tx['orgScopeGrant']['findFirstOrThrow']>>;


@Injectable()
export class OrganizationService {
  // ─── Unit types ────────────────────────────────────────────────────────────────────────────────────────────

  async listUnitTypes(tenantId: string): Promise<OrgUnitTypeV1[]> {
    return this.run(tenantId, async (tx) =>
      (await tx.orgUnitType.findMany({ where: { tenantId }, orderBy: [{ code: 'asc' }] })).map(toUnitType),
    );
  }

  async createUnitType(tenantId: string, actorId: string, dto: CreateOrgUnitTypeV1): Promise<OrgUnitTypeV1> {
    return this.run(tenantId, async (tx, control) => {
      if (await tx.orgUnitType.findFirst({ where: { tenantId, code: dto.code }, select: { id: true } }))
        throw new ConflictException(`A unit type with code '${dto.code}' already exists.`);
      await this.assertParentTypes(tx, tenantId, dto.code, dto.allowedParentTypeCodes ?? []);
      const created = await tx.orgUnitType.create({
        data: {
          tenantId,
          code: dto.code,
          labelOne: dto.labels.one,
          labelOther: dto.labels.other,
          holdsRecords: dto.holdsRecords,
          capabilities: dto.capabilities ?? [],
          allowedParentTypeCodes: dto.allowedParentTypeCodes ?? [],
          allowAsRoot: dto.allowAsRoot ?? false,
          description: dto.description ?? null,
          createdById: actorId,
          updatedById: actorId,
        },
      });
      await this.record(tx, control, tenantId, actorId, {
        action: 'CREATE',
        resource: 'organization-unit-type',
        resourceId: created.id,
        after: created,
        event: unitTypeEvent(created),
      });
      return toUnitType(created);
    });
  }

  async updateUnitType(tenantId: string, actorId: string, id: string, dto: UpdateOrgUnitTypeV1): Promise<OrgUnitTypeV1> {
    return this.run(tenantId, async (tx, control) => {
      const current = await this.requireUnitType(tx, tenantId, id);
      if (current.status === 'ARCHIVED') throw new ConflictException('Restore the unit type before changing it.');
      if (dto.allowedParentTypeCodes) await this.assertParentTypes(tx, tenantId, current.code, dto.allowedParentTypeCodes);
      const allowAsRoot = dto.allowAsRoot ?? current.allowAsRoot;
      const parents = dto.allowedParentTypeCodes ?? current.allowedParentTypeCodes;
      if (!allowAsRoot && parents.length === 0)
        throw new UnprocessableEntityException('A type must be allowed at the top or under at least one parent type.');
      if (dto.holdsRecords !== undefined && dto.holdsRecords !== current.holdsRecords) {
        // Records owned by units of this type live in modules; changing what the type means would strand them.
        const inUse = await tx.orgUnit.count({ where: { tenantId, typeId: id, status: { not: 'ARCHIVED' } } });
        if (inUse > 0)
          throw new ConflictException('Whether a type holds records cannot change while it has units; create another type.');
      }
      if (dto.capabilities && current.capabilities.includes('LEGAL_ENTITY') && !dto.capabilities.includes('LEGAL_ENTITY')) {
        const legal = await tx.orgUnit.count({ where: { tenantId, typeId: id, NOT: { legal: { equals: Prisma.AnyNull } } } });
        if (legal > 0) throw new ConflictException('Remove the legal details from its units before removing the legal-entity capability.');
      }
      const updated = await this.updateVersioned(tx, 'orgUnitType', tenantId, id, dto.expectedVersion, {
        ...(dto.labels ? { labelOne: dto.labels.one, labelOther: dto.labels.other } : {}),
        ...(dto.holdsRecords !== undefined ? { holdsRecords: dto.holdsRecords } : {}),
        ...(dto.capabilities ? { capabilities: dto.capabilities } : {}),
        ...(dto.allowedParentTypeCodes ? { allowedParentTypeCodes: dto.allowedParentTypeCodes } : {}),
        ...(dto.allowAsRoot !== undefined ? { allowAsRoot: dto.allowAsRoot } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        updatedById: actorId,
      });
      const after = await this.requireUnitType(tx, tenantId, updated);
      await this.record(tx, control, tenantId, actorId, {
        action: 'UPDATE',
        resource: 'organization-unit-type',
        resourceId: id,
        before: current,
        after,
        reason: dto.reason,
        event: unitTypeEvent(after),
      });
      return toUnitType(after);
    });
  }

  async setUnitTypeArchived(
    tenantId: string,
    actorId: string,
    id: string,
    archived: boolean,
    dto: OrgRecordStatusChangeV1,
  ): Promise<OrgUnitTypeV1> {
    return this.run(tenantId, async (tx, control) => {
      const current = await this.requireUnitType(tx, tenantId, id);
      if ((current.status === 'ARCHIVED') === archived)
        throw new ConflictException(archived ? 'The unit type is already archived.' : 'The unit type is not archived.');
      if (archived && (await tx.orgUnit.count({ where: { tenantId, typeId: id, status: { not: 'ARCHIVED' } } })) > 0)
        throw new ConflictException('Archive or retype its units before archiving the unit type.');
      await this.updateVersioned(tx, 'orgUnitType', tenantId, id, dto.expectedVersion, {
        status: archived ? 'ARCHIVED' : 'ACTIVE',
        updatedById: actorId,
      });
      const after = await this.requireUnitType(tx, tenantId, id);
      await this.record(tx, control, tenantId, actorId, {
        action: 'STATUS_CHANGE',
        resource: 'organization-unit-type',
        resourceId: id,
        before: current,
        after,
        reason: dto.reason,
        event: unitTypeEvent(after),
      });
      return toUnitType(after);
    });
  }

  // ─── Units ─────────────────────────────────────────────────────────────────────────────────────────────────

  async listUnits(tenantId: string, query: OrgUnitListQuery): Promise<Page<OrgUnitV1>> {
    return this.run(tenantId, async (tx) => {
      const rows = await tx.orgUnit.findMany({
        where: {
          tenantId,
          ...(query.status ? { status: query.status } : {}),
          ...(query.typeCode ? { type: { code: query.typeCode } } : {}),
          ...(query.q
            ? { OR: [{ code: { contains: query.q, mode: 'insensitive' } }, { name: { contains: query.q, mode: 'insensitive' } }] }
            : {}),
          ...(query.cursor ? { id: { gt: query.cursor } } : {}),
        },
        include: { type: { select: { code: true, capabilities: true } } },
        orderBy: [{ id: 'asc' }],
        take: query.limit + 1,
      });
      return page(rows.map(toUnit), query.limit, (unit) => unit.id);
    });
  }

  async getUnit(tenantId: string, id: string): Promise<OrgUnitV1> {
    return this.run(tenantId, async (tx) => toUnit(await this.requireUnit(tx, tenantId, id)));
  }

  async createUnit(tenantId: string, actorId: string, dto: CreateOrgUnitV1): Promise<OrgUnitV1> {
    return this.run(tenantId, async (tx, control) => {
      // Serialises unit creation per tenant so the unit ceiling holds under concurrency.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`org-units:${tenantId}`}, 0))`;
      const type = await tx.orgUnitType.findFirst({ where: { tenantId, code: dto.typeCode } });
      if (!type || type.status !== 'ACTIVE') throw new UnprocessableEntityException(`No active unit type '${dto.typeCode}'.`);
      if (dto.legal && !type.capabilities.includes('LEGAL_ENTITY'))
        throw new UnprocessableEntityException(`A ${type.labelOne} is not a legal entity; legal details are not allowed.`);
      if ((await tx.orgUnit.count({ where: { tenantId } })) >= MAX_ORG_UNITS)
        throw new UnprocessableEntityException(`A tenant holds at most ${MAX_ORG_UNITS} organization units.`);
      if (await tx.orgUnit.findFirst({ where: { tenantId, code: dto.code }, select: { id: true } }))
        throw new ConflictException(`A unit with code '${dto.code}' already exists.`);
      if (dto.managerUserId) await this.assertActiveMember(tx, control, tenantId, dto.managerUserId, 'The manager');
      const created = await tx.orgUnit.create({
        data: {
          tenantId,
          typeId: type.id,
          code: dto.code,
          name: dto.name,
          effectiveFrom: toDate(dto.effectiveFrom),
          effectiveTo: dto.effectiveTo ? toDate(dto.effectiveTo) : null,
          timeZone: dto.timeZone ?? null,
          contact: nullableJson(dto.contact),
          managerUserId: dto.managerUserId ?? null,
          address: nullableJson(dto.address),
          legal: nullableJson(dto.legal),
          createdById: actorId,
          updatedById: actorId,
        },
        include: { type: { select: { code: true, capabilities: true } } },
      });
      await this.record(tx, control, tenantId, actorId, {
        action: 'CREATE',
        resource: 'organization-unit',
        resourceId: created.id,
        after: created,
        event: unitEvent(created),
      });
      return toUnit(created);
    });
  }

  async updateUnit(tenantId: string, actorId: string, id: string, dto: UpdateOrgUnitV1): Promise<OrgUnitV1> {
    return this.run(tenantId, async (tx, control) => {
      const current = await this.requireUnit(tx, tenantId, id);
      if (current.status === 'ARCHIVED') throw new ConflictException('Restore the unit before changing it.');
      if (dto.legal && !current.type.capabilities.includes('LEGAL_ENTITY'))
        throw new UnprocessableEntityException('This unit type is not a legal entity; legal details are not allowed.');
      if (dto.code && dto.code !== current.code && (await tx.orgUnit.findFirst({ where: { tenantId, code: dto.code }, select: { id: true } })))
        throw new ConflictException(`A unit with code '${dto.code}' already exists.`);
      if (dto.managerUserId) await this.assertActiveMember(tx, control, tenantId, dto.managerUserId, 'The manager');
      const effectiveFrom = dto.effectiveFrom ?? date(current.effectiveFrom);
      const effectiveTo = dto.effectiveTo !== undefined ? dto.effectiveTo : current.effectiveTo ? date(current.effectiveTo) : null;
      if (effectiveTo && effectiveTo <= effectiveFrom) throw new UnprocessableEntityException('The end date must be after the start date.');
      await this.updateVersioned(tx, 'orgUnit', tenantId, id, dto.expectedVersion, {
        ...(dto.code !== undefined ? { code: dto.code } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.effectiveFrom !== undefined ? { effectiveFrom: toDate(dto.effectiveFrom) } : {}),
        ...(dto.effectiveTo !== undefined ? { effectiveTo: dto.effectiveTo ? toDate(dto.effectiveTo) : null } : {}),
        ...(dto.timeZone !== undefined ? { timeZone: dto.timeZone } : {}),
        ...(dto.contact !== undefined ? { contact: nullableJson(dto.contact) } : {}),
        ...(dto.managerUserId !== undefined ? { managerUserId: dto.managerUserId } : {}),
        ...(dto.address !== undefined ? { address: nullableJson(dto.address) } : {}),
        ...(dto.legal !== undefined ? { legal: nullableJson(dto.legal) } : {}),
        updatedById: actorId,
      });
      const after = await this.requireUnit(tx, tenantId, id);
      await this.record(tx, control, tenantId, actorId, {
        action: 'UPDATE',
        resource: 'organization-unit',
        resourceId: id,
        before: current,
        after,
        reason: dto.reason,
        event: unitEvent(after),
      });
      return toUnit(after);
    });
  }

  async setUnitArchived(tenantId: string, actorId: string, id: string, archived: boolean, dto: OrgRecordStatusChangeV1): Promise<OrgUnitV1> {
    return this.run(tenantId, async (tx, control) => {
      const current = await this.requireUnit(tx, tenantId, id);
      if ((current.status === 'ARCHIVED') === archived)
        throw new ConflictException(archived ? 'The unit is already archived.' : 'The unit is not archived.');
      if (archived) {
        // A unit leaves the organization through a published version first; archiving never changes a live tree.
        const placed = await tx.$queryRaw<Array<{ versionId: string }>>`
          SELECT e."versionId" FROM org_hierarchy_edges e
            JOIN org_hierarchy_versions v ON v."tenantId" = e."tenantId" AND v.id = e."versionId"
           WHERE e."tenantId" = ${tenantId} AND e."unitId" = ${id}
             AND (v.status IN ('DRAFT', 'VALIDATED', 'SUBMITTED', 'APPROVED')
                  OR v.id IN (
                       (SELECT DISTINCT ON (a."treeId") a."versionId" FROM org_hierarchy_activations a
                         WHERE a."tenantId" = ${tenantId} AND a."effectiveFrom" <= now()
                         ORDER BY a."treeId", a."effectiveFrom" DESC)
                       UNION
                       (SELECT a."versionId" FROM org_hierarchy_activations a
                         WHERE a."tenantId" = ${tenantId} AND a."effectiveFrom" > now())))
           LIMIT 1`;
        if (placed.length > 0)
          throw new ConflictException('The unit is placed in an active, scheduled or open version; remove it through a new version first.');
        if ((await tx.orgScopeGrant.count({ where: { tenantId, unitId: id, revokedAt: null } })) > 0)
          throw new ConflictException('Revoke the grants on this unit before archiving it.');
      } else {
        const type = await this.requireUnitType(tx, tenantId, current.typeId);
        if (type.status !== 'ACTIVE') throw new ConflictException('Restore its unit type first.');
      }
      await this.updateVersioned(tx, 'orgUnit', tenantId, id, dto.expectedVersion, {
        status: archived ? 'ARCHIVED' : 'ACTIVE',
        updatedById: actorId,
      });
      const after = await this.requireUnit(tx, tenantId, id);
      await this.record(tx, control, tenantId, actorId, {
        action: 'STATUS_CHANGE',
        resource: 'organization-unit',
        resourceId: id,
        before: current,
        after,
        reason: dto.reason,
        event: unitEvent(after),
      });
      return toUnit(after);
    });
  }

  // ─── Trees and versions ────────────────────────────────────────────────────────────────────────────────────

  async listTrees(tenantId: string): Promise<OrgTreeV1[]> {
    return this.run(tenantId, async (tx) =>
      (await tx.orgTree.findMany({ where: { tenantId }, orderBy: [{ kind: 'asc' }, { code: 'asc' }] })).map(toTree),
    );
  }

  async createTree(tenantId: string, actorId: string, dto: CreateOrgTreeV1): Promise<OrgTreeV1> {
    return this.run(tenantId, async (tx, control) => {
      if (dto.kind === 'PRIMARY' && (await tx.orgTree.findFirst({ where: { tenantId, kind: 'PRIMARY' }, select: { id: true } })))
        throw new ConflictException('A tenant has one primary tree.');
      if (await tx.orgTree.findFirst({ where: { tenantId, code: dto.code }, select: { id: true } }))
        throw new ConflictException(`A tree with code '${dto.code}' already exists.`);
      const created = await tx.orgTree.create({ data: { tenantId, ...dto, createdById: actorId } });
      await this.record(tx, control, tenantId, actorId, { action: 'CREATE', resource: 'organization-tree', resourceId: created.id, after: created });
      return toTree(created);
    });
  }

  async listVersions(tenantId: string, treeId: string): Promise<OrgHierarchyVersionV1[]> {
    return this.run(tenantId, async (tx) => {
      await this.requireTree(tx, tenantId, treeId);
      return (await tx.orgHierarchyVersion.findMany({ where: { tenantId, treeId }, orderBy: [{ versionNumber: 'desc' }], take: 100 })).map(toVersion);
    });
  }

  async getVersion(tenantId: string, id: string): Promise<OrgHierarchyVersionDetailV1> {
    return this.run(tenantId, async (tx) => {
      const version = await this.requireVersion(tx, tenantId, id);
      const unitCount = await tx.orgHierarchyEdge.count({ where: { tenantId, versionId: id } });
      return { ...toVersion(version), unitCount };
    });
  }

  async createDraft(tenantId: string, actorId: string, treeId: string, dto: CreateOrgDraftVersionV1): Promise<OrgHierarchyVersionV1> {
    return this.run(tenantId, async (tx, control) => {
      const tree = await this.requireTree(tx, tenantId, treeId);
      if (tree.status !== 'ACTIVE') throw new ConflictException('The tree is archived.');
      if (await tx.orgHierarchyVersion.findFirst({ where: { tenantId, treeId, status: { in: ['DRAFT', 'VALIDATED', 'SUBMITTED', 'APPROVED'] } }, select: { id: true } }))
        throw new ConflictException('This tree already has an open draft; finish or withdraw it first.');
      let basedOnVersionId = dto.basedOnVersionId;
      if (basedOnVersionId === undefined) basedOnVersionId = (await this.activeAt(tx, tenantId, treeId, new Date()))?.versionId ?? null;
      if (basedOnVersionId) {
        const base = await this.requireVersion(tx, tenantId, basedOnVersionId);
        if (base.treeId !== treeId || base.status !== 'PUBLISHED')
          throw new UnprocessableEntityException('A draft starts from a published version of the same tree.');
      }
      const last = await tx.orgHierarchyVersion.aggregate({ where: { tenantId, treeId }, _max: { versionNumber: true } });
      const created = await tx.orgHierarchyVersion.create({
        data: {
          tenantId,
          treeId,
          versionNumber: (last._max.versionNumber ?? 0) + 1,
          basedOnVersionId: basedOnVersionId ?? null,
          reason: dto.reason ?? null,
          createdById: actorId,
        },
      });
      if (basedOnVersionId)
        await tx.$executeRaw`
          INSERT INTO org_hierarchy_edges ("tenantId", "versionId", "unitId", "parentUnitId", "sortOrder")
          SELECT "tenantId", ${created.id}, "unitId", "parentUnitId", "sortOrder" FROM org_hierarchy_edges
           WHERE "tenantId" = ${tenantId} AND "versionId" = ${basedOnVersionId}`;
      await this.record(tx, control, tenantId, actorId, {
        action: 'CREATE',
        resource: 'organization-hierarchy-version',
        resourceId: created.id,
        after: created,
        reason: dto.reason,
      });
      return toVersion(created);
    });
  }

  /** One level of a version: its roots, or the children of one unit; ordered by sort order, then id. */
  async listEdges(tenantId: string, versionId: string, query: OrgEdgeListQuery): Promise<Page<OrgEdgeViewV1>> {
    return this.run(tenantId, async (tx) => {
      await this.requireVersion(tx, tenantId, versionId);
      const [afterSort, afterUnit] = parseEdgeCursor(query.cursor);
      const parent = query.parentUnitId
        ? Prisma.sql`e."parentUnitId" = ${query.parentUnitId}`
        : Prisma.sql`e."parentUnitId" IS NULL`;
      const rows = await tx.$queryRaw<OrgEdgeViewV1[]>`
        SELECT e."unitId", e."parentUnitId", e."sortOrder", u.code, u.name, u.status::text AS status,
               t.code AS "typeCode", t."holdsRecords",
               (SELECT count(*)::int FROM org_hierarchy_edges c
                 WHERE c."tenantId" = e."tenantId" AND c."versionId" = e."versionId" AND c."parentUnitId" = e."unitId") AS "childCount"
          FROM org_hierarchy_edges e
          JOIN org_units u ON u."tenantId" = e."tenantId" AND u.id = e."unitId"
          JOIN org_unit_types t ON t."tenantId" = u."tenantId" AND t.id = u."typeId"
         WHERE e."tenantId" = ${tenantId} AND e."versionId" = ${versionId} AND ${parent}
           AND (${afterUnit}::text IS NULL OR (e."sortOrder", e."unitId") > (${afterSort}::int, ${afterUnit}::text))
         ORDER BY e."sortOrder", e."unitId"
         LIMIT ${query.limit + 1}`;
      return page(rows, query.limit, (edge) => `${edge.sortOrder}~${edge.unitId}`);
    });
  }

  async updateEdges(tenantId: string, actorId: string, versionId: string, dto: UpdateOrgDraftEdgesV1): Promise<OrgHierarchyVersionV1> {
    return this.run(tenantId, async (tx, control) => {
      const version = await this.requireVersion(tx, tenantId, versionId);
      if (version.status !== 'DRAFT' && version.status !== 'VALIDATED')
        throw new ConflictException('Only an open draft can change; this version is ' + version.status.toLowerCase() + '.');
      if (version.lockVersion !== dto.expectedVersion) throw new ConflictException('The draft changed; reload it before continuing.');
      const unitIds = [...new Set([...dto.upsert.flatMap((edge) => [edge.unitId, ...(edge.parentUnitId ? [edge.parentUnitId] : [])])])];
      if (unitIds.length > 0) {
        const known = await tx.orgUnit.findMany({ where: { tenantId, id: { in: unitIds } }, select: { id: true, status: true } });
        const missing = unitIds.filter((unitId) => !known.some((unit) => unit.id === unitId));
        if (missing.length > 0) throw new UnprocessableEntityException(`Unknown units: ${missing.slice(0, 20).join(', ')}.`);
        const archived = known.filter((unit) => unit.status === 'ARCHIVED').map((unit) => unit.id);
        if (archived.length > 0) throw new UnprocessableEntityException(`Archived units cannot be placed: ${archived.slice(0, 20).join(', ')}.`);
      }
      if (dto.remove.length > 0) {
        const orphaned = await tx.orgHierarchyEdge.findMany({
          where: { tenantId, versionId, parentUnitId: { in: dto.remove }, unitId: { notIn: [...dto.remove, ...dto.upsert.map((edge) => edge.unitId)] } },
          select: { unitId: true, parentUnitId: true },
          take: 20,
        });
        if (orphaned.length > 0)
          throw new UnprocessableEntityException(`Move or remove the children first: ${orphaned.map((edge) => edge.unitId).join(', ')}.`);
        // Children moved away in the same change get their new parent before the old one goes.
      }
      if (dto.upsert.length > 0) {
        await tx.$executeRaw`
          INSERT INTO org_hierarchy_edges ("tenantId", "versionId", "unitId", "parentUnitId", "sortOrder")
          SELECT ${tenantId}, ${versionId}, change."unitId", change."parentUnitId", change."sortOrder"
            FROM unnest(${dto.upsert.map((edge) => edge.unitId)}::text[], ${dto.upsert.map((edge) => edge.parentUnitId)}::text[],
                        ${dto.upsert.map((edge) => edge.sortOrder ?? 0)}::int[]) AS change("unitId", "parentUnitId", "sortOrder")
          ON CONFLICT ("tenantId", "versionId", "unitId")
          DO UPDATE SET "parentUnitId" = EXCLUDED."parentUnitId", "sortOrder" = EXCLUDED."sortOrder"`;
      }
      if (dto.remove.length > 0)
        await tx.orgHierarchyEdge.deleteMany({ where: { tenantId, versionId, unitId: { in: dto.remove } } });
      const missingParents = await tx.$queryRaw<Array<{ unitId: string }>>`
        SELECT e."unitId" FROM org_hierarchy_edges e
         WHERE e."tenantId" = ${tenantId} AND e."versionId" = ${versionId} AND e."parentUnitId" IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM org_hierarchy_edges p
                            WHERE p."tenantId" = e."tenantId" AND p."versionId" = e."versionId" AND p."unitId" = e."parentUnitId")
         LIMIT 20`;
      if (missingParents.length > 0)
        throw new UnprocessableEntityException(`Place each parent in the draft first: ${missingParents.map((edge) => edge.unitId).join(', ')}.`);
      const updated = await this.moveVersion(tx, tenantId, version, 'DRAFT', {});
      await this.record(tx, control, tenantId, actorId, {
        action: 'UPDATE',
        resource: 'organization-hierarchy-version',
        resourceId: versionId,
        after: { upsert: dto.upsert.length, remove: dto.remove.length, lockVersion: updated.lockVersion },
      });
      return toVersion(updated);
    });
  }

  async validate(tenantId: string, actorId: string, versionId: string, dto: OrgVersionCheckV1): Promise<OrgValidationResultV1> {
    return this.run(tenantId, async (tx, control) => {
      const version = await this.requireOpen(tx, tenantId, versionId, dto.expectedVersion, ['DRAFT', 'VALIDATED']);
      const problems = await this.problems(tx, tenantId, versionId);
      const updated = await this.moveVersion(tx, tenantId, version, problems.length === 0 ? 'VALIDATED' : 'DRAFT', {});
      await this.record(tx, control, tenantId, actorId, {
        action: 'STATUS_CHANGE',
        resource: 'organization-hierarchy-version',
        resourceId: versionId,
        before: { status: version.status },
        after: { status: updated.status, problems: problems.length },
      });
      return { valid: problems.length === 0, status: updated.status, lockVersion: updated.lockVersion, problems };
    });
  }

  async submit(tenantId: string, actorId: string, versionId: string, dto: OrgVersionTransitionV1): Promise<OrgHierarchyVersionV1> {
    return this.transition(tenantId, actorId, versionId, dto, ['VALIDATED'], 'SUBMITTED', async (tx) => {
      await this.assertValid(tx, tenantId, versionId);
      return { submittedById: actorId, submittedAt: new Date() };
    });
  }

  async withdraw(tenantId: string, actorId: string, versionId: string, dto: OrgVersionTransitionV1): Promise<OrgHierarchyVersionV1> {
    return this.transition(tenantId, actorId, versionId, dto, ['DRAFT', 'VALIDATED'], 'REJECTED', async () => ({ rejectedById: actorId }));
  }

  async approve(tenantId: string, actorId: string, versionId: string, dto: OrgVersionTransitionV1): Promise<OrgHierarchyVersionV1> {
    return this.transition(tenantId, actorId, versionId, dto, ['SUBMITTED'], 'APPROVED', async (_tx, version) => {
      if (version.createdById === actorId || version.submittedById === actorId)
        throw new ForbiddenException('A second person approves: the author or submitter cannot approve this version.');
      return { approvedById: actorId, approvedAt: new Date() };
    });
  }

  async reject(tenantId: string, actorId: string, versionId: string, dto: OrgVersionTransitionV1): Promise<OrgHierarchyVersionV1> {
    return this.transition(tenantId, actorId, versionId, dto, ['SUBMITTED', 'APPROVED'], 'REJECTED', async () => ({ rejectedById: actorId }));
  }

  /** Builds the closure and checksum once, then freezes the version. Activation is a separate, dated step. */
  async publish(tenantId: string, actorId: string, versionId: string, dto: OrgVersionTransitionV1): Promise<OrgHierarchyVersionV1> {
    return this.transition(tenantId, actorId, versionId, dto, ['APPROVED'], 'PUBLISHED', async (tx) => {
      await this.assertValid(tx, tenantId, versionId);
      await tx.$executeRaw`
        WITH RECURSIVE up AS (
          SELECT e."unitId" AS descendant, e."unitId" AS ancestor, 0 AS depth
            FROM org_hierarchy_edges e WHERE e."tenantId" = ${tenantId} AND e."versionId" = ${versionId}
          UNION ALL
          SELECT up.descendant, e."parentUnitId", up.depth + 1
            FROM up JOIN org_hierarchy_edges e
              ON e."tenantId" = ${tenantId} AND e."versionId" = ${versionId} AND e."unitId" = up.ancestor
           WHERE e."parentUnitId" IS NOT NULL AND up.depth < 16
        )
        INSERT INTO org_hierarchy_closure ("tenantId", "versionId", "ancestorUnitId", "descendantUnitId", depth)
        SELECT ${tenantId}, ${versionId}, ancestor, descendant, depth FROM up`;
      const [row] = await tx.$queryRaw<Array<{ checksum: string }>>`
        SELECT 'sha256:' || encode(sha256(convert_to(coalesce(
                 string_agg("unitId" || '>' || coalesce("parentUnitId", '') || '#' || "sortOrder", E'\n' ORDER BY "unitId"), ''), 'UTF8')), 'hex') AS checksum
          FROM org_hierarchy_edges WHERE "tenantId" = ${tenantId} AND "versionId" = ${versionId}`;
      return { publishedById: actorId, publishedAt: new Date(), checksum: row?.checksum ?? null };
    });
  }

  async activate(tenantId: string, actorId: string, dto: ActivateOrgHierarchyV1): Promise<OrgHierarchyActivationV1> {
    return this.idempotent(tenantId, actorId, 'organization.activate', dto, async (tx, control) => {
      const version = await this.requireVersion(tx, tenantId, dto.versionId);
      if (version.status !== 'PUBLISHED') throw new ConflictException('Only a published version can be activated.');
      const tree = await this.requireTree(tx, tenantId, version.treeId);
      const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();
      if (effectiveFrom.getTime() < Date.now() - PAST_TOLERANCE_MS)
        throw new UnprocessableEntityException('An activation starts now or later; history is never rewritten.');
      if (await tx.orgHierarchyActivation.findFirst({ where: { tenantId, treeId: tree.id, effectiveFrom }, select: { id: true } }))
        throw new ConflictException('Another activation of this tree starts at that time.');
      const created = await tx.orgHierarchyActivation.create({
        data: { tenantId, treeId: tree.id, versionId: version.id, effectiveFrom, reason: dto.reason, activatedById: actorId },
      });
      await this.record(tx, control, tenantId, actorId, {
        action: 'CREATE',
        resource: 'organization-hierarchy-activation',
        resourceId: created.id,
        after: created,
        reason: dto.reason,
        event: {
          type: 'organization.hierarchy.activated.v1',
          aggregateType: 'organization_tree',
          aggregateId: tree.id,
          aggregateVersion: version.versionNumber,
          payload: {
            activationId: created.id,
            treeId: tree.id,
            treeKind: tree.kind,
            versionId: version.id,
            versionNumber: version.versionNumber,
            checksum: version.checksum,
            effectiveFrom: created.effectiveFrom.toISOString(),
          },
        },
      });
      return toActivation(created);
    });
  }

  /** The version in force for a tree at a moment (now by default), from the activation history. */
  async getActive(tenantId: string, treeId: string, query: OrgAsOfQuery): Promise<OrgActiveVersionV1> {
    return this.run(tenantId, async (tx) => {
      await this.requireTree(tx, tenantId, treeId);
      const asOf = query.asOf ? new Date(query.asOf) : new Date();
      const activation = await this.activeAt(tx, tenantId, treeId, asOf);
      if (!activation) throw new NotFoundException('No version of this tree was active at that time.');
      return { asOf: asOf.toISOString(), activation: toActivation(activation), version: toVersion(await this.requireVersion(tx, tenantId, activation.versionId)) };
    });
  }

  async listActivations(tenantId: string, treeId: string): Promise<OrgHierarchyActivationV1[]> {
    return this.run(tenantId, async (tx) => {
      await this.requireTree(tx, tenantId, treeId);
      return (await tx.orgHierarchyActivation.findMany({ where: { tenantId, treeId }, orderBy: [{ effectiveFrom: 'desc' }], take: 100 })).map(toActivation);
    });
  }

  /** What activating this version would change against the tree's version in force now. */
  async impact(tenantId: string, versionId: string): Promise<OrgImpactV1> {
    return this.run(tenantId, async (tx) => {
      const version = await this.requireVersion(tx, tenantId, versionId);
      const tree = await this.requireTree(tx, tenantId, version.treeId);
      const active = await this.activeAt(tx, tenantId, version.treeId, new Date());
      const compared = active && active.versionId !== versionId ? active.versionId : null;
      const changes = await tx.$queryRaw<Array<{ unitId: string; change: 'added' | 'removed' | 'moved'; fromParent: string | null; toParent: string | null }>>`
        SELECT coalesce(n."unitId", o."unitId") AS "unitId",
               CASE WHEN o."unitId" IS NULL THEN 'added' WHEN n."unitId" IS NULL THEN 'removed' ELSE 'moved' END AS change,
               o."parentUnitId" AS "fromParent", n."parentUnitId" AS "toParent"
          FROM (SELECT "unitId", "parentUnitId" FROM org_hierarchy_edges WHERE "tenantId" = ${tenantId} AND "versionId" = ${versionId}) n
          FULL JOIN (SELECT "unitId", "parentUnitId" FROM org_hierarchy_edges WHERE "tenantId" = ${tenantId} AND "versionId" = ${compared}) o
            ON o."unitId" = n."unitId"
         WHERE o."unitId" IS NULL OR n."unitId" IS NULL OR o."parentUnitId" IS DISTINCT FROM n."parentUnitId"
         ORDER BY 1`;
      const changed = changes.map((change) => change.unitId);
      // A grant is affected when a changed unit sits at or below its unit in the old tree or the new one.
      const affected =
        tree.kind !== 'PRIMARY' || changed.length === 0
          ? []
          : await tx.$queryRaw<Array<{ grantId: string; userId: string; unitId: string; access: 'READ' | 'READ_WRITE' }>>`
              WITH RECURSIVE new_up AS (
                SELECT e."unitId" AS unit, e."parentUnitId" AS parent, 0 AS depth FROM org_hierarchy_edges e
                 WHERE e."tenantId" = ${tenantId} AND e."versionId" = ${versionId} AND e."unitId" = ANY(${changed}::text[])
                UNION
                SELECT e."unitId", e."parentUnitId", new_up.depth + 1 FROM new_up JOIN org_hierarchy_edges e
                    ON e."tenantId" = ${tenantId} AND e."versionId" = ${versionId} AND e."unitId" = new_up.parent
                 WHERE new_up.depth < 17
              ),
              touched AS (
                SELECT unit FROM new_up
                UNION SELECT c."ancestorUnitId" FROM org_hierarchy_closure c
                 WHERE c."tenantId" = ${tenantId} AND c."versionId" = ${compared} AND c."descendantUnitId" = ANY(${changed}::text[])
                UNION SELECT unnest(${changed}::text[])
              )
              SELECT g.id AS "grantId", g."userId", g."unitId", g.access::text AS access FROM org_scope_grants g
               WHERE g."tenantId" = ${tenantId} AND g."revokedAt" IS NULL AND (g."effectiveTo" IS NULL OR g."effectiveTo" > now())
                 AND g."unitId" IN (SELECT unit FROM touched)
               ORDER BY g."userId", g."unitId"`;
      const of = (kind: string) => changes.filter((change) => change.change === kind);
      return {
        versionId,
        comparedWithVersionId: compared,
        totals: { added: of('added').length, removed: of('removed').length, moved: of('moved').length, affectedGrants: affected.length },
        added: of('added').slice(0, IMPACT_LIST_LIMIT).map((change) => change.unitId),
        removed: of('removed').slice(0, IMPACT_LIST_LIMIT).map((change) => change.unitId),
        moved: of('moved')
          .slice(0, IMPACT_LIST_LIMIT)
          .map((change) => ({ unitId: change.unitId, fromParentUnitId: change.fromParent, toParentUnitId: change.toParent })),
        affectedGrants: affected.slice(0, IMPACT_LIST_LIMIT),
      };
    });
  }

  // ─── Member scope grants ───────────────────────────────────────────────────────────────────────────────────

  async listGrants(tenantId: string, query: OrgGrantListQuery): Promise<Page<OrgScopeGrantV1>> {
    return this.run(tenantId, async (tx) => {
      const rows = await tx.orgScopeGrant.findMany({
        where: {
          tenantId,
          ...(query.userId ? { userId: query.userId } : {}),
          ...(query.unitId ? { unitId: query.unitId } : {}),
          ...(query.includeRevoked ? {} : { revokedAt: null }),
          ...(query.cursor ? { id: { gt: query.cursor } } : {}),
        },
        orderBy: [{ id: 'asc' }],
        take: query.limit + 1,
      });
      return page(rows.map(toGrant), query.limit, (grant) => grant.id);
    });
  }

  async createGrant(tenantId: string, actorId: string, dto: CreateOrgScopeGrantV1): Promise<OrgScopeGrantV1> {
    return this.idempotent(tenantId, actorId, 'organization.grant', dto, async (tx, control) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`org-grants:${tenantId}:${dto.userId}`}, 0))`;
      await this.assertActiveMember(tx, control, tenantId, dto.userId, 'The member');
      const unit = await this.requireUnit(tx, tenantId, dto.unitId);
      if (unit.status === 'ARCHIVED') throw new UnprocessableEntityException('An archived unit cannot be granted.');
      const effectiveFrom = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();
      if (effectiveFrom.getTime() < Date.now() - PAST_TOLERANCE_MS)
        throw new UnprocessableEntityException('A grant starts now or later; access history is never rewritten.');
      const current = { tenantId, userId: dto.userId, revokedAt: null, OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }] };
      if (await tx.orgScopeGrant.findFirst({ where: { ...current, unitId: dto.unitId }, select: { id: true } }))
        throw new ConflictException('The member already holds a grant on this unit; revoke it to change the access.');
      if ((await tx.orgScopeGrant.count({ where: current })) >= MAX_ORG_GRANTS_PER_MEMBER)
        throw new UnprocessableEntityException(`A member holds at most ${MAX_ORG_GRANTS_PER_MEMBER} grants; grant a unit higher in the tree.`);
      const created = await tx.orgScopeGrant.create({
        data: {
          tenantId,
          userId: dto.userId,
          unitId: dto.unitId,
          access: dto.access,
          effectiveFrom,
          effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
          reason: dto.reason,
          grantedById: actorId,
        },
      });
      await this.record(tx, control, tenantId, actorId, {
        action: 'CREATE',
        resource: 'organization-scope-grant',
        resourceId: created.id,
        after: created,
        reason: dto.reason,
        event: grantEvent(created, 'GRANTED'),
      });
      return toGrant(created);
    });
  }

  async revokeGrant(tenantId: string, actorId: string, grantId: string, dto: RevokeOrgScopeGrantV1): Promise<OrgScopeGrantV1> {
    return this.run(tenantId, async (tx, control) => {
      const current = await tx.orgScopeGrant.findFirst({ where: { tenantId, id: grantId } });
      if (!current) throw new NotFoundException('Grant not found.');
      const revoked = await tx.orgScopeGrant.updateMany({
        where: { tenantId, id: grantId, revokedAt: null },
        data: { revokedAt: new Date(), revokedById: actorId, revokeReason: dto.reason },
      });
      if (revoked.count !== 1) throw new ConflictException('The grant is already revoked.');
      const after = await tx.orgScopeGrant.findFirstOrThrow({ where: { tenantId, id: grantId } });
      await this.record(tx, control, tenantId, actorId, {
        action: 'STATUS_CHANGE',
        resource: 'organization-scope-grant',
        resourceId: grantId,
        before: current,
        after,
        reason: dto.reason,
        event: grantEvent(after, 'REVOKED'),
      });
      return toGrant(after);
    });
  }

  // ─── Internals ─────────────────────────────────────────────────────────────────────────────────────────────

  /** One transaction under forced RLS as the tenant role; `control` runs one step as the control plane. */
  private run<T>(tenantId: string, work: (tx: Tx, control: ControlStep) => Promise<T>): Promise<T> {
    return prisma
      .$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
          await tx.$executeRawUnsafe(`SET LOCAL ROLE ${ORG_ROLE}`);
          const control: ControlStep = async (step) => {
            await tx.$executeRawUnsafe('SET LOCAL ROLE NONE');
            const result = await step();
            await tx.$executeRawUnsafe(`SET LOCAL ROLE ${ORG_ROLE}`);
            return result;
          };
          return work(tx, control);
        },
        { timeout: 60_000 },
      )
      .catch((error: unknown) => {
        throw safeError(error);
      });
  }

  /** Replays the stored response for a repeated key; a reused key with a different request is a conflict. */
  private idempotent<T extends object>(
    tenantId: string,
    actorId: string,
    operation: string,
    dto: { idempotencyKey: string },
    work: (tx: Tx, control: ControlStep) => Promise<T>,
  ): Promise<T> {
    const requestSha256 = createHash('sha256').update(canonicalJson(dto)).digest('hex');
    return this.run(tenantId, async (tx, control) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`org-idem:${tenantId}:${actorId}:${operation}:${dto.idempotencyKey}`}, 0))`;
      const key = { tenantId, actorId, operation, idempotencyKey: dto.idempotencyKey };
      const existing = await tx.orgIdempotencyRecord.findFirst({ where: key });
      if (existing) {
        if (existing.requestSha256 !== requestSha256) throw new ConflictException('This idempotency key was already used for a different request.');
        return existing.response as T;
      }
      const result = await work(tx, control);
      await tx.orgIdempotencyRecord.create({ data: { ...key, requestSha256, response: jsonValue(result), statusCode: 201 } });
      return result;
    });
  }

  private transition(
    tenantId: string,
    actorId: string,
    versionId: string,
    dto: OrgVersionTransitionV1,
    from: Array<VersionRow['status']>,
    to: VersionRow['status'],
    prepare: (tx: Tx, version: VersionRow) => Promise<Partial<VersionRow>>,
  ): Promise<OrgHierarchyVersionV1> {
    return this.run(tenantId, async (tx, control) => {
      const version = await this.requireOpen(tx, tenantId, versionId, dto.expectedVersion, from);
      const extra = await prepare(tx, version);
      const updated = await this.moveVersion(tx, tenantId, version, to, { ...extra, reason: dto.reason });
      await this.record(tx, control, tenantId, actorId, {
        action: 'STATUS_CHANGE',
        resource: 'organization-hierarchy-version',
        resourceId: versionId,
        before: { status: version.status },
        after: { status: updated.status, checksum: updated.checksum },
        reason: dto.reason,
      });
      return toVersion(updated);
    });
  }

  private async requireOpen(tx: Tx, tenantId: string, versionId: string, expected: number, from: Array<VersionRow['status']>) {
    const version = await this.requireVersion(tx, tenantId, versionId);
    if (!from.includes(version.status))
      throw new ConflictException(`This version is ${version.status.toLowerCase()}; that step needs ${from.map((s) => s.toLowerCase()).join(' or ')}.`);
    if (version.lockVersion !== expected) throw new ConflictException('The version changed; reload it before continuing.');
    return version;
  }

  private async moveVersion(tx: Tx, tenantId: string, version: VersionRow, status: VersionRow['status'], extra: Partial<VersionRow>) {
    const moved = await tx.orgHierarchyVersion.updateMany({
      where: { tenantId, id: version.id, lockVersion: version.lockVersion },
      data: { ...extra, status, lockVersion: { increment: 1 }, updatedAt: new Date() },
    });
    if (moved.count !== 1) throw new ConflictException('The version changed; reload it before continuing.');
    return this.requireVersion(tx, tenantId, version.id);
  }

  private async problems(tx: Tx, tenantId: string, versionId: string): Promise<OrgValidationResultV1['problems']> {
    return tx.$queryRaw<OrgValidationResultV1['problems']>`
      SELECT code, "unitId", detail FROM org_validate_hierarchy_version(${tenantId}, ${versionId}) ORDER BY code, "unitId" LIMIT 500`;
  }

  private async assertValid(tx: Tx, tenantId: string, versionId: string) {
    const problems = await this.problems(tx, tenantId, versionId);
    if (problems.length > 0)
      throw new UnprocessableEntityException({ message: 'The version no longer passes validation; return it to draft and fix it.', problems });
  }

  private activeAt(tx: Tx, tenantId: string, treeId: string, at: Date) {
    return tx.orgHierarchyActivation.findFirst({ where: { tenantId, treeId, effectiveFrom: { lte: at } }, orderBy: [{ effectiveFrom: 'desc' }] });
  }

  private async assertParentTypes(tx: Tx, tenantId: string, ownCode: string, codes: string[]) {
    const others = codes.filter((code) => code !== ownCode);
    if (others.length === 0) return;
    const found = await tx.orgUnitType.findMany({ where: { tenantId, code: { in: others }, status: 'ACTIVE' }, select: { code: true } });
    const missing = others.filter((code) => !found.some((type) => type.code === code));
    if (missing.length > 0) throw new UnprocessableEntityException(`Unknown or archived parent types: ${missing.join(', ')}.`);
  }

  private async assertActiveMember(tx: Tx, control: ControlStep, tenantId: string, userId: string, who: string) {
    const member = await control(() => tx.tenantMember.findFirst({ where: { tenantId, userId, status: 'ACTIVE' }, select: { id: true } }));
    if (!member) throw new UnprocessableEntityException(`${who} must be an active member of this tenant.`);
  }

  private async updateVersioned(
    tx: Tx,
    model: 'orgUnitType' | 'orgUnit',
    tenantId: string,
    id: string,
    expectedVersion: number,
    data: Record<string, unknown>,
  ): Promise<string> {
    const where = { tenantId, id, version: expectedVersion };
    const update = { ...data, version: { increment: 1 }, updatedAt: new Date() };
    const result =
      model === 'orgUnitType'
        ? await tx.orgUnitType.updateMany({ where, data: update as Prisma.OrgUnitTypeUpdateManyMutationInput })
        : await tx.orgUnit.updateMany({ where, data: update as Prisma.OrgUnitUpdateManyMutationInput });
    if (result.count !== 1) throw new ConflictException('It changed since you loaded it; reload before continuing.');
    return id;
  }

  /** Audit row and, when given, an outbox event, written as the control plane in the same transaction. */
  private async record(
    tx: Tx,
    control: ControlStep,
    tenantId: string,
    actorId: string,
    entry: {
      action: 'CREATE' | 'UPDATE' | 'STATUS_CHANGE';
      resource: string;
      resourceId: string;
      before?: unknown;
      after?: unknown;
      reason?: string | undefined;
      event?: { type: string; aggregateType: string; aggregateId: string; aggregateVersion: number; payload: Record<string, unknown> };
    },
  ) {
    await control(async () => {
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actorId,
          action: entry.action,
          resource: entry.resource,
          resourceId: entry.resourceId,
          before: entry.before === undefined ? Prisma.JsonNull : jsonValue(entry.before),
          after: entry.after === undefined ? Prisma.JsonNull : jsonValue(entry.after),
          ...(entry.reason ? { metadata: { reason: entry.reason } } : {}),
        },
      });
      if (entry.event)
        await tx.platformOutboxEvent.create({
          data: {
            tenantId,
            eventType: entry.event.type,
            aggregateType: entry.event.aggregateType,
            aggregateId: entry.event.aggregateId,
            aggregateVersion: entry.event.aggregateVersion,
            payload: jsonValue(entry.event.payload),
            status: 'PENDING',
          },
        });
    });
  }

  private async requireUnitType(tx: Tx, tenantId: string, id: string): Promise<UnitTypeRow> {
    const row = await tx.orgUnitType.findFirst({ where: { tenantId, id } });
    if (!row) throw new NotFoundException('Unit type not found.');
    return row;
  }

  private async requireUnit(tx: Tx, tenantId: string, id: string): Promise<UnitRow> {
    const row = await tx.orgUnit.findFirst({ where: { tenantId, id }, include: { type: { select: { code: true, capabilities: true } } } });
    if (!row) throw new NotFoundException('Unit not found.');
    return row;
  }

  private async requireTree(tx: Tx, tenantId: string, id: string) {
    const row = await tx.orgTree.findFirst({ where: { tenantId, id } });
    if (!row) throw new NotFoundException('Tree not found.');
    return row;
  }

  private async requireVersion(tx: Tx, tenantId: string, id: string): Promise<VersionRow> {
    const row = await tx.orgHierarchyVersion.findFirst({ where: { tenantId, id } });
    if (!row) throw new NotFoundException('Version not found.');
    return row;
  }
}

// ─── Mapping and errors ────────────────────────────────────────────────────────────────────────────────────────

function toUnitType(row: UnitTypeRow): OrgUnitTypeV1 {
  return {
    id: row.id,
    code: row.code,
    labels: { one: row.labelOne, other: row.labelOther },
    holdsRecords: row.holdsRecords,
    capabilities: row.capabilities as OrgUnitTypeV1['capabilities'],
    allowedParentTypeCodes: row.allowedParentTypeCodes,
    allowAsRoot: row.allowAsRoot,
    description: row.description,
    status: row.status,
    version: row.version,
  };
}

function toUnit(row: UnitRow): OrgUnitV1 {
  return {
    id: row.id,
    typeId: row.typeId,
    typeCode: row.type.code,
    code: row.code,
    name: row.name,
    status: row.status,
    effectiveFrom: date(row.effectiveFrom),
    effectiveTo: row.effectiveTo ? date(row.effectiveTo) : null,
    timeZone: row.timeZone,
    contact: (row.contact as OrgUnitV1['contact']) ?? null,
    managerUserId: row.managerUserId,
    address: (row.address as OrgUnitV1['address']) ?? null,
    legal: (row.legal as OrgUnitV1['legal']) ?? null,
    version: row.version,
  };
}

function toTree(row: Awaited<ReturnType<Tx['orgTree']['findFirstOrThrow']>>): OrgTreeV1 {
  return { id: row.id, code: row.code, name: row.name, kind: row.kind, purpose: row.purpose, status: row.status, createdAt: row.createdAt.toISOString() };
}

function toVersion(row: VersionRow): OrgHierarchyVersionV1 {
  return {
    id: row.id,
    treeId: row.treeId,
    versionNumber: row.versionNumber,
    status: row.status,
    basedOnVersionId: row.basedOnVersionId,
    checksum: row.checksum,
    reason: row.reason,
    createdBy: row.createdById,
    submittedBy: row.submittedById,
    approvedBy: row.approvedById,
    publishedBy: row.publishedById,
    lockVersion: row.lockVersion,
    createdAt: row.createdAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

function toActivation(row: { id: string; treeId: string; versionId: string; effectiveFrom: Date; reason: string; activatedById: string; createdAt: Date }): OrgHierarchyActivationV1 {
  return {
    id: row.id,
    treeId: row.treeId,
    versionId: row.versionId,
    effectiveFrom: row.effectiveFrom.toISOString(),
    reason: row.reason,
    activatedBy: row.activatedById,
    createdAt: row.createdAt.toISOString(),
  };
}

function toGrant(row: GrantRow): OrgScopeGrantV1 {
  return {
    id: row.id,
    userId: row.userId,
    unitId: row.unitId,
    access: row.access,
    effectiveFrom: row.effectiveFrom.toISOString(),
    effectiveTo: row.effectiveTo?.toISOString() ?? null,
    grantedBy: row.grantedById,
    reason: row.reason,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

function unitTypeEvent(row: UnitTypeRow) {
  return {
    type: 'organization.unit-type.changed.v1',
    aggregateType: 'organization_unit_type',
    aggregateId: row.id,
    aggregateVersion: row.version,
    payload: { unitTypeId: row.id, code: row.code, holdsRecords: row.holdsRecords, status: row.status, version: row.version },
  };
}

function unitEvent(row: UnitRow) {
  return {
    type: 'organization.unit.changed.v1',
    aggregateType: 'organization_unit',
    aggregateId: row.id,
    aggregateVersion: row.version,
    payload: { unitId: row.id, typeCode: row.type.code, status: row.status, version: row.version },
  };
}

function grantEvent(row: GrantRow, change: 'GRANTED' | 'REVOKED') {
  return {
    type: 'organization.scope-grant.changed.v1',
    aggregateType: 'organization_scope_grant',
    aggregateId: row.id,
    aggregateVersion: change === 'GRANTED' ? 1 : 2,
    payload: { grantId: row.id, userId: row.userId, unitId: row.unitId, access: row.access, change },
  };
}

function page<T>(rows: T[], limit: number, cursorOf: (row: T) => string): Page<T> {
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit && items.length > 0 ? cursorOf(items[items.length - 1] as T) : null };
}

function parseEdgeCursor(cursor: string | undefined): [number | null, string | null] {
  if (!cursor) return [null, null];
  const separator = cursor.indexOf('~');
  const sortOrder = Number(cursor.slice(0, separator));
  if (separator < 1 || !Number.isInteger(sortOrder)) throw new UnprocessableEntityException('The cursor is not valid.');
  return [sortOrder, cursor.slice(separator + 1)];
}

function date(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function nullableJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null || value === undefined ? Prisma.DbNull : jsonValue(value);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

/** PostgreSQL refusals become client errors with safe messages; anything else stays a server error. */
export function safeError(error: unknown): unknown {
  if (error instanceof HttpException) return error;
  switch (sqlState(error)) {
    case '23505':
      return new ConflictException('That already exists.');
    case '23503':
      return new UnprocessableEntityException('A unit, type, member or parent it refers to is missing or still in use.');
    case '23514':
      return new UnprocessableEntityException('The change breaks an organization rule.');
    case '55000':
      return new ConflictException('The version is no longer in a state that allows this change; reload it.');
    default:
      return error;
  }
}

function sqlState(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const known = error as { code?: unknown; meta?: { code?: unknown }; message?: unknown };
  if (known.code === 'P2002') return '23505';
  if (known.code === 'P2003') return '23503';
  if (known.code === 'P2004') return '23514';
  if (known.code === 'P2010' && typeof known.meta?.code === 'string') return known.meta.code;
  const match = typeof known.message === 'string' ? /PostgresError \{ code: "([0-9A-Z]{5})"/.exec(known.message) : null;
  return match?.[1];
}
