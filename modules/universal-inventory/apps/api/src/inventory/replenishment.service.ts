import { randomUUID } from 'node:crypto';
import {
  type ModulePrincipal,
  OrganizationReplica,
  assertOrganizationWrite,
  organizationAccess,
} from '@gigalibs/module-sdk';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { SCHEMA, TOPIC } from '../config.js';
import { DatabaseService } from '../database.service.js';
import { calculateReplenishment } from './replenishment.js';

const QUANTITY = z.string().regex(/^\d+(\.\d+)?$/, 'must be a non-negative decimal');

/** WI-OI-125 S3: declare a min–max/pack rule for a product at a warehouse. */
export const UpsertReplenishRuleInputV1Schema = z
  .object({
    warehouseId: z.string().uuid(),
    productId: z.string().uuid(),
    minQuantity: QUANTITY,
    maxQuantity: QUANTITY,
    packSize: QUANTITY,
    preferredVendorPartyId: z.string().uuid().optional(),
  })
  .strict();
export type UpsertReplenishRuleInputV1 = z.infer<typeof UpsertReplenishRuleInputV1Schema>;

/** WI-OI-125 S5: raise purchase-order drafts for the named products that need replenishing. */
export const GeneratePurchaseDraftsInputV1Schema = z
  .object({
    warehouseId: z.string().uuid(),
    productIds: z.array(z.string().uuid()).min(1),
  })
  .strict();
export type GeneratePurchaseDraftsInputV1 = z.infer<typeof GeneratePurchaseDraftsInputV1Schema>;

export interface ReplenishRuleV1 {
  readonly id: string;
  readonly warehouseId: string;
  readonly productId: string;
  readonly minQuantity: string;
  readonly maxQuantity: string;
  readonly packSize: string;
  readonly preferredVendorPartyId: string | null;
  readonly isActive: boolean;
  readonly version: number;
}

export interface ReplenishmentSuggestionV1 {
  readonly warehouseId: string;
  readonly productId: string;
  readonly availableQuantity: string;
  readonly minQuantity: string;
  readonly maxQuantity: string;
  readonly packSize: string;
  readonly suggestedQuantity: string;
  readonly packs: string;
  readonly shouldReplenish: boolean;
  readonly preferredVendorPartyId: string | null;
}

export interface PurchaseDraftV1 {
  readonly draftId: string;
  readonly warehouseId: string;
  readonly productId: string;
  readonly quantity: string;
  readonly preferredVendorPartyId: string | null;
}

interface RuleRow {
  id: string;
  warehouse_id: string;
  product_id: string;
  min_quantity: string;
  max_quantity: string;
  pack_size: string;
  preferred_vendor_party_id: string | null;
  is_active: boolean;
  version: number;
}

/**
 * WI-OI-125 (Advanced SCM, S3/S5): min–max replenishment rules, the Replenishment Radar, and the bulk purchase-order
 * draft handshake. The Radar reads current sellable (AVAILABLE) stock against each rule and the pure engine suggests a
 * pack-rounded order; "generate POs" emits one `inventory.replenishment.po-draft.v1` outbox fact per product that
 * needs it, which Procurement drafts into a requisition. Org-scoped to the warehouse's owning unit.
 */
@Injectable()
export class ReplenishmentService {
  private readonly orgReplica = new OrganizationReplica(SCHEMA);

  constructor(private readonly database: DatabaseService) {}

  async upsertRule(principal: ModulePrincipal, input: UpsertReplenishRuleInputV1): Promise<ReplenishRuleV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.requireWarehouseWrite(client, principal, input.warehouseId);
      const existing = await client.query<RuleRow>(
        `SELECT * FROM ${SCHEMA}.replenish_rules WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3`,
        [principal.tenantId, input.warehouseId, input.productId],
      );
      if (existing.rows[0]) {
        const updated = await client.query<RuleRow>(
          `UPDATE ${SCHEMA}.replenish_rules
              SET min_quantity = $4, max_quantity = $5, pack_size = $6, preferred_vendor_party_id = $7,
                  is_active = true, version = version + 1, updated_at = now(), updated_by = $8
            WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3
            RETURNING *`,
          [principal.tenantId, input.warehouseId, input.productId, input.minQuantity, input.maxQuantity, input.packSize, input.preferredVendorPartyId ?? null, principal.subject],
        );
        return this.toRule(updated.rows[0]);
      }
      const inserted = await client.query<RuleRow>(
        `INSERT INTO ${SCHEMA}.replenish_rules
           (id, tenant_id, warehouse_id, product_id, min_quantity, max_quantity, pack_size, preferred_vendor_party_id, is_active, version, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, 1, $9)
         RETURNING *`,
        [randomUUID(), principal.tenantId, input.warehouseId, input.productId, input.minQuantity, input.maxQuantity, input.packSize, input.preferredVendorPartyId ?? null, principal.subject],
      );
      return this.toRule(inserted.rows[0]);
    });
  }

  async listRules(principal: ModulePrincipal, warehouseId: string): Promise<ReplenishRuleV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.requireWarehouseRead(client, principal, warehouseId);
      const rules = await client.query<RuleRow>(
        `SELECT * FROM ${SCHEMA}.replenish_rules WHERE tenant_id = $1 AND warehouse_id = $2 ORDER BY product_id`,
        [principal.tenantId, warehouseId],
      );
      return rules.rows.map((row) => this.toRule(row));
    });
  }

  async computeRadar(principal: ModulePrincipal, warehouseId: string): Promise<ReplenishmentSuggestionV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.requireWarehouseRead(client, principal, warehouseId);
      const rules = await client.query<RuleRow>(
        `SELECT * FROM ${SCHEMA}.replenish_rules WHERE tenant_id = $1 AND warehouse_id = $2 AND is_active = true ORDER BY product_id`,
        [principal.tenantId, warehouseId],
      );
      const suggestions: ReplenishmentSuggestionV1[] = [];
      for (const rule of rules.rows) {
        const available = await this.availableStock(client, principal.tenantId, warehouseId, rule.product_id);
        const outcome = calculateReplenishment(available, {
          minQuantity: String(rule.min_quantity),
          maxQuantity: String(rule.max_quantity),
          packSize: String(rule.pack_size),
        });
        suggestions.push({
          warehouseId,
          productId: rule.product_id,
          availableQuantity: available,
          minQuantity: String(rule.min_quantity),
          maxQuantity: String(rule.max_quantity),
          packSize: String(rule.pack_size),
          suggestedQuantity: outcome.suggestedQuantity,
          packs: outcome.packs,
          shouldReplenish: outcome.shouldReplenish,
          preferredVendorPartyId: rule.preferred_vendor_party_id,
        });
      }
      return suggestions;
    });
  }

  async generatePurchaseDrafts(principal: ModulePrincipal, input: GeneratePurchaseDraftsInputV1): Promise<PurchaseDraftV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.requireWarehouseWrite(client, principal, input.warehouseId);
      const drafts: PurchaseDraftV1[] = [];
      for (const productId of input.productIds) {
        const rule = await client.query<RuleRow>(
          `SELECT * FROM ${SCHEMA}.replenish_rules WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3 AND is_active = true`,
          [principal.tenantId, input.warehouseId, productId],
        );
        if (!rule.rows[0]) continue;
        const available = await this.availableStock(client, principal.tenantId, input.warehouseId, productId);
        const outcome = calculateReplenishment(available, {
          minQuantity: String(rule.rows[0].min_quantity),
          maxQuantity: String(rule.rows[0].max_quantity),
          packSize: String(rule.rows[0].pack_size),
        });
        if (!outcome.shouldReplenish) continue;
        const draftId = randomUUID();
        const payload = {
          draftId,
          warehouseId: input.warehouseId,
          productId,
          quantity: outcome.suggestedQuantity,
          preferredVendorPartyId: rule.rows[0].preferred_vendor_party_id,
          source: 'MIN_MAX_REPLENISHMENT',
        };
        await client.query(
          `INSERT INTO ${SCHEMA}.outbox_events
             (id, tenant_id, topic, event_type, aggregate_type, aggregate_id, aggregate_version, correlation_id, schema_version, payload, status, created_at)
           VALUES ($1, $2, $3, 'inventory.replenishment.po-draft.v1', 'replenishment', $4, 1, $4, 1, $5::jsonb, 'PENDING', now())`,
          [randomUUID(), principal.tenantId, TOPIC, draftId, JSON.stringify(payload)],
        );
        drafts.push({ draftId, warehouseId: input.warehouseId, productId, quantity: outcome.suggestedQuantity, preferredVendorPartyId: rule.rows[0].preferred_vendor_party_id });
      }
      return drafts;
    });
  }

  // ─── internals ───────────────────────────────────────────────────────────────

  private async availableStock(client: PoolClient, tenantId: string, warehouseId: string, productId: string): Promise<string> {
    const res = await client.query<{ available: string }>(
      `SELECT coalesce(sum(available_quantity), 0)::text AS available
         FROM ${SCHEMA}.stock_balances
        WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3 AND stock_status = 'AVAILABLE'`,
      [tenantId, warehouseId, productId],
    );
    return String(res.rows[0]?.available ?? '0');
  }

  private async requireWarehouseWrite(client: PoolClient, principal: ModulePrincipal, warehouseId: string): Promise<void> {
    const { access, orgUnitId } = await this.warehouseAccess(client, principal, warehouseId);
    assertOrganizationWrite(access, orgUnitId);
  }

  private async requireWarehouseRead(client: PoolClient, principal: ModulePrincipal, warehouseId: string): Promise<void> {
    const { access, orgUnitId } = await this.warehouseAccess(client, principal, warehouseId);
    if (access.denied || (orgUnitId !== null && access.readUnits !== null && !access.readUnits.includes(orgUnitId))) {
      throw new ForbiddenException('Warehouse is outside your organization access.');
    }
  }

  private async warehouseAccess(client: PoolClient, principal: ModulePrincipal, warehouseId: string) {
    const access = await organizationAccess(this.orgReplica, client, principal.tenantId, principal.organization ?? { mode: 'TENANT' });
    const result = await client.query<{ org_unit_id: string | null }>(
      `SELECT org_unit_id FROM ${SCHEMA}.warehouses WHERE tenant_id = $1 AND id = $2`,
      [principal.tenantId, warehouseId],
    );
    if (result.rowCount === 0) throw new NotFoundException('Warehouse not found.');
    return { access, orgUnitId: result.rows[0].org_unit_id };
  }

  private toRule(row: RuleRow): ReplenishRuleV1 {
    return {
      id: row.id,
      warehouseId: row.warehouse_id,
      productId: row.product_id,
      minQuantity: String(row.min_quantity),
      maxQuantity: String(row.max_quantity),
      packSize: String(row.pack_size),
      preferredVendorPartyId: row.preferred_vendor_party_id,
      isActive: row.is_active,
      version: Number(row.version),
    };
  }
}
