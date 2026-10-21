import type { SpeedOutcomesV1 } from '@gigalibs/contracts';
import type { ModulePrincipal } from '@gigalibs/module-sdk';
import type { DossierModelV1 } from '@gigalibs/process-safety-screening-domain';
import { Injectable } from '@nestjs/common';
import { readableSite, resolveAccess } from '../access.js';
import { SCHEMA } from '../config.js';
import { DatabaseService } from '../database.service.js';
import { ROUTE_FROM } from '../routes/route-store.js';

// WI-OI-120cc (SPEED S9b; screen spec §3.4; BRD BO-1 to BO-5): the business outcomes from SPEED's own records, within the
// sites the member reads (plan v1.4 §4.4: computed from module data in R1; Analytics takes them over in R2).

interface Finding {
  readonly severity?: string;
}
interface Outputs {
  readonly interactions?: { readonly status?: string; readonly findings?: readonly Finding[] };
  readonly thermal?: {
    readonly status?: string;
    readonly stoesselClass?: number | null;
    readonly stoesselClassFullAccumulation?: number | null;
    readonly gases?: readonly unknown[];
  };
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

@Injectable()
export class OutcomesService {
  constructor(private readonly database: DatabaseService) {}

  get(principal: ModulePrincipal): Promise<SpeedOutcomesV1> {
    const { tenantId } = principal;
    return this.database.withTenantTransaction(tenantId, async (client) => {
      const values: unknown[] = [tenantId];
      const scope = readableSite(await resolveAccess(client, principal), 'p.site_unit_id', values);
      const routes = await client.query<{ id: string; created_at: Date }>(
        `SELECT r.id, r.created_at FROM ${ROUTE_FROM}
          WHERE r.tenant_id = $1 AND r.status <> 'ARCHIVED'${scope ? ` AND ${scope}` : ''}`,
        values,
      );
      const routeIds = routes.rows.map((row) => row.id);
      // Each current step's latest result (a removed step's results stay in the record but are not counted).
      const results = await client.query<{ outputs: Outputs }>(
        `SELECT DISTINCT ON (x.step_id) x.outputs
           FROM ${SCHEMA}.results x
           JOIN ${SCHEMA}.steps s ON s.tenant_id = x.tenant_id AND s.id = x.step_id
          WHERE x.tenant_id = $1 AND x.route_id = ANY($2::uuid[])
          ORDER BY x.step_id, x.computed_at DESC, x.id DESC`,
        [tenantId, routeIds],
      );
      const dossiers = await client.query<{
        route_id: string;
        first_done: Date | null;
        latest: DossierModelV1 | null;
      }>(
        `SELECT route_id,
                min(requested_at) FILTER (WHERE status = 'DONE') AS first_done,
                (array_agg(model ORDER BY completed_at DESC) FILTER (WHERE status = 'DONE'))[1] AS latest
           FROM ${SCHEMA}.dossiers
          WHERE tenant_id = $1 AND route_id = ANY($2::uuid[])
          GROUP BY route_id`,
        [tenantId, routeIds],
      );

      const hazards = {
        highInteractions: 0,
        mediumInteractions: 0,
        class3OrWorseSteps: 0,
        gasFormingSteps: 0,
      };
      let worstClass: number | null = null;
      for (const { outputs } of results.rows) {
        if (outputs.interactions?.status === 'OK')
          for (const finding of outputs.interactions.findings ?? []) {
            if (finding.severity === 'High') hazards.highInteractions += 1;
            if (finding.severity === 'Medium') hazards.mediumInteractions += 1;
          }
        const thermal = outputs.thermal;
        if (thermal?.status !== 'OK') continue;
        const classes = [thermal.stoesselClass, thermal.stoesselClassFullAccumulation].filter(
          (value): value is number => typeof value === 'number',
        );
        if (classes.length > 0) {
          const worst = Math.max(...classes);
          if (worst >= 3) hazards.class3OrWorseSteps += 1;
          worstClass = worstClass === null ? worst : Math.max(worstClass, worst);
        }
        if ((thermal.gases ?? []).length > 0) hazards.gasFormingSteps += 1;
      }

      const createdAt = new Map(
        routes.rows.map((row) => [row.id, new Date(row.created_at).getTime()]),
      );
      const done = dossiers.rows.filter((row) => row.first_done !== null);
      const minutes = done.map(
        (row) =>
          (new Date(row.first_done as Date).getTime() - (createdAt.get(row.route_id) ?? 0)) /
          60_000,
      );
      const facts = done.map((row) => row.latest?.facts);
      return {
        routes: routeIds.length,
        hazards,
        screening: { medianMinutes: median(minutes), routesMeasured: minutes.length },
        screened: { screened: done.length, routes: routeIds.length },
        economy: {
          withEconomy: facts.filter(
            (fact) => fact && fact.routePmi !== null && fact.atomEconomyPercent !== null,
          ).length,
          withDossier: done.length,
        },
        worstClass,
      };
    });
  }
}
