import { OrgReplicaCompletionV1Schema, OrgReplicaPageV1Schema } from '@gigalibs/contracts';
import {
  CurrentPrincipal, OrganizationReplica, OrganizationReplicaConflictError,
  OrganizationVersionPendingError, RequirePermissions, moduleErrors,
  organizationAccess, scopeFor, type ModulePrincipal,
} from '@gigalibs/module-sdk';
import {
  BadRequestException, ConflictException, Controller, ForbiddenException, HttpCode,
  Param, Post, Body, ServiceUnavailableException, UseGuards,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { AuthorizationGuard } from './authorization.js';
import { SCHEMA } from './config.js';
import { DatabaseService } from './database.service.js';

const replica = new OrganizationReplica(SCHEMA);
const errors = moduleErrors('OPERATOR_ROUNDS', 'Operator Inspection Rounds');
type ScopedRecord = { owning_unit_id: string | null; site_ref: string | null };

/** One permission's assignment scope is checked as a pair of organization and place bounds. */
export async function scopeEvaluator(client: PoolClient, principal: ModulePrincipal) {
  const claim = principal.organization ?? { mode: 'TENANT' as const };
  let member;
  try {
    member = await organizationAccess(replica, client, principal.tenantId, claim);
  } catch (error) {
    if (error instanceof OrganizationVersionPendingError)
      throw new ServiceUnavailableException({ code: error.code, message: error.message });
    throw error;
  }
  const unitCache = new Map<string, string[]>();
  const units = async (version: string, roots: readonly string[]) => {
    const key = `${version}:${roots.join(',')}`;
    const cached = unitCache.get(key);
    if (cached) return cached;
    if (!(await replica.isReady(client, principal.tenantId, version)))
      throw new ServiceUnavailableException({ code: 'ORGANIZATION_VERSION_PENDING', message: 'The organization version has not arrived yet.' });
    const expanded = await replica.expand(client, principal.tenantId, version, roots);
    unitCache.set(key, expanded);
    return expanded;
  };
  return {
    async allows(permission: string, record: ScopedRecord, write: boolean): Promise<boolean> {
      for (const coverage of scopeFor(principal, permission).coverage) {
        if (coverage.kind === 'TENANT') return true;
        if (coverage.kind === 'PLACES') {
          if (record.site_ref !== null && coverage.placeIds.includes(record.site_ref)) return true;
          continue;
        }
        if (coverage.kind === 'UNITS') {
          const expanded = await units(coverage.treeVersion, coverage.unitIds);
          if (record.owning_unit_id !== null && expanded.includes(record.owning_unit_id)) return true;
          continue;
        }
        if (member.denied) continue;
        const orgUnits = write ? member.writeUnits : member.readUnits;
        const orgAllowed = orgUnits === null || (record.owning_unit_id !== null && orgUnits.includes(record.owning_unit_id));
        const placeAllowed = coverage.places.mode === 'ALL' ||
          (record.site_ref !== null && coverage.places.placeIds.includes(record.site_ref));
        if (orgAllowed && placeAllowed) return true;
      }
      return false;
    },
    async assert(permission: string, record: ScopedRecord): Promise<void> {
      if (!(await this.allows(permission, record, true)))
        throw new ForbiddenException('Record is outside your organization or place scope.');
    },
    async filter<T extends ScopedRecord>(permission: string, records: readonly T[], limit: number): Promise<T[]> {
      const visible: T[] = [];
      for (const record of records) {
        if (await this.allows(permission, record, false)) visible.push(record);
        if (visible.length >= limit) break;
      }
      return visible;
    },
    async assertOwner(unitId: string | null): Promise<void> {
      if (unitId === null) return;
      const unitCoverage = scopeFor(principal, 'operator-rounds.routes.manage').coverage
        .find((coverage) => coverage.kind === 'UNITS');
      const version = member.versionId ?? (unitCoverage?.kind === 'UNITS' ? unitCoverage.treeVersion : null);
      if (!version) throw new BadRequestException('A current organization version is required for a unit-owned route.');
      if (!(await replica.isReady(client, principal.tenantId, version)))
        throw new ServiceUnavailableException({ code: 'ORGANIZATION_VERSION_PENDING', message: 'The organization version has not arrived yet.' });
      const unit = await replica.unit(client, principal.tenantId, version, unitId);
      if (!unit || !unit.holds_records || unit.status !== 'ACTIVE')
        throw new BadRequestException('Choose an active record-holding unit in the current organization version.');
    },
  };
}

@Controller('v1/organization/versions')
@UseGuards(AuthorizationGuard)
export class RoundsOrganizationController {
  constructor(private readonly database: DatabaseService) {}

  @Post(':versionId/units')
  @HttpCode(200)
  @RequirePermissions('organization:activate')
  async receivePage(@CurrentPrincipal() principal: ModulePrincipal, @Param('versionId') versionId: string, @Body() body: unknown) {
    const { units, page: _page, ...header } = errors.parseInput(OrgReplicaPageV1Schema, body);
    try {
      return await this.database.withTenantTransaction(principal.tenantId, (client) =>
        replica.receivePage(client, principal.tenantId, versionId, header, units));
    } catch (error) {
      if (error instanceof OrganizationReplicaConflictError) throw new ConflictException(error.message);
      throw error;
    }
  }

  @Post(':versionId/complete')
  @HttpCode(200)
  @RequirePermissions('organization:activate')
  async complete(@CurrentPrincipal() principal: ModulePrincipal, @Param('versionId') versionId: string, @Body() body: unknown) {
    const { unit_count, ...header } = errors.parseInput(OrgReplicaCompletionV1Schema, body);
    try {
      return await this.database.withTenantTransaction(principal.tenantId, (client) =>
        replica.complete(client, principal.tenantId, versionId, header, unit_count));
    } catch (error) {
      if (error instanceof OrganizationReplicaConflictError) throw new ConflictException(error.message);
      throw error;
    }
  }
}
