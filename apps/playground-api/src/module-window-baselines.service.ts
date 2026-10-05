import { moduleWindowBaselines } from '@gigalibs/contracts';
import { prisma } from '@gigalibs/db';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigurationStudioService } from './configuration-studio.service.js';

export interface ModuleWindowOutcome {
  surfaceKey: string;
  status: 'ACTIVATED' | 'UPGRADED' | 'UNCHANGED' | 'CUSTOMISED_KEPT';
}

/**
 * WI-OI-120f (F0.2, ADR-0033 D1; owner decision 2026-10-05): when a tenant has a module enabled, the windows that
 * module ships are published and activated for the tenant, as the administrator recorded on the module's entitlement.
 * A tenant's own published version of a window stays in force.
 *
 * Runs from the `tenant.entitlements.changed.v1` control outbox event, which Platform Control Tower writes in the
 * same transaction as the entitlement change, and once at start-up for tenants that enabled a module before its
 * windows shipped. Both are idempotent: an unchanged baseline is left alone.
 */
@Injectable()
export class ModuleWindowBaselineService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ModuleWindowBaselineService.name);

  constructor(@Inject(ConfigurationStudioService) private readonly configuration: ConfigurationStudioService) {}

  onApplicationBootstrap() {
    if (process.env.GIGALIBS_MODULE_WINDOW_RECONCILE === 'disabled') return;
    const timer = setTimeout(() => void this.reconcileAll(), 15_000);
    timer.unref();
  }

  /** Applies the windows of every module the tenant has enabled. */
  async applyForTenant(tenantId: string): Promise<ModuleWindowOutcome[]> {
    const baselines = moduleWindowBaselines();
    if (baselines.length === 0) return [];
    const entitlements = await prisma.tenantModuleEntitlement.findMany({
      where: { tenantId, status: 'ENABLED', moduleKey: { in: [...new Set(baselines.map((b) => b.definition.moduleKey))] } },
      select: { moduleKey: true, updatedById: true },
    });
    const actorByModule = new Map(entitlements.map((entitlement) => [entitlement.moduleKey, entitlement.updatedById]));
    const outcomes: ModuleWindowOutcome[] = [];
    for (const baseline of baselines) {
      const actorId = actorByModule.get(baseline.definition.moduleKey);
      if (!actorId) continue;
      const { status } = await this.configuration.activateModuleBaseline(tenantId, actorId, baseline);
      outcomes.push({ surfaceKey: baseline.definition.surfaceKey, status });
      if (status === 'CUSTOMISED_KEPT') {
        this.logger.warn(
          `Tenant ${tenantId} keeps its own ${baseline.definition.surfaceKey} window; module baseline ` +
            `${baseline.definition.dictionary.version} is waiting for review in Configuration Studio.`,
        );
      }
    }
    return outcomes;
  }

  /** Every tenant with a module enabled whose windows are not yet active. Failures are logged; the next start retries. */
  async reconcileAll(): Promise<void> {
    const moduleKeys = [...new Set(moduleWindowBaselines().map((baseline) => baseline.definition.moduleKey))];
    if (moduleKeys.length === 0) return;
    const tenants = await prisma.tenantModuleEntitlement.findMany({
      where: { status: 'ENABLED', moduleKey: { in: moduleKeys } },
      distinct: ['tenantId'],
      select: { tenantId: true },
    });
    for (const { tenantId } of tenants) {
      try {
        const outcomes = await this.applyForTenant(tenantId);
        const changed = outcomes.filter((outcome) => outcome.status === 'ACTIVATED' || outcome.status === 'UPGRADED');
        if (changed.length > 0) {
          this.logger.log(`Activated module windows for tenant ${tenantId}: ${changed.map((o) => o.surfaceKey).join(', ')}`);
        }
      } catch (error) {
        this.logger.error(
          `Module windows could not be activated for tenant ${tenantId}. error=${error instanceof Error ? error.name : 'UnknownError'}`,
        );
      }
    }
  }
}
