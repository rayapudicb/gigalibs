import { randomUUID } from 'node:crypto';
import {
  type CostProfileV1,
  type InventoryCostLayerV1,
  type CostLayerConsumptionV1,
  type LandedCostV1,
  type LandedCostAllocationLineV1,
  type InventoryRevaluationV1,
  type CreateCostProfileInputV1,
  type IngestReceiptCostLayerInputV1,
  type RecordShipmentCostInputV1,
  type CreateLandedCostInputV1,
  type ExecuteRevaluationInputV1,
  type InventoryValuationSummaryV1,
  type CostProfileCreatedEventV1,
  type CostLayerCreatedEventV1,
  type CogsPostedEventV1,
  type LandedCostPostedEventV1,
  type InventoryRevaluationPostedEventV1,
  type PostJournalInputV1,
} from '@gigalibs/contracts';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { SCHEMA } from '../config.js';
import { appendOutboxEvent } from '../outbox.js';
import { DatabaseService } from '../database.service.js';
import { FinanceService } from '../finance/finance.service.js';
import {
  consumeFifoLayers,
  calculatePurchasePriceVariance,
  apportionLandedCost,
  toScaledBigInt,
  fromScaledBigInt,
  type FifoLayer,
  type LandedCostTarget,
} from './costing-engine.js';

@Injectable()
export class CostingService {
  constructor(
    private readonly database: DatabaseService,
    private readonly financeService: FinanceService,
  ) {}

  private async query<R = Record<string, any>>(
    tenantId: string,
    text: string,
    values?: unknown[],
  ): Promise<{ rows: R[] }> {
    return this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
      const res = await client.query(text, values);
      return { rows: res.rows as R[] };
    });
  }

  // ─── 1. Cost Profiles ───────────────────────────────────────────────────────

  async createCostProfile(
    tenantId: string,
    actor: string,
    input: CreateCostProfileInputV1,
  ): Promise<CostProfileV1> {
    const existing = await this.query(
      tenantId,
      `SELECT id FROM ${SCHEMA}.cost_profiles WHERE tenant_id = $1 AND code = $2`,
      [tenantId, input.code],
    );
    if (existing.rows.length > 0) {
      throw new ConflictException(`Cost profile with code ${input.code} already exists.`);
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    const insertSql = `
      INSERT INTO ${SCHEMA}.cost_profiles (
        id, tenant_id, code, name, description, costing_method,
        inventory_gl_account_id, grni_gl_account_id, cogs_gl_account_id,
        landed_cost_clearing_gl_account_id, purchase_price_variance_gl_account_id,
        scrap_gl_account_id, valuation_loss_gl_account_id,
        standard_unit_cost_scaled, is_default, is_active, version,
        created_at, updated_at, created_by, updated_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9,
        $10, $11,
        $12, $13,
        $14, $15, $16, $17,
        $18, $19, $20, $21
      ) RETURNING *;
    `;

    return this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
      const res = await client.query(insertSql, [
        id,
        tenantId,
        input.code,
        input.name,
        input.description ?? null,
        input.costingMethod,
        input.inventoryGlAccountId,
        input.grniGlAccountId,
        input.cogsGlAccountId,
        input.landedCostClearingGlAccountId,
        input.purchasePriceVarianceGlAccountId,
        input.scrapGlAccountId,
        input.valuationLossGlAccountId,
        input.standardUnitCostScaled ?? null,
        input.isDefault ?? false,
        true,
        1,
        now,
        now,
        actor,
        null,
      ]);

      const event: CostProfileCreatedEventV1 = {
        id: randomUUID(),
        source: 'gigalibs.financial-operations.costing',
        specversion: '1.0',
        datacontenttype: 'application/json',
        time: now,
        tenantId,
        type: 'finance.costing.profile.created.v1',
        data: {
          costProfileId: id,
          code: input.code,
          costingMethod: input.costingMethod,
        },
      };

      await appendOutboxEvent(client, tenantId, {
        id: event.id,
        type: event.type,
        aggregateType: 'cost_profile',
        aggregateId: String(event.data.costProfileId),
        data: event,
      });

      return this.mapCostProfile(res.rows[0]);
    });
  }

  async getCostProfile(tenantId: string, id: string): Promise<CostProfileV1> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.cost_profiles WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    if (res.rows.length === 0) {
      throw new NotFoundException(`Cost profile ${id} not found.`);
    }
    return this.mapCostProfile(res.rows[0]);
  }

  async listCostProfiles(tenantId: string): Promise<CostProfileV1[]> {
    const res = await this.query(
      tenantId,
      `SELECT * FROM ${SCHEMA}.cost_profiles WHERE tenant_id = $1 ORDER BY code ASC`,
      [tenantId],
    );
    return res.rows.map((r) => this.mapCostProfile(r));
  }

  // ─── 2. Inbound Receipt Cost Layer Ingestion ────────────────────────────────

  async ingestReceiptLayer(
    tenantId: string,
    actor: string,
    input: IngestReceiptCostLayerInputV1,
  ): Promise<InventoryCostLayerV1> {
    const profile = await this.getCostProfile(tenantId, input.costProfileId);

    const qtyScaled = toScaledBigInt(input.quantity);
    const unitCostScaled = BigInt(input.unitCostScaled);
    const totalCostMinor = (qtyScaled * unitCostScaled) / 10_000_000_000n;

    const layerId = randomUUID();
    const now = new Date().toISOString();

    return this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
      // 1. Post GL Journal if requested and bookId & periodId provided
      let glJournalId: string | null = null;
      if (input.postGlJournal && input.bookId && input.periodId && totalCostMinor > 0n) {
        const lines: PostJournalInputV1['lines'] = [
          {
            accountId: profile.inventoryGlAccountId,
            debitAmountMinor: totalCostMinor.toString(),
            creditAmountMinor: '0',
            currencyCode: 'USD',
            exchangeRate: '1.000000',
            memo: `Inventory Inbound: ${input.receiptRef} (${input.quantity} units)`,
          },
          {
            accountId: profile.grniGlAccountId,
            debitAmountMinor: '0',
            creditAmountMinor: totalCostMinor.toString(),
            currencyCode: 'USD',
            exchangeRate: '1.000000',
            memo: `GRNI Accrual: ${input.receiptRef}`,
          },
        ];

        // If Standard Costing, evaluate PPV
        if (profile.costingMethod === 'STANDARD' && profile.standardUnitCostScaled) {
          const ppv = calculatePurchasePriceVariance(
            input.quantity,
            input.unitCostScaled,
            profile.standardUnitCostScaled,
          );
          const ppvMinor = BigInt(ppv.varianceMinor);
          if (ppvMinor !== 0n) {
            // Replace standard lines with PPV adjustment
            const standardTotalMinor =
              (qtyScaled * BigInt(profile.standardUnitCostScaled)) / 10_000_000_000n;
            lines[0]!.debitAmountMinor = standardTotalMinor.toString(); // Inventory at standard
            lines[1]!.creditAmountMinor = totalCostMinor.toString(); // GRNI at actual PO cost
            if (ppvMinor > 0n) {
              // Unfavorable: Debit PPV Expense
              lines.push({
                accountId: profile.purchasePriceVarianceGlAccountId,
                debitAmountMinor: ppvMinor.toString(),
                creditAmountMinor: '0',
                currencyCode: 'USD',
                exchangeRate: '1.000000',
                memo: `Unfavorable PPV on ${input.receiptRef}`,
              });
            } else {
              // Favorable: Credit PPV
              lines.push({
                accountId: profile.purchasePriceVarianceGlAccountId,
                debitAmountMinor: '0',
                creditAmountMinor: (-ppvMinor).toString(),
                currencyCode: 'USD',
                exchangeRate: '1.000000',
                memo: `Favorable PPV on ${input.receiptRef}`,
              });
            }
          }
        }

        const journalInput: PostJournalInputV1 = {
          accountingBookId: input.bookId,
          fiscalPeriodId: input.periodId,
          postingDate: input.receiptDate || now,
          entryType: input.journalEntryType ?? 'SUBLEDGER_INVENTORY',
          description: `Inventory Receipt ${input.receiptRef}`,
          sourceDocumentType: input.sourceDocumentType ?? 'INVENTORY_COST_LAYER',
          sourceDocumentId: input.sourceDocumentId ?? layerId,
          lines,
        };

        const journal = await this.financeService.postJournal(tenantId, actor, journalInput, client);
        glJournalId = journal.id;
      }

      // 2. Insert cost layer
      const insertSql = `
        INSERT INTO ${SCHEMA}.inventory_cost_layers (
          id, tenant_id, cost_profile_id, product_id, warehouse_id,
          receipt_ref, receipt_date, initial_quantity, remaining_quantity,
          unit_cost_scaled, total_initial_cost_minor, total_remaining_cost_minor,
          landed_cost_added_minor, status, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12,
          0, 'ACTIVE', $13, $14
        ) RETURNING *;
      `;

      const res = await client.query(insertSql, [
        layerId,
        tenantId,
        input.costProfileId,
        input.productId,
        input.warehouseId,
        input.receiptRef,
        input.receiptDate || now,
        input.quantity,
        input.quantity,
        input.unitCostScaled,
        totalCostMinor.toString(),
        totalCostMinor.toString(),
        now,
        now,
      ]);

      // 3. Outbox event
      const event: CostLayerCreatedEventV1 = {
        id: randomUUID(),
        source: 'gigalibs.financial-operations.costing',
        specversion: '1.0',
        datacontenttype: 'application/json',
        time: now,
        tenantId,
        type: 'finance.costing.layer.created.v1',
        data: {
          costLayerId: layerId,
          productId: input.productId,
          warehouseId: input.warehouseId,
          quantity: input.quantity,
          unitCostScaled: input.unitCostScaled,
          totalCostMinor: totalCostMinor.toString(),
        },
      };

      await appendOutboxEvent(client, tenantId, {
        id: event.id,
        type: event.type,
        aggregateType: 'cost_layer',
        aggregateId: String(event.data.costLayerId),
        data: event,
      });

      return this.mapCostLayer(res.rows[0]);
    });
  }

  // ─── 3. Outbound Shipment / Consumption (COGS Posting) ─────────────────────

  async recordShipmentCost(
    tenantId: string,
    actor: string,
    input: RecordShipmentCostInputV1,
  ): Promise<{
    transactionRef: string;
    totalCogsMinor: string;
    consumptions: CostLayerConsumptionV1[];
    glJournalId: string | null;
  }> {
    const profile = await this.getCostProfile(tenantId, input.costProfileId);

    return this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
      // 1. Fetch available layers in FIFO order
      const layersRes = await client.query(
        `SELECT * FROM ${SCHEMA}.inventory_cost_layers
         WHERE tenant_id = $1 AND product_id = $2 AND warehouse_id = $3
           AND status IN ('ACTIVE', 'PARTIALLY_CONSUMED')
         ORDER BY receipt_date ASC, created_at ASC`,
        [tenantId, input.productId, input.warehouseId],
      );

      if (layersRes.rows.length === 0) {
        throw new BadRequestException(
          `No active inventory cost layers available for product ${input.productId} at warehouse ${input.warehouseId}`,
        );
      }

      const fifoLayers: FifoLayer[] = layersRes.rows.map((r) => ({
        id: r.id,
        remainingQuantity: r.remaining_quantity.toString(),
        unitCostScaled: r.unit_cost_scaled.toString(),
      }));

      const consumptionResult = consumeFifoLayers(fifoLayers, input.quantity);
      if (toScaledBigInt(consumptionResult.unfulfilledQuantity) > 0n) {
        throw new BadRequestException(
          `Insufficient inventory layer quantity. Requested: ${input.quantity}, Shortfall: ${consumptionResult.unfulfilledQuantity}`,
        );
      }

      const now = new Date().toISOString();
      let glJournalId: string | null = null;
      const totalCogsMinor = BigInt(consumptionResult.totalCogsMinor);

      // 2. Post COGS GL Journal if requested
      if (input.postGlJournal && input.bookId && input.periodId && totalCogsMinor > 0n) {
        const journalInput: PostJournalInputV1 = {
          accountingBookId: input.bookId,
          fiscalPeriodId: input.periodId,
          postingDate: now,
          entryType: 'SUBLEDGER_INVENTORY',
          description: `COGS Posting for ${input.transactionRef}`,
          lines: [
            {
              accountId: profile.cogsGlAccountId,
              debitAmountMinor: totalCogsMinor.toString(),
              creditAmountMinor: '0',
              currencyCode: 'USD',
              exchangeRate: '1.000000',
              memo: `COGS: ${input.transactionRef} (${input.quantity} units)`,
            },
            {
              accountId: profile.inventoryGlAccountId,
              debitAmountMinor: '0',
              creditAmountMinor: totalCogsMinor.toString(),
              currencyCode: 'USD',
              exchangeRate: '1.000000',
              memo: `Inventory Relief: ${input.transactionRef}`,
            },
          ],
        };

        const journal = await this.financeService.postJournal(tenantId, actor, journalInput, client);
        glJournalId = journal.id;
      }

      // 3. Persist consumptions and update layers
      const savedConsumptions: CostLayerConsumptionV1[] = [];
      for (const c of consumptionResult.consumptions) {
        const consumptionId = randomUUID();
        const insertConsumptionSql = `
          INSERT INTO ${SCHEMA}.cost_layer_consumptions (
            id, tenant_id, cost_layer_id, transaction_ref, transaction_type,
            quantity_consumed, unit_cost_scaled, cost_minor, consumed_at, gl_journal_id, created_at
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10, $11
          ) RETURNING *;
        `;
        const cRes = await client.query(insertConsumptionSql, [
          consumptionId,
          tenantId,
          c.costLayerId,
          input.transactionRef,
          input.transactionType,
          c.quantityConsumed,
          c.unitCostScaled,
          c.costMinor,
          now,
          glJournalId,
          now,
        ]);
        savedConsumptions.push(this.mapConsumption(cRes.rows[0]));

        // Update layer remaining quantity & status
        const layerRow = layersRes.rows.find((r) => r.id === c.costLayerId);
        const prevRemainingScaled = toScaledBigInt(layerRow.remaining_quantity.toString());
        const consumedScaled = toScaledBigInt(c.quantityConsumed);
        const newRemainingScaled = prevRemainingScaled - consumedScaled;
        const newStatus = newRemainingScaled === 0n ? 'EXHAUSTED' : 'PARTIALLY_CONSUMED';
        const newRemainingCostMinor =
          (newRemainingScaled * BigInt(c.unitCostScaled)) / 10_000_000_000n;

        await client.query(
          `UPDATE ${SCHEMA}.inventory_cost_layers
           SET remaining_quantity = $1, total_remaining_cost_minor = $2, status = $3, updated_at = $4
           WHERE tenant_id = $5 AND id = $6`,
          [
            fromScaledBigInt(newRemainingScaled),
            newRemainingCostMinor.toString(),
            newStatus,
            now,
            tenantId,
            c.costLayerId,
          ],
        );
      }

      // 4. Outbox event
      const event: CogsPostedEventV1 = {
        id: randomUUID(),
        source: 'gigalibs.financial-operations.costing',
        specversion: '1.0',
        datacontenttype: 'application/json',
        time: now,
        tenantId,
        type: 'finance.costing.cogs.posted.v1',
        data: {
          transactionRef: input.transactionRef,
          productId: input.productId,
          quantity: input.quantity,
          totalCogsMinor: consumptionResult.totalCogsMinor,
          glJournalId,
        },
      };

      await appendOutboxEvent(client, tenantId, {
        id: event.id,
        type: event.type,
        aggregateType: 'cogs_transaction',
        aggregateId: String(event.data.transactionRef),
        data: event,
      });

      return {
        transactionRef: input.transactionRef,
        totalCogsMinor: consumptionResult.totalCogsMinor,
        consumptions: savedConsumptions,
        glJournalId,
      };
    });
  }

  // ─── 4. Landed Cost Vouchers & Apportionment ─────────────────────────────────

  async createLandedCostVoucher(
    tenantId: string,
    actor: string,
    input: CreateLandedCostInputV1,
  ): Promise<LandedCostV1> {
    const existing = await this.query(
      tenantId,
      `SELECT id FROM ${SCHEMA}.landed_cost_vouchers WHERE tenant_id = $1 AND voucher_number = $2`,
      [tenantId, input.voucherNumber],
    );
    if (existing.rows.length > 0) {
      throw new ConflictException(`Landed cost voucher ${input.voucherNumber} already exists.`);
    }

    return this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
      // 1. Fetch target layers
      const layerIds = input.receiptLayerAllocations.map((a) => a.costLayerId);
      const layersRes = await client.query(
        `SELECT * FROM ${SCHEMA}.inventory_cost_layers WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [tenantId, layerIds],
      );

      if (layersRes.rows.length !== layerIds.length) {
        throw new NotFoundException('One or more target inventory cost layers not found.');
      }

      const targets: LandedCostTarget[] = layersRes.rows.map((r) => {
        const alloc = input.receiptLayerAllocations.find((a) => a.costLayerId === r.id)!;
        return {
          costLayerId: r.id,
          productId: r.product_id,
          basisMetric: alloc.basisMetric,
          layerRemainingQuantity: r.remaining_quantity.toString(),
        };
      });

      // Apportion landed costs
      const allocations = apportionLandedCost(
        input.totalLandedCostMinor,
        layersRes.rows[0].unit_cost_scaled.toString(),
        targets,
      );

      const voucherId = randomUUID();
      const now = new Date().toISOString();
      let glJournalId: string | null = null;

      // 2. Post GL journal if requested
      if (input.postGlJournal && input.bookId && input.periodId) {
        // Fetch first profile for account mappings
        const profileRes = await client.query(
          `SELECT * FROM ${SCHEMA}.cost_profiles WHERE tenant_id = $1 AND id = $2`,
          [tenantId, layersRes.rows[0].cost_profile_id],
        );
        const profile = this.mapCostProfile(profileRes.rows[0]);

        const journalInput: PostJournalInputV1 = {
          accountingBookId: input.bookId,
          fiscalPeriodId: input.periodId,
          postingDate: now,
          entryType: 'SUBLEDGER_INVENTORY',
          description: `Landed Cost Capitalization: ${input.voucherNumber}`,
          sourceDocumentType: 'LANDED_COST_VOUCHER',
          sourceDocumentId: voucherId,
          lines: [
            {
              accountId: profile.inventoryGlAccountId,
              debitAmountMinor: input.totalLandedCostMinor,
              creditAmountMinor: '0',
              currencyCode: input.currencyCode,
              exchangeRate: '1.000000',
              memo: `Landed Cost Absorption: ${input.voucherNumber}`,
            },
            {
              accountId: profile.landedCostClearingGlAccountId,
              debitAmountMinor: '0',
              creditAmountMinor: input.totalLandedCostMinor,
              currencyCode: input.currencyCode,
              exchangeRate: '1.000000',
              memo: `Landed Cost Clearing: ${input.voucherNumber}`,
            },
          ],
        };

        const journal = await this.financeService.postJournal(tenantId, actor, journalInput, client);
        glJournalId = journal.id;
      }

      // 3. Insert landed cost voucher
      const voucherSql = `
        INSERT INTO ${SCHEMA}.landed_cost_vouchers (
          id, tenant_id, voucher_number, description, allocation_basis,
          total_landed_cost_minor, currency_code, status, gl_journal_id, posted_at, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, 'POSTED', $8, $9, $10, $11
        ) RETURNING *;
      `;
      const voucherRes = await client.query(voucherSql, [
        voucherId,
        tenantId,
        input.voucherNumber,
        input.description ?? null,
        input.allocationBasis,
        input.totalLandedCostMinor,
        input.currencyCode,
        glJournalId,
        now,
        now,
        now,
      ]);

      // 4. Insert allocation lines & update cost layers
      for (const a of allocations) {
        const lineId = randomUUID();
        const allocInput = input.receiptLayerAllocations.find((x) => x.costLayerId === a.costLayerId)!;

        await client.query(
          `INSERT INTO ${SCHEMA}.landed_cost_allocations (
            id, tenant_id, landed_cost_id, cost_layer_id, product_id,
            basis_weight, apportioned_amount_minor, adjusted_unit_cost_scaled, created_at
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9
          )`,
          [
            lineId,
            tenantId,
            voucherId,
            a.costLayerId,
            a.productId,
            allocInput.basisMetric,
            a.apportionedAmountMinor,
            a.adjustedUnitCostScaled,
            now,
          ],
        );

        // Update layer
        await client.query(
          `UPDATE ${SCHEMA}.inventory_cost_layers
           SET landed_cost_added_minor = landed_cost_added_minor + $1,
               unit_cost_scaled = $2,
               updated_at = $3
           WHERE tenant_id = $4 AND id = $5`,
          [a.apportionedAmountMinor, a.adjustedUnitCostScaled, now, tenantId, a.costLayerId],
        );
      }

      // 5. Outbox event
      const event: LandedCostPostedEventV1 = {
        id: randomUUID(),
        source: 'gigalibs.financial-operations.costing',
        specversion: '1.0',
        datacontenttype: 'application/json',
        time: now,
        tenantId,
        type: 'finance.costing.landed_cost.posted.v1',
        data: {
          landedCostId: voucherId,
          voucherNumber: input.voucherNumber,
          totalLandedCostMinor: input.totalLandedCostMinor,
          allocatedLayersCount: allocations.length,
          glJournalId,
        },
      };

      await appendOutboxEvent(client, tenantId, {
        id: event.id,
        type: event.type,
        aggregateType: 'landed_cost',
        aggregateId: String(event.data.landedCostId),
        data: event,
      });

      return this.mapLandedCost(voucherRes.rows[0]);
    });
  }

  // ─── 5. Lower of Cost or NRV Revaluation ─────────────────────────────────────

  async executeRevaluation(
    tenantId: string,
    actor: string,
    input: ExecuteRevaluationInputV1,
  ): Promise<InventoryRevaluationV1> {
    const profile = await this.getCostProfile(tenantId, input.costProfileId);

    return this.database.withTenantTransaction(tenantId, async (client: PoolClient) => {
      // 1. Fetch active layers for product & warehouse
      const layersRes = await client.query(
        `SELECT * FROM ${SCHEMA}.inventory_cost_layers
         WHERE tenant_id = $1 AND product_id = $2 AND warehouse_id = $3
           AND status IN ('ACTIVE', 'PARTIALLY_CONSUMED')`,
        [tenantId, input.productId, input.warehouseId],
      );

      if (layersRes.rows.length === 0) {
        throw new BadRequestException('No active inventory cost layers found for revaluation.');
      }

      let totalRemainingQtyScaled = 0n;
      let totalCurrentCarryingMinor = 0n;
      for (const r of layersRes.rows) {
        const qtyScaled = toScaledBigInt(r.remaining_quantity.toString());
        totalRemainingQtyScaled += qtyScaled;
        totalCurrentCarryingMinor += BigInt(r.total_remaining_cost_minor.toString());
      }

      const newUnitCostScaled = BigInt(input.newUnitCostScaled);
      const newCarryingMinor = (totalRemainingQtyScaled * newUnitCostScaled) / 10_000_000_000n;
      const deltaMinor = newCarryingMinor - totalCurrentCarryingMinor;

      if (deltaMinor === 0n) {
        throw new BadRequestException('Revaluation resulted in zero carrying value change.');
      }

      const now = new Date().toISOString();
      const revalId = randomUUID();

      // 2. Post GL journal
      let journalInput: PostJournalInputV1;
      if (deltaMinor < 0n) {
        // Write-down / Impairment loss: Debit Valuation Loss (6610), Credit Inventory (1400)
        const lossAmountMinor = (-deltaMinor).toString();
        journalInput = {
          accountingBookId: input.bookId,
          fiscalPeriodId: input.periodId,
          postingDate: input.revaluationDate || now,
          entryType: 'SUBLEDGER_INVENTORY',
          sourceDocumentType: 'COST_REVALUATION',
          sourceDocumentId: revalId,
          description: `Inventory Write-down (${input.reason})`,
          lines: [
            {
              accountId: profile.valuationLossGlAccountId,
              debitAmountMinor: lossAmountMinor,
              creditAmountMinor: '0',
              currencyCode: 'USD',
              exchangeRate: '1.000000',
              memo: `NRV Impairment Loss on Product ${input.productId}`,
            },
            {
              accountId: profile.inventoryGlAccountId,
              debitAmountMinor: '0',
              creditAmountMinor: lossAmountMinor,
              currencyCode: 'USD',
              exchangeRate: '1.000000',
              memo: `Inventory Write-down on Product ${input.productId}`,
            },
          ],
        };
      } else {
        // Write-up / Revaluation gain: Debit Inventory (1400), Credit Valuation Gain/Loss
        const gainAmountMinor = deltaMinor.toString();
        journalInput = {
          accountingBookId: input.bookId,
          fiscalPeriodId: input.periodId,
          postingDate: input.revaluationDate || now,
          entryType: 'SUBLEDGER_INVENTORY',
          sourceDocumentType: 'COST_REVALUATION',
          sourceDocumentId: revalId,
          description: `Inventory Revaluation (${input.reason})`,
          lines: [
            {
              accountId: profile.inventoryGlAccountId,
              debitAmountMinor: gainAmountMinor,
              creditAmountMinor: '0',
              currencyCode: 'USD',
              exchangeRate: '1.000000',
              memo: `Inventory Revaluation on Product ${input.productId}`,
            },
            {
              accountId: profile.valuationLossGlAccountId,
              debitAmountMinor: '0',
              creditAmountMinor: gainAmountMinor,
              currencyCode: 'USD',
              exchangeRate: '1.000000',
              memo: `Inventory Revaluation Gain on Product ${input.productId}`,
            },
          ],
        };
      }

      const journal = await this.financeService.postJournal(tenantId, actor, journalInput, client);

      // 3. Update layers to new unit cost
      for (const r of layersRes.rows) {
        const qtyScaled = toScaledBigInt(r.remaining_quantity.toString());
        const layerNewMinor = (qtyScaled * newUnitCostScaled) / 10_000_000_000n;
        await client.query(
          `UPDATE ${SCHEMA}.inventory_cost_layers
           SET unit_cost_scaled = $1, total_remaining_cost_minor = $2, status = 'REVALUED', updated_at = $3
           WHERE tenant_id = $4 AND id = $5`,
          [input.newUnitCostScaled, layerNewMinor.toString(), now, tenantId, r.id],
        );
      }

      // 4. Insert revaluation record
      const revalSql = `
        INSERT INTO ${SCHEMA}.inventory_revaluations (
          id, tenant_id, cost_profile_id, product_id, warehouse_id,
          revaluation_date, reason, previous_unit_cost_scaled, new_unit_cost_scaled,
          quantity, carrying_value_delta_minor, gl_journal_id, created_at
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12, $13
        ) RETURNING *;
      `;
      const revalRes = await client.query(revalSql, [
        revalId,
        tenantId,
        input.costProfileId,
        input.productId,
        input.warehouseId,
        input.revaluationDate || now,
        input.reason,
        layersRes.rows[0].unit_cost_scaled.toString(),
        input.newUnitCostScaled,
        fromScaledBigInt(totalRemainingQtyScaled),
        deltaMinor.toString(),
        journal.id,
        now,
      ]);

      // 5. Outbox event
      const event: InventoryRevaluationPostedEventV1 = {
        id: randomUUID(),
        source: 'gigalibs.financial-operations.costing',
        specversion: '1.0',
        datacontenttype: 'application/json',
        time: now,
        tenantId,
        type: 'finance.costing.revaluation.posted.v1',
        data: {
          revaluationId: revalId,
          productId: input.productId,
          deltaMinor: deltaMinor.toString(),
          glJournalId: journal.id,
        },
      };

      await appendOutboxEvent(client, tenantId, {
        id: event.id,
        type: event.type,
        aggregateType: 'cost_revaluation',
        aggregateId: String(event.data.revaluationId),
        data: event,
      });

      return this.mapRevaluation(revalRes.rows[0]);
    });
  }

  // ─── 6. Valuation Reporting ─────────────────────────────────────────────────

  async getValuationSummary(
    tenantId: string,
    warehouseId?: string,
  ): Promise<InventoryValuationSummaryV1[]> {
    let sql = `
      SELECT l.product_id, l.warehouse_id, cp.costing_method,
             SUM(l.remaining_quantity) as total_quantity,
             SUM(l.total_remaining_cost_minor) as total_valuation_minor,
             COUNT(l.id) as active_layer_count
      FROM ${SCHEMA}.inventory_cost_layers l
      JOIN ${SCHEMA}.cost_profiles cp ON l.cost_profile_id = cp.id
      WHERE l.tenant_id = $1 AND l.status IN ('ACTIVE', 'PARTIALLY_CONSUMED', 'REVALUED')
    `;
    const params: unknown[] = [tenantId];
    if (warehouseId) {
      sql += ` AND l.warehouse_id = $2`;
      params.push(warehouseId);
    }
    sql += ` GROUP BY l.product_id, l.warehouse_id, cp.costing_method`;

    const res = await this.query(tenantId, sql, params);

    return res.rows.map((r) => {
      const totalQtyScaled = toScaledBigInt(r.total_quantity.toString());
      const totalValuationMinor = BigInt(r.total_valuation_minor.toString());
      // Effective average unit cost scaled: (Valuation minor * 10^10) / QtyScaled
      const effectiveAvgCostScaled =
        totalQtyScaled > 0n ? (totalValuationMinor * 10_000_000_000n) / totalQtyScaled : 0n;

      return {
        productId: r.product_id,
        productCode: `PRD-${r.product_id.slice(0, 8)}`,
        warehouseId: r.warehouse_id,
        totalQuantity: r.total_quantity.toString(),
        effectiveAverageCostScaled: effectiveAvgCostScaled.toString(),
        totalValuationMinor: r.total_valuation_minor.toString(),
        costingMethod: r.costing_method,
        activeLayerCount: parseInt(r.active_layer_count.toString(), 10),
      };
    });
  }

  // ─── Data Mappers ───────────────────────────────────────────────────────────

  private mapCostProfile(row: Record<string, any>): CostProfileV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      code: row.code,
      name: row.name,
      description: row.description,
      costingMethod: row.costing_method,
      inventoryGlAccountId: row.inventory_gl_account_id,
      grniGlAccountId: row.grni_gl_account_id,
      cogsGlAccountId: row.cogs_gl_account_id,
      landedCostClearingGlAccountId: row.landed_cost_clearing_gl_account_id,
      purchasePriceVarianceGlAccountId: row.purchase_price_variance_gl_account_id,
      scrapGlAccountId: row.scrap_gl_account_id,
      valuationLossGlAccountId: row.valuation_loss_gl_account_id,
      standardUnitCostScaled: row.standard_unit_cost_scaled?.toString() ?? null,
      isDefault: Boolean(row.is_default),
      isActive: Boolean(row.is_active),
      version: row.version,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private mapCostLayer(row: Record<string, any>): InventoryCostLayerV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      costProfileId: row.cost_profile_id,
      productId: row.product_id,
      warehouseId: row.warehouse_id,
      receiptRef: row.receipt_ref,
      receiptDate: new Date(row.receipt_date).toISOString(),
      initialQuantity: row.initial_quantity.toString(),
      remainingQuantity: row.remaining_quantity.toString(),
      unitCostScaled: row.unit_cost_scaled.toString(),
      totalInitialCostMinor: row.total_initial_cost_minor.toString(),
      totalRemainingCostMinor: row.total_remaining_cost_minor.toString(),
      landedCostAddedMinor: (row.landed_cost_added_minor || 0).toString(),
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private mapConsumption(row: Record<string, any>): CostLayerConsumptionV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      costLayerId: row.cost_layer_id,
      transactionRef: row.transaction_ref,
      transactionType: row.transaction_type,
      quantityConsumed: row.quantity_consumed.toString(),
      unitCostScaled: row.unit_cost_scaled.toString(),
      costMinor: row.cost_minor.toString(),
      consumedAt: new Date(row.consumed_at).toISOString(),
      glJournalId: row.gl_journal_id,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  private mapLandedCost(row: Record<string, any>): LandedCostV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      voucherNumber: row.voucher_number,
      description: row.description,
      allocationBasis: row.allocation_basis,
      totalLandedCostMinor: row.total_landed_cost_minor.toString(),
      currencyCode: row.currency_code,
      status: row.status,
      glJournalId: row.gl_journal_id,
      postedAt: row.posted_at ? new Date(row.posted_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  private mapRevaluation(row: Record<string, any>): InventoryRevaluationV1 {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      productId: row.product_id,
      warehouseId: row.warehouse_id,
      revaluationDate: new Date(row.revaluation_date).toISOString(),
      reason: row.reason,
      previousUnitCostScaled: row.previous_unit_cost_scaled.toString(),
      newUnitCostScaled: row.new_unit_cost_scaled.toString(),
      quantity: row.quantity.toString(),
      carryingValueDeltaMinor: row.carrying_value_delta_minor.toString(),
      glJournalId: row.gl_journal_id,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }
}
