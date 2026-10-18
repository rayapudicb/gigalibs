import { createHash, randomUUID } from 'node:crypto';
import {
  type ApproveAdjustmentInputV1,
  type BarcodeResolutionResultV1,
  type CountEntryV1,
  type CountPlanV1,
  type CreateCountPlanInputV1,
  type CreateInventoryItemInputV1,
  type CreateKitInputV1,
  type CreateLocationInputV1,
  type CreateLotInputV1,
  type CreateReceiptInputV1,
  type CreateReservationInputV1,
  type CreateWarehouseInputV1,
  type InventoryAdjustmentV1,
  type InventoryItemV1,
  type InventoryKitV1,
  type InventoryLocationV1,
  type InventoryLotV1,
  type InventoryReceiptV1,
  type InventoryReservationV1,
  type InventoryTransferV1,
  type InventoryWarehouseV1,
  type PostStockMovementInputV1,
  type StockBalanceV1,
  type StockLedgerEntryV1,
  type StockLedgerTransactionV1,
  type SubmitCountEntryInputV1,
  type UpdateWarehouseInputV1,
  ExactDecimal,
  SCALE_FACTOR,
} from '@gigalibs/contracts';
import {
  type ModuleCommandContext,
  type ModulePrincipal,
  OrganizationReplica,
  assertOwningUnit,
  organizationAccess,
  moduleErrors,
} from '@gigalibs/module-sdk';
import { validateDictionaryRules } from '@gigalibs/configuration-core';
import type { DictionaryValidationRuleV1 } from '@gigalibs/contracts';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type pg from 'pg';
import { SCHEMA, TOPIC } from '../config.js';
import { DatabaseService } from '../database.service.js';

/**
 * WI-OI-120ak (S3b): the suffix of a document number (MOV-, REC-, ISSUE-, KIT-, CNT-, ADJ-). It was a non-crypto
 * random number from 0 to 999, predictable and, within one millisecond, colliding one time in a thousand with the per-tenant unique
 * numbers (a multi-line receipt could fail). Eight hex characters from a random UUID.
 */
const documentSuffix = (): string => randomUUID().slice(0, 8);

export const errors = moduleErrors('UNIVERSAL_INVENTORY', 'Universal Inventory');

/**
 * Validates custom extension fields against Application Dictionary constraints and Safe AST rules.
 */
export function validateCustomExtensions(
  extensions: Record<string, unknown> | undefined,
  rules: readonly DictionaryValidationRuleV1[] = [],
): void {
  if (!extensions) return;
  if (typeof extensions !== 'object' || Array.isArray(extensions)) {
    throw new BadRequestException('Custom extensions must be a JSON object.');
  }
  if (
    Object.prototype.hasOwnProperty.call(extensions, '__proto__') ||
    (Object.getPrototypeOf(extensions) !== Object.prototype && Object.getPrototypeOf(extensions) !== null)
  ) {
    throw new BadRequestException('Extension key "__proto__" is prohibited.');
  }
  const propNames = Object.getOwnPropertyNames(extensions);
  if (propNames.length > 100) {
    throw new BadRequestException('Custom extensions exceed maximum limit of 100 fields.');
  }
  for (const key of propNames) {
    if (key.length > 100) {
      throw new BadRequestException(`Extension key "${key}" exceeds maximum length of 100 characters.`);
    }
    if (key.startsWith('__') || key === 'constructor' || key === 'prototype') {
      throw new BadRequestException(`Extension key "${key}" is prohibited.`);
    }
    const val = extensions[key];
    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      validateCustomExtensions(val as Record<string, unknown>, rules);
    }
  }
  if (rules.length > 0) {
    const errorMap = validateDictionaryRules(rules, extensions);
    const errKeys = Object.keys(errorMap);
    if (errKeys.length > 0) {
      throw new BadRequestException(
        `Application Dictionary validation failed: ${errKeys.map((k) => `${k}: ${errorMap[k]}`).join(', ')}`,
      );
    }
  }
}

@Injectable()
export class InventoryService {
  private readonly orgReplica = new OrganizationReplica(SCHEMA);

  constructor(private readonly database: DatabaseService) {}

  // ─── Warehouses ─────────────────────────────────────────────────────────────

  async createWarehouse(
    principal: ModulePrincipal,
    input: CreateWarehouseInputV1,
    context?: ModuleCommandContext,
  ): Promise<InventoryWarehouseV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      if (input.orgUnitId) {
        const access = await organizationAccess(this.orgReplica, client, principal.tenantId, principal.organization ?? { mode: 'TENANT' });
        await assertOwningUnit(this.orgReplica, client, principal.tenantId, access, 'EITHER', input.orgUnitId);
      }
      const existing = await client.query(
        `SELECT id FROM ${SCHEMA}.warehouses WHERE tenant_id = $1 AND code = $2`,
        [principal.tenantId, input.code],
      );
      if (existing.rowCount && existing.rowCount > 0) {
        throw new ConflictException(`Warehouse code ${input.code} already exists.`);
      }

      const id = randomUUID();
      const now = new Date().toISOString();
      const res = await client.query(
        `INSERT INTO ${SCHEMA}.warehouses (
          id, tenant_id, code, name, description, warehouse_type, org_unit_id, place_id,
          address, active, version, created_by, updated_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, 1, $10, $10, $11, $11)
        RETURNING *`,
        [
          id,
          principal.tenantId,
          input.code,
          input.name,
          input.description ?? null,
          input.warehouseType,
          input.orgUnitId ?? null,
          input.placeId ?? null,
          input.address ?? null,
          principal.subject,
          now,
        ],
      );
      return mapWarehouse(res.rows[0]);
    });
  }

  async listWarehouses(principal: ModulePrincipal): Promise<InventoryWarehouseV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM ${SCHEMA}.warehouses WHERE tenant_id = $1 ORDER BY code ASC`,
        [principal.tenantId],
      );
      return res.rows.map(mapWarehouse);
    });
  }

  async getWarehouse(principal: ModulePrincipal, id: string): Promise<InventoryWarehouseV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM ${SCHEMA}.warehouses WHERE tenant_id = $1 AND id = $2`,
        [principal.tenantId, id],
      );
      if (res.rowCount === 0) throw new NotFoundException('Warehouse not found.');
      return mapWarehouse(res.rows[0]);
    });
  }

  // ─── Locations ──────────────────────────────────────────────────────────────

  async createLocation(
    principal: ModulePrincipal,
    input: CreateLocationInputV1,
  ): Promise<InventoryLocationV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const existing = await client.query(
        `SELECT id FROM ${SCHEMA}.locations WHERE tenant_id = $1 AND warehouse_id = $2 AND code = $3`,
        [principal.tenantId, input.warehouseId, input.code],
      );
      if (existing.rowCount && existing.rowCount > 0) {
        throw new ConflictException(`Location code ${input.code} already exists in this warehouse.`);
      }

      const id = randomUUID();
      const now = new Date().toISOString();
      const res = await client.query(
        `INSERT INTO ${SCHEMA}.locations (
          id, tenant_id, warehouse_id, code, name, location_type, parent_location_id,
          aisle, rack, shelf, bin, barcode, allow_negative, active, version, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true, 1, $14, $14)
        RETURNING *`,
        [
          id,
          principal.tenantId,
          input.warehouseId,
          input.code,
          input.name,
          input.locationType,
          input.parentLocationId ?? null,
          input.aisle ?? null,
          input.rack ?? null,
          input.shelf ?? null,
          input.bin ?? null,
          input.barcode ?? null,
          input.allowNegative ?? false,
          now,
        ],
      );
      return mapLocation(res.rows[0]);
    });
  }

  async listLocations(principal: ModulePrincipal, warehouseId?: string): Promise<InventoryLocationV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const query = warehouseId
        ? `SELECT * FROM ${SCHEMA}.locations WHERE tenant_id = $1 AND warehouse_id = $2 ORDER BY code ASC`
        : `SELECT * FROM ${SCHEMA}.locations WHERE tenant_id = $1 ORDER BY code ASC`;
      const params = warehouseId ? [principal.tenantId, warehouseId] : [principal.tenantId];
      const res = await client.query(query, params);
      return res.rows.map(mapLocation);
    });
  }

  // ─── Inventory Items ────────────────────────────────────────────────────────

  async createItem(
    principal: ModulePrincipal,
    input: CreateInventoryItemInputV1,
  ): Promise<InventoryItemV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const id = randomUUID();
      const now = new Date().toISOString();
      const res = await client.query(
        `INSERT INTO ${SCHEMA}.inventory_items (
          id, tenant_id, product_id, default_warehouse_id, default_location_id,
          is_lot_tracked, is_serial_tracked, shelf_life_days, reorder_point, safety_stock,
          valuation_method, standard_cost_minor, active, version, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, 1, $13, $13)
        ON CONFLICT (tenant_id, product_id) DO UPDATE SET
          default_warehouse_id = EXCLUDED.default_warehouse_id,
          default_location_id = EXCLUDED.default_location_id,
          is_lot_tracked = EXCLUDED.is_lot_tracked,
          is_serial_tracked = EXCLUDED.is_serial_tracked,
          reorder_point = EXCLUDED.reorder_point,
          safety_stock = EXCLUDED.safety_stock,
          updated_at = EXCLUDED.updated_at
        RETURNING *`,
        [
          id,
          principal.tenantId,
          input.productId,
          input.defaultWarehouseId ?? null,
          input.defaultLocationId ?? null,
          input.isLotTracked ?? false,
          input.isSerialTracked ?? false,
          input.shelfLifeDays ?? null,
          input.reorderPoint ?? null,
          input.safetyStock ?? null,
          input.valuationMethod ?? 'STANDARD',
          input.standardCostMinor ?? '0',
          now,
        ],
      );
      return mapItem(res.rows[0]);
    });
  }

  // ─── Lots & Application Dictionary Metadata ─────────────────────────────────

  async createLot(
    principal: ModulePrincipal,
    input: CreateLotInputV1,
    dictionaryRules?: readonly DictionaryValidationRuleV1[],
  ): Promise<InventoryLotV1> {
    validateCustomExtensions(input.customExtensions, dictionaryRules);

    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const id = randomUUID();
      const now = new Date().toISOString();
      const checksum = input.customExtensions
        ? createHash('sha256').update(JSON.stringify(input.customExtensions)).digest('hex')
        : null;

      const res = await client.query(
        `INSERT INTO ${SCHEMA}.inventory_lots (
          id, tenant_id, product_id, lot_number, batch_code, supplier_lot_number,
          manufactured_date, expiry_date, status, custom_extensions, manifest_checksum,
          version, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'AVAILABLE', $9, $10, 1, $11, $11)
        RETURNING *`,
        [
          id,
          principal.tenantId,
          input.productId,
          input.lotNumber,
          input.batchCode ?? null,
          input.supplierLotNumber ?? null,
          input.manufacturedDate ?? null,
          input.expiryDate ?? null,
          JSON.stringify(input.customExtensions ?? {}),
          checksum,
          now,
        ],
      );
      return mapLot(res.rows[0]);
    });
  }

  // ─── Stock Movements & Double-Entry Ledger ──────────────────────────────────

  async postMovement(
    principal: ModulePrincipal,
    input: PostStockMovementInputV1,
  ): Promise<{ transaction: StockLedgerTransactionV1; entries: StockLedgerEntryV1[] }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      // Idempotency verification
      const existingIdempotency = await client.query(
        `SELECT response_payload FROM ${SCHEMA}.idempotency_records WHERE tenant_id = $1 AND idempotency_key = $2`,
        [principal.tenantId, input.idempotencyKey],
      );
      if (existingIdempotency.rowCount && existingIdempotency.rowCount > 0) {
        return existingIdempotency.rows[0].response_payload;
      }

      const txId = randomUUID();
      const txNumber = `MOV-${Date.now()}-${documentSuffix()}`;
      const now = new Date().toISOString();
      const stockStatus = input.stockStatus ?? 'AVAILABLE';

      // 1. Insert Transaction Header
      const txRes = await client.query(
        `INSERT INTO ${SCHEMA}.stock_ledger_transactions (
          id, tenant_id, transaction_number, document_type, document_reference_id,
          reason, correlation_id, idempotency_key, posted_by, posted_at, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
        RETURNING *`,
        [
          txId,
          principal.tenantId,
          txNumber,
          input.documentType,
          input.documentReferenceId ?? null,
          input.reason,
          input.correlationId,
          input.idempotencyKey,
          principal.subject,
          now,
        ],
      );
      const tx = mapLedgerTx(txRes.rows[0]);
      const entries: StockLedgerEntryV1[] = [];

      // 2. CREDIT source location (if provided)
      if (input.sourceLocationId) {
        const sourceLocRes = await client.query(
          `SELECT allow_negative, warehouse_id FROM ${SCHEMA}.locations WHERE tenant_id = $1 AND id = $2`,
          [principal.tenantId, input.sourceLocationId],
        );
        if (sourceLocRes.rowCount === 0) throw new NotFoundException('Source location not found.');
        const { allow_negative: allowNegative, warehouse_id: srcWarehouseId } = sourceLocRes.rows[0];

        // Fetch or create source balance FOR UPDATE
        const srcBalRes = await client.query(
          `SELECT * FROM ${SCHEMA}.stock_balances
           WHERE tenant_id = $1 AND warehouse_id = $2 AND location_id = $3 AND product_id = $4 AND uom_id = $5
             AND COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE($6, '00000000-0000-0000-0000-000000000000'::uuid)
             AND stock_status = $7
           FOR UPDATE`,
          [
            principal.tenantId,
            srcWarehouseId,
            input.sourceLocationId,
            input.productId,
            input.uomId,
            input.lotId ?? null,
            stockStatus,
          ],
        );

        const currentOnHand = srcBalRes.rowCount && srcBalRes.rowCount > 0
          ? String(srcBalRes.rows[0].on_hand_quantity)
          : '0.000000';
        const currentReserved = srcBalRes.rowCount && srcBalRes.rowCount > 0
          ? String(srcBalRes.rows[0].reserved_quantity)
          : '0.000000';

        if (ExactDecimal.isLessThan(currentOnHand, input.quantity) && !allowNegative) {
          throw new BadRequestException(
            `Insufficient stock at source location (On Hand: ${currentOnHand}, Requested: ${input.quantity}). Negative stock is not permitted.`,
          );
        }

        const newOnHand = ExactDecimal.subtract(currentOnHand, input.quantity);
        const newAvail = ExactDecimal.subtract(newOnHand, currentReserved);

        if (srcBalRes.rowCount && srcBalRes.rowCount > 0) {
          await client.query(
            `UPDATE ${SCHEMA}.stock_balances
             SET on_hand_quantity = $1, available_quantity = $2, last_movement_at = $3, version = version + 1, updated_at = $3
             WHERE id = $4`,
            [newOnHand, newAvail, now, srcBalRes.rows[0].id],
          );
        } else {
          await client.query(
            `INSERT INTO ${SCHEMA}.stock_balances (
              id, tenant_id, warehouse_id, location_id, product_id, uom_id, lot_id, serial_id,
              stock_status, on_hand_quantity, reserved_quantity, available_quantity, last_movement_at, version, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $10, $11, 1, $11)`,
            [
              randomUUID(),
              principal.tenantId,
              srcWarehouseId,
              input.sourceLocationId,
              input.productId,
              input.uomId,
              input.lotId ?? null,
              input.serialId ?? null,
              stockStatus,
              newOnHand,
              now,
            ],
          );
        }

        const creditEntryRes = await client.query(
          `INSERT INTO ${SCHEMA}.stock_ledger_entries (
            id, tenant_id, transaction_id, direction, warehouse_id, location_id, product_id,
            uom_id, quantity, base_quantity, lot_id, serial_id, stock_status, unit_cost_minor, total_cost_minor, created_at
          ) VALUES ($1, $2, $3, 'CREDIT', $4, $5, $6, $7, $8, $8, $9, $10, $11, $12, $13, $14)
          RETURNING *`,
          [
            randomUUID(),
            principal.tenantId,
            txId,
            srcWarehouseId,
            input.sourceLocationId,
            input.productId,
            input.uomId,
            input.quantity,
            input.lotId ?? null,
            input.serialId ?? null,
            stockStatus,
            input.unitCostMinor ?? null,
            input.unitCostMinor ? ((BigInt(input.unitCostMinor) * ExactDecimal.toScaledBigInt(input.quantity)) / SCALE_FACTOR).toString() : null,
            now,
          ],
        );
        entries.push(mapLedgerEntry(creditEntryRes.rows[0]));
      }

      // 3. DEBIT target location
      const tgtBalRes = await client.query(
        `SELECT * FROM ${SCHEMA}.stock_balances
         WHERE tenant_id = $1 AND warehouse_id = $2 AND location_id = $3 AND product_id = $4 AND uom_id = $5
           AND COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE($6, '00000000-0000-0000-0000-000000000000'::uuid)
           AND stock_status = $7
         FOR UPDATE`,
        [
          principal.tenantId,
          input.targetWarehouseId,
          input.targetLocationId,
          input.productId,
          input.uomId,
          input.lotId ?? null,
          stockStatus,
        ],
      );

      const targetCurrentOnHand = tgtBalRes.rowCount && tgtBalRes.rowCount > 0
        ? String(tgtBalRes.rows[0].on_hand_quantity)
        : '0.000000';
      const targetCurrentReserved = tgtBalRes.rowCount && tgtBalRes.rowCount > 0
        ? String(tgtBalRes.rows[0].reserved_quantity)
        : '0.000000';
      const targetNewOnHand = ExactDecimal.add(targetCurrentOnHand, input.quantity);
      const targetNewAvail = ExactDecimal.subtract(targetNewOnHand, targetCurrentReserved);

      if (tgtBalRes.rowCount && tgtBalRes.rowCount > 0) {
        await client.query(
          `UPDATE ${SCHEMA}.stock_balances
           SET on_hand_quantity = $1, available_quantity = $2, last_movement_at = $3, version = version + 1, updated_at = $3
           WHERE id = $4`,
          [targetNewOnHand, targetNewAvail, now, tgtBalRes.rows[0].id],
        );
      } else {
        await client.query(
          `INSERT INTO ${SCHEMA}.stock_balances (
            id, tenant_id, warehouse_id, location_id, product_id, uom_id, lot_id, serial_id,
            stock_status, on_hand_quantity, reserved_quantity, available_quantity, last_movement_at, version, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $10, $11, 1, $11)`,
          [
            randomUUID(),
            principal.tenantId,
            input.targetWarehouseId,
            input.targetLocationId,
            input.productId,
            input.uomId,
            input.lotId ?? null,
            input.serialId ?? null,
            stockStatus,
            targetNewOnHand,
            now,
          ],
        );
      }

      const debitEntryRes = await client.query(
        `INSERT INTO ${SCHEMA}.stock_ledger_entries (
          id, tenant_id, transaction_id, direction, warehouse_id, location_id, product_id,
          uom_id, quantity, base_quantity, lot_id, serial_id, stock_status, unit_cost_minor, total_cost_minor, created_at
        ) VALUES ($1, $2, $3, 'DEBIT', $4, $5, $6, $7, $8, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *`,
        [
          randomUUID(),
          principal.tenantId,
          txId,
          input.targetWarehouseId,
          input.targetLocationId,
          input.productId,
          input.uomId,
          input.quantity,
          input.lotId ?? null,
          input.serialId ?? null,
          stockStatus,
          input.unitCostMinor ?? null,
          input.unitCostMinor ? ((BigInt(input.unitCostMinor) * ExactDecimal.toScaledBigInt(input.quantity)) / SCALE_FACTOR).toString() : null,
          now,
        ],
      );
      entries.push(mapLedgerEntry(debitEntryRes.rows[0]));

      // 4. Emit Outbox Event
      await client.query(
        `INSERT INTO ${SCHEMA}.outbox_events (
          id, tenant_id, event_type, payload, status, created_at
        ) VALUES ($1, $2, $3, $4, 'PENDING', $5)`,
        [
          randomUUID(),
          principal.tenantId,
          'inventory.stock.moved.v1',
          JSON.stringify({
            transactionId: txId,
            transactionNumber: txNumber,
            reason: input.reason,
            productId: input.productId,
            quantity: input.quantity,
            sourceLocationId: input.sourceLocationId ?? null,
            targetLocationId: input.targetLocationId,
          }),
          now,
        ],
      );

      const result = { transaction: tx, entries };

      // 5. Store Idempotency Record
      await client.query(
        `INSERT INTO ${SCHEMA}.idempotency_records (
          tenant_id, idempotency_key, resource_id, action, response_payload, created_at
        ) VALUES ($1, $2, $3, 'STOCK_MOVEMENT', $4, $5)`,
        [principal.tenantId, input.idempotencyKey, txId, JSON.stringify(result), now],
      );

      return result;
    });
  }

  // ─── Balances & Ledger Queries ──────────────────────────────────────────────

  async listBalances(principal: ModulePrincipal, warehouseId?: string): Promise<StockBalanceV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const query = warehouseId
        ? `SELECT * FROM ${SCHEMA}.stock_balances WHERE tenant_id = $1 AND warehouse_id = $2 ORDER BY updated_at DESC`
        : `SELECT * FROM ${SCHEMA}.stock_balances WHERE tenant_id = $1 ORDER BY updated_at DESC`;
      const params = warehouseId ? [principal.tenantId, warehouseId] : [principal.tenantId];
      const res = await client.query(query, params);
      return res.rows.map(mapBalance);
    });
  }

  async listLedgerEntries(principal: ModulePrincipal, productId?: string): Promise<StockLedgerEntryV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const query = productId
        ? `SELECT * FROM ${SCHEMA}.stock_ledger_entries WHERE tenant_id = $1 AND product_id = $2 ORDER BY created_at DESC LIMIT 100`
        : `SELECT * FROM ${SCHEMA}.stock_ledger_entries WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 100`;
      const params = productId ? [principal.tenantId, productId] : [principal.tenantId];
      const res = await client.query(query, params);
      return res.rows.map(mapLedgerEntry);
    });
  }

  // ─── Inbound Receipts ───────────────────────────────────────────────────────

  async createReceipt(
    principal: ModulePrincipal,
    input: CreateReceiptInputV1,
  ): Promise<InventoryReceiptV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const receiptId = randomUUID();
      const receiptNumber = `REC-${Date.now()}-${documentSuffix()}`;
      const now = new Date().toISOString();

      await client.query(
        `INSERT INTO ${SCHEMA}.receipts (
          id, tenant_id, receipt_number, warehouse_id, supplier_party_id, carrier_party_id,
          external_document_reference, status, notes, version, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRAFT', $8, 1, $9, $9)`,
        [
          receiptId,
          principal.tenantId,
          receiptNumber,
          input.warehouseId,
          input.supplierPartyId ?? null,
          input.carrierPartyId ?? null,
          input.externalDocumentReference ?? null,
          input.notes ?? null,
          now,
        ],
      );

      if (input.lines && input.lines.length > 0) {
        for (let idx = 0; idx < input.lines.length; idx++) {
          const line = input.lines[idx];
          await client.query(
            `INSERT INTO ${SCHEMA}.receipt_lines (
              id, tenant_id, receipt_id, line_number, product_id, uom_id,
              expected_quantity, received_quantity, target_location_id, lot_number,
              expiry_date, inspection_status, purchase_order_id, purchase_order_line_id,
              custom_extensions, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8, $9, $10, 'PENDING', $11, $12, $13, $14, $14)`,
            [
              randomUUID(),
              principal.tenantId,
              receiptId,
              idx + 1,
              line.productId,
              line.uomId,
              line.expectedQuantity,
              line.targetLocationId ?? null,
              line.lotNumber ?? null,
              line.expiryDate ?? null,
              line.purchaseOrderId ?? null,
              line.purchaseOrderLineId ?? null,
              JSON.stringify(line.customExtensions ?? {}),
              now,
            ],
          );
        }
      }

      return this.fetchReceipt(client, principal.tenantId, receiptId);
    });
  }

  private async fetchReceipt(client: pg.PoolClient, tenantId: string, receiptId: string): Promise<InventoryReceiptV1> {
    const res = await client.query(
      `SELECT * FROM ${SCHEMA}.receipts WHERE tenant_id = $1 AND id = $2`,
      [tenantId, receiptId],
    );
    if (res.rowCount === 0) throw new NotFoundException('Receipt not found.');
    const row = res.rows[0];
    if (row.status === 'COMPLETED' && !row.finance_posting_status) {
      const outbox = await client.query<{ status: string }>(
        `SELECT status FROM ${SCHEMA}.outbox_events
          WHERE tenant_id = $1 AND aggregate_id = $2 AND event_type = 'inventory.receipt.completed.v1'
          ORDER BY created_at DESC LIMIT 1`,
        [tenantId, receiptId],
      );
      row.outbox_status = outbox.rows[0]?.status ?? null;
    }
    const linesRes = await client.query(
      `SELECT * FROM ${SCHEMA}.receipt_lines WHERE tenant_id = $1 AND receipt_id = $2 ORDER BY line_number ASC`,
      [tenantId, receiptId],
    );
    return mapReceipt(row, linesRes.rows);
  }

  async getReceipt(principal: ModulePrincipal, receiptId: string): Promise<InventoryReceiptV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      return this.fetchReceipt(client, principal.tenantId, receiptId);
    });
  }

  async completeReceipt(
    principal: ModulePrincipal,
    receiptId: string,
  ): Promise<InventoryReceiptV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const receiptRes = await client.query(
        `SELECT * FROM ${SCHEMA}.receipts WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [principal.tenantId, receiptId],
      );
      if (receiptRes.rowCount === 0) throw new NotFoundException('Receipt not found.');
      const receipt = receiptRes.rows[0];
      if (receipt.status === 'COMPLETED') {
        throw new ConflictException('Receipt is already completed.');
      }

      const linesRes = await client.query(
        `SELECT * FROM ${SCHEMA}.receipt_lines WHERE tenant_id = $1 AND receipt_id = $2`,
        [principal.tenantId, receiptId],
      );

      const now = new Date().toISOString();

      // Post movements for each line into target location
      for (const line of linesRes.rows) {
        if (!line.target_location_id) {
          throw new BadRequestException(`Line ${line.line_number} has no target receiving location assigned.`);
        }
        const qtyToReceive = line.received_quantity > 0 ? line.received_quantity : line.expected_quantity;

        // If lot tracked and lotNumber present, ensure lot exists
        let lotId: string | null = null;
        if (line.lot_number) {
          const lotRes = await client.query(
            `INSERT INTO ${SCHEMA}.inventory_lots (
              id, tenant_id, product_id, lot_number, manufactured_date, expiry_date, status,
              custom_extensions, version, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, 'AVAILABLE', $7, 1, $8, $8)
            ON CONFLICT (tenant_id, product_id, lot_number) DO UPDATE SET updated_at = EXCLUDED.updated_at
            RETURNING id`,
            [
              randomUUID(),
              principal.tenantId,
              line.product_id,
              line.lot_number,
              now,
              line.expiry_date ?? null,
              JSON.stringify(line.custom_extensions ?? {}),
              now,
            ],
          );
          lotId = lotRes.rows[0].id;
        }

        // Post stock movement directly inside this transaction
        const txId = randomUUID();
        const txNumber = `REC-MOV-${Date.now()}-${documentSuffix()}`;

        await client.query(
          `INSERT INTO ${SCHEMA}.stock_ledger_transactions (
            id, tenant_id, transaction_number, document_type, document_reference_id,
            reason, correlation_id, idempotency_key, posted_by, posted_at, created_at
          ) VALUES ($1, $2, $3, 'RECEIPT', $4, 'RECEIPT', $5, $6, $7, $8, $8)`,
          [
            txId,
            principal.tenantId,
            txNumber,
            receiptId,
            receiptId,
            randomUUID(),
            principal.subject,
            now,
          ],
        );

        await client.query(
          `INSERT INTO ${SCHEMA}.stock_ledger_entries (
            id, tenant_id, transaction_id, direction, warehouse_id, location_id, product_id,
            uom_id, quantity, base_quantity, lot_id, serial_id, stock_status, created_at
          ) VALUES ($1, $2, $3, 'DEBIT', $4, $5, $6, $7, $8, $8, $9, NULL, 'AVAILABLE', $10)`,
          [
            randomUUID(),
            principal.tenantId,
            txId,
            receipt.warehouse_id,
            line.target_location_id,
            line.product_id,
            line.uom_id,
            qtyToReceive,
            lotId,
            now,
          ],
        );

        // Update balance
        await client.query(
          `INSERT INTO ${SCHEMA}.stock_balances (
            id, tenant_id, warehouse_id, location_id, product_id, uom_id, lot_id, serial_id,
            stock_status, on_hand_quantity, reserved_quantity, available_quantity, last_movement_at, version, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL, 'AVAILABLE', $8, 0, $8, $9, 1, $9)
          ON CONFLICT (
            tenant_id, warehouse_id, location_id, product_id, uom_id,
            (COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::uuid)),
            (COALESCE(serial_id, '00000000-0000-0000-0000-000000000000'::uuid)),
            stock_status
          ) DO UPDATE SET
            on_hand_quantity = stock_balances.on_hand_quantity + EXCLUDED.on_hand_quantity,
            available_quantity = (stock_balances.on_hand_quantity + EXCLUDED.on_hand_quantity) - stock_balances.reserved_quantity,
            last_movement_at = EXCLUDED.last_movement_at,
            updated_at = EXCLUDED.updated_at,
            version = stock_balances.version + 1`,
          [
            randomUUID(),
            principal.tenantId,
            receipt.warehouse_id,
            line.target_location_id,
            line.product_id,
            line.uom_id,
            lotId,
            qtyToReceive,
            now,
          ],
        );

        await client.query(
          `UPDATE ${SCHEMA}.receipt_lines SET received_quantity = $1, updated_at = $2 WHERE id = $3`,
          [qtyToReceive, now, line.id],
        );
      }

      await client.query(
        `UPDATE ${SCHEMA}.receipts SET status = 'COMPLETED', completed_at = $1, updated_at = $1, version = version + 1,
          finance_posting_status = 'AWAITING_POSTING', finance_posting_rejection_code = NULL WHERE id = $2`,
        [now, receiptId],
      );

      const completedLinesRes = await client.query(
        `SELECT * FROM ${SCHEMA}.receipt_lines WHERE tenant_id = $1 AND receipt_id = $2 ORDER BY line_number ASC`,
        [principal.tenantId, receiptId],
      );

      const eventPayload = {
        receiptId,
        receiptNumber: receipt.receipt_number,
        warehouseId: receipt.warehouse_id,
        receivedAt: now,
        lines: completedLinesRes.rows.map((l) => ({
          receiptLineId: l.id,
          productId: l.product_id,
          receivedQuantity: ExactDecimal.fromScaledBigInt(ExactDecimal.toScaledBigInt(String(l.received_quantity))),
          uomId: l.uom_id,
          purchaseOrderId: l.purchase_order_id ?? null,
          purchaseOrderLineId: l.purchase_order_line_id ?? null,
        })),
      };

      // Emit receipt completed event into Delta-5 outbox
      await client.query(
        `INSERT INTO ${SCHEMA}.outbox_events (
          id, tenant_id, topic, event_type, aggregate_type, aggregate_id,
          aggregate_version, correlation_id, schema_version, payload, status, created_at
        ) VALUES ($1, $2, $3, $4, 'receipt', $5, $6, $5, 1, $7, 'PENDING', $8)`,
        [
          randomUUID(),
          principal.tenantId,
          TOPIC,
          'inventory.receipt.completed.v1',
          receiptId,
          receipt.version + 1,
          JSON.stringify(eventPayload),
          now,
        ],
      );

      return this.fetchReceipt(client, principal.tenantId, receiptId);
    });
  }

  // ─── Reservations (CMMS Work Orders) ────────────────────────────────────────

  async createReservation(
    principal: ModulePrincipal,
    input: CreateReservationInputV1,
  ): Promise<InventoryReservationV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      // 1. Check idempotency if key provided
      if (input.idempotencyKey) {
        const existingRec = await client.query(
          `SELECT response_payload FROM ${SCHEMA}.idempotency_records WHERE tenant_id = $1 AND idempotency_key = $2`,
          [principal.tenantId, input.idempotencyKey],
        );
        if (existingRec.rowCount && existingRec.rowCount > 0) {
          return existingRec.rows[0].response_payload as InventoryReservationV1;
        }
      }

      // Check if active reservation already exists for demand reference
      const existingRes = await client.query(
        `SELECT * FROM ${SCHEMA}.inventory_reservations
         WHERE tenant_id = $1 AND demand_type = $2 AND demand_reference_id = $3
           AND COALESCE(demand_line_id, '') = COALESCE($4, '') AND status = 'ACTIVE'
         LIMIT 1`,
        [principal.tenantId, input.demandType, input.demandReferenceId, input.demandLineId ?? ''],
      );
      if (existingRes.rowCount && existingRes.rowCount > 0) {
        return mapReservation(existingRes.rows[0]);
      }

      // 2. Lock ALL candidate balance rows deterministically in ascending ID order FOR UPDATE
      const balRes = await client.query(
        `SELECT id, on_hand_quantity, reserved_quantity, available_quantity
         FROM ${SCHEMA}.stock_balances
         WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3 AND uom_id = $4 AND stock_status = 'AVAILABLE'
         ORDER BY id ASC
         FOR UPDATE`,
        [principal.tenantId, input.warehouseId, input.productId, input.uomId],
      );

      let totalAvail = '0.000000';
      for (const row of balRes.rows) {
        totalAvail = ExactDecimal.add(totalAvail, String(row.available_quantity));
      }

      if (ExactDecimal.isLessThan(totalAvail, input.quantity)) {
        throw new BadRequestException(
          `Shortage detected: Available stock is ${totalAvail}, requested reservation is ${input.quantity}.`,
        );
      }

      // 3. Allocate reserved quantity across the locked balance rows
      let remainingToReserve = input.quantity;
      const now = new Date().toISOString();

      for (const row of balRes.rows) {
        if (ExactDecimal.isLessThanOrEqual(remainingToReserve, '0.000000')) break;
        const rowAvail = String(row.available_quantity);
        if (ExactDecimal.isLessThanOrEqual(rowAvail, '0.000000')) continue;

        const allocQty = ExactDecimal.isLessThanOrEqual(remainingToReserve, rowAvail)
          ? remainingToReserve
          : rowAvail;

        const updatedReserved = ExactDecimal.add(String(row.reserved_quantity), allocQty);
        const updatedAvail = ExactDecimal.subtract(String(row.on_hand_quantity), updatedReserved);

        await client.query(
          `UPDATE ${SCHEMA}.stock_balances
           SET reserved_quantity = $1, available_quantity = $2, updated_at = $3, version = version + 1
           WHERE id = $4`,
          [updatedReserved, updatedAvail, now, row.id],
        );

        remainingToReserve = ExactDecimal.subtract(remainingToReserve, allocQty);
      }

      // 4. Insert active reservation
      const id = randomUUID();
      const res = await client.query(
        `INSERT INTO ${SCHEMA}.inventory_reservations (
          id, tenant_id, reservation_type, demand_type, demand_reference_id, demand_line_id,
          warehouse_id, location_id, product_id, uom_id, quantity, fulfilled_quantity,
          status, expiry_date, version, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 0, 'ACTIVE', $12, 1, $13, $13)
        RETURNING *`,
        [
          id,
          principal.tenantId,
          input.reservationType,
          input.demandType,
          input.demandReferenceId,
          input.demandLineId ?? null,
          input.warehouseId,
          input.locationId ?? null,
          input.productId,
          input.uomId,
          input.quantity,
          input.expiryDate ?? null,
          now,
        ],
      );

      const reservation = mapReservation(res.rows[0]);

      if (input.idempotencyKey) {
        await client.query(
          `INSERT INTO ${SCHEMA}.idempotency_records (tenant_id, idempotency_key, resource_id, action, response_payload, created_at)
           VALUES ($1, $2, $3, 'CREATE_RESERVATION', $4, $5)
           ON CONFLICT (tenant_id, idempotency_key) DO NOTHING`,
          [principal.tenantId, input.idempotencyKey, id, JSON.stringify(reservation), now],
        );
      }

      return reservation;
    });
  }

  async releaseReservation(principal: ModulePrincipal, reservationId: string): Promise<InventoryReservationV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const resRes = await client.query(
        `SELECT * FROM ${SCHEMA}.inventory_reservations WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [principal.tenantId, reservationId],
      );
      if (resRes.rowCount === 0) throw new NotFoundException('Reservation not found.');
      const res = resRes.rows[0];

      if (res.status === 'RELEASED' || res.status === 'CANCELLED') return mapReservation(res);

      const unfulfilledQty = ExactDecimal.subtract(String(res.quantity), String(res.fulfilled_quantity));
      const now = new Date().toISOString();

      if (ExactDecimal.isPositive(unfulfilledQty)) {
        // Lock balance rows deterministically in ascending ID order
        const balRes = await client.query(
          `SELECT id, on_hand_quantity, reserved_quantity, available_quantity
           FROM ${SCHEMA}.stock_balances
           WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3 AND uom_id = $4
           ORDER BY id ASC
           FOR UPDATE`,
          [principal.tenantId, res.warehouse_id, res.product_id, res.uom_id],
        );

        let remainingToRelease = unfulfilledQty;
        for (const row of balRes.rows) {
          if (ExactDecimal.isLessThanOrEqual(remainingToRelease, '0.000000')) break;
          const currentReserved = String(row.reserved_quantity);
          if (ExactDecimal.isLessThanOrEqual(currentReserved, '0.000000')) continue;

          const releaseFromRow = ExactDecimal.isLessThanOrEqual(remainingToRelease, currentReserved)
            ? remainingToRelease
            : currentReserved;

          const newReserved = ExactDecimal.subtract(currentReserved, releaseFromRow);
          const newAvail = ExactDecimal.subtract(String(row.on_hand_quantity), newReserved);

          await client.query(
            `UPDATE ${SCHEMA}.stock_balances
             SET reserved_quantity = $1, available_quantity = $2, updated_at = $3, version = version + 1
             WHERE id = $4`,
            [newReserved, newAvail, now, row.id],
          );

          remainingToRelease = ExactDecimal.subtract(remainingToRelease, releaseFromRow);
        }
      }

      const updatedRes = await client.query(
        `UPDATE ${SCHEMA}.inventory_reservations SET status = 'RELEASED', updated_at = $1, version = version + 1 WHERE id = $2 RETURNING *`,
        [now, reservationId],
      );
      return mapReservation(updatedRes.rows[0]);
    });
  }

  // ─── Physical Stock Issue for Order Fulfillment ─────────────────────────────

  async issueStockForOrderFulfillment(
    principal: ModulePrincipal,
    input: {
      readonly reservationId: string;
      readonly orderId: string;
      readonly fulfillmentId: string;
      readonly quantity?: string;
      readonly correlationId?: string;
    },
  ): Promise<{
    readonly issueId: string;
    readonly reservationId: string;
    readonly orderId: string;
    readonly fulfillmentId: string;
    readonly issuedQuantity: string;
    readonly status: string;
  }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      // 1. Lock reservation FOR UPDATE
      const resRes = await client.query(
        `SELECT * FROM ${SCHEMA}.inventory_reservations WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [principal.tenantId, input.reservationId],
      );
      if (resRes.rowCount === 0) throw new NotFoundException('Reservation not found.');
      const res = resRes.rows[0];

      if (res.status !== 'ACTIVE') {
        throw new BadRequestException(`Cannot issue stock: reservation status is ${res.status}.`);
      }

      const unfulfilled = ExactDecimal.subtract(String(res.quantity), String(res.fulfilled_quantity));
      const issueQty = input.quantity ?? unfulfilled;

      if (ExactDecimal.isLessThanOrEqual(issueQty, '0.000000')) {
        throw new BadRequestException('Issue quantity must be greater than zero.');
      }
      if (ExactDecimal.isGreaterThan(issueQty, unfulfilled)) {
        throw new BadRequestException(
          `Issue quantity (${issueQty}) exceeds remaining unfulfilled reserved quantity (${unfulfilled}).`,
        );
      }

      // 2. Lock balance rows deterministically in ascending ID order
      const balRes = await client.query(
        `SELECT id, on_hand_quantity, reserved_quantity, available_quantity, location_id
         FROM ${SCHEMA}.stock_balances
         WHERE tenant_id = $1 AND warehouse_id = $2 AND product_id = $3 AND uom_id = $4
         ORDER BY id ASC
         FOR UPDATE`,
        [principal.tenantId, res.warehouse_id, res.product_id, res.uom_id],
      );

      let remainingToDeduct = issueQty;
      const now = new Date().toISOString();
      const issueId = randomUUID();
      const txId = randomUUID();
      const txNumber = `ISSUE-${Date.now()}-${documentSuffix()}`;

      // Post stock ledger transaction header
      await client.query(
        `INSERT INTO ${SCHEMA}.stock_ledger_transactions (
          id, tenant_id, transaction_number, document_type, document_reference_id,
          reason, correlation_id, idempotency_key, posted_by, posted_at, created_at
        ) VALUES ($1, $2, $3, 'ORDER_FULFILLMENT_ISSUE', $4, 'ISSUE', $5, $6, $7, $8, $8)`,
        [
          txId,
          principal.tenantId,
          txNumber,
          input.fulfillmentId,
          input.correlationId ?? input.fulfillmentId,
          issueId,
          principal.subject,
          now,
        ],
      );

      for (const row of balRes.rows) {
        if (ExactDecimal.isLessThanOrEqual(remainingToDeduct, '0.000000')) break;
        const rowReserved = String(row.reserved_quantity);
        if (ExactDecimal.isLessThanOrEqual(rowReserved, '0.000000')) continue;

        const deductFromRow = ExactDecimal.isLessThanOrEqual(remainingToDeduct, rowReserved)
          ? remainingToDeduct
          : rowReserved;

        const newReserved = ExactDecimal.subtract(rowReserved, deductFromRow);
        const newOnHand = ExactDecimal.subtract(String(row.on_hand_quantity), deductFromRow);
        const newAvail = ExactDecimal.subtract(newOnHand, newReserved);

        await client.query(
          `UPDATE ${SCHEMA}.stock_balances
           SET on_hand_quantity = $1, reserved_quantity = $2, available_quantity = $3,
               last_movement_at = $4, updated_at = $4, version = version + 1
           WHERE id = $5`,
          [newOnHand, newReserved, newAvail, now, row.id],
        );

        // Credit stock ledger entry for physical removal
        await client.query(
          `INSERT INTO ${SCHEMA}.stock_ledger_entries (
            id, tenant_id, transaction_id, direction, warehouse_id, location_id, product_id,
            uom_id, quantity, base_quantity, stock_status, created_at
          ) VALUES ($1, $2, $3, 'CREDIT', $4, $5, $6, $7, $8, $8, 'AVAILABLE', $9)`,
          [
            randomUUID(),
            principal.tenantId,
            txId,
            res.warehouse_id,
            row.location_id,
            res.product_id,
            res.uom_id,
            deductFromRow,
            now,
          ],
        );

        remainingToDeduct = ExactDecimal.subtract(remainingToDeduct, deductFromRow);
      }

      // 3. Update reservation fulfilled quantity and status
      const newFulfilled = ExactDecimal.add(String(res.fulfilled_quantity), issueQty);
      const isComplete = ExactDecimal.isGreaterThanOrEqual(newFulfilled, String(res.quantity));
      const resStatus = isComplete ? 'FULFILLED' : 'ACTIVE';

      await client.query(
        `UPDATE ${SCHEMA}.inventory_reservations
         SET fulfilled_quantity = $1, status = $2, updated_at = $3, version = version + 1
         WHERE id = $4`,
        [newFulfilled, resStatus, now, res.id],
      );

      // 4. Emit inventory.stock.issued.v1 outbox event
      const stockIssuedPayload = {
        issueId,
        reservationId: res.id,
        orderId: input.orderId,
        orderLineId: res.demand_line_id ?? randomUUID(),
        productId: res.product_id,
        warehouseId: res.warehouse_id,
        issuedQuantity: issueQty,
        issuedAt: now,
      };

      await client.query(
        `INSERT INTO ${SCHEMA}.outbox_events (
          id, tenant_id, topic, event_type, aggregate_type, aggregate_id,
          aggregate_version, correlation_id, schema_version, payload, status, created_at
        ) VALUES ($1, $2, $3, $4, 'inventory_issue', $5, 1, $6, 1, $7, 'PENDING', $8)`,
        [
          issueId,
          principal.tenantId,
          TOPIC,
          'inventory.stock.issued.v1',
          input.fulfillmentId,
          input.correlationId ?? input.fulfillmentId,
          JSON.stringify(stockIssuedPayload),
          now,
        ],
      );

      return {
        issueId,
        reservationId: res.id,
        orderId: input.orderId,
        fulfillmentId: input.fulfillmentId,
        issuedQuantity: issueQty,
        status: 'ISSUED',
      };
    });
  }

  // ─── Maintenance Kits & Staging (CMMS Handshake) ─────────────────────────────

  async createKit(principal: ModulePrincipal, input: CreateKitInputV1): Promise<InventoryKitV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const kitId = randomUUID();
      const kitNumber = `KIT-${Date.now()}-${documentSuffix()}`;
      const now = new Date().toISOString();

      await client.query(
        `INSERT INTO ${SCHEMA}.kits (
          id, tenant_id, kit_number, work_order_id, work_order_task_id, warehouse_id,
          staging_location_id, status, version, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRAFT', 1, $8, $8)`,
        [
          kitId,
          principal.tenantId,
          kitNumber,
          input.workOrderId,
          input.workOrderTaskId ?? null,
          input.warehouseId,
          input.stagingLocationId ?? null,
          now,
        ],
      );

      for (const item of input.items) {
        await client.query(
          `INSERT INTO ${SCHEMA}.kit_lines (
            id, tenant_id, kit_id, product_id, uom_id, requested_quantity,
            picked_quantity, issued_quantity, returned_quantity, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 0, $7, $7)`,
          [randomUUID(), principal.tenantId, kitId, item.productId, item.uomId, item.requestedQuantity, now],
        );
      }

      return this.fetchKit(client, principal.tenantId, kitId);
    });
  }

  private async fetchKit(client: pg.PoolClient, tenantId: string, kitId: string): Promise<InventoryKitV1> {
    const kitRes = await client.query(
      `SELECT * FROM ${SCHEMA}.kits WHERE tenant_id = $1 AND id = $2`,
      [tenantId, kitId],
    );
    if (kitRes.rowCount === 0) throw new NotFoundException('Kit not found.');
    const linesRes = await client.query(
      `SELECT * FROM ${SCHEMA}.kit_lines WHERE tenant_id = $1 AND kit_id = $2`,
      [tenantId, kitId],
    );
    return mapKit(kitRes.rows[0], linesRes.rows);
  }

  async getKit(principal: ModulePrincipal, kitId: string): Promise<InventoryKitV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      return this.fetchKit(client, principal.tenantId, kitId);
    });
  }

  async stageKit(
    principal: ModulePrincipal,
    kitId: string,
    stagingLocationId: string,
  ): Promise<InventoryKitV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const now = new Date().toISOString();
      await client.query(
        `UPDATE ${SCHEMA}.kits
         SET staging_location_id = $1, status = 'STAGED', updated_at = $2, version = version + 1
         WHERE tenant_id = $3 AND id = $4`,
        [stagingLocationId, now, principal.tenantId, kitId],
      );

      await client.query(
        `INSERT INTO ${SCHEMA}.outbox_events (
          id, tenant_id, event_type, payload, status, created_at
        ) VALUES ($1, $2, $3, $4, 'PENDING', $5)`,
        [
          randomUUID(),
          principal.tenantId,
          'inventory.kit.staged.v1',
          JSON.stringify({ kitId, stagingLocationId }),
          now,
        ],
      );

      return this.fetchKit(client, principal.tenantId, kitId);
    });
  }

  async issueKit(
    principal: ModulePrincipal,
    kitId: string,
    technicianId: string,
  ): Promise<InventoryKitV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const kit = await this.fetchKit(client, principal.tenantId, kitId);
      if (!kit.stagingLocationId) throw new BadRequestException('Kit has no staging location assigned.');

      const now = new Date().toISOString();

      // Post ISSUE movement for each line
      for (const line of kit.lines ?? []) {
        const txId = randomUUID();
        const txNumber = `ISS-${Date.now()}-${documentSuffix()}`;

        await client.query(
          `INSERT INTO ${SCHEMA}.stock_ledger_transactions (
            id, tenant_id, transaction_number, document_type, document_reference_id,
            reason, correlation_id, idempotency_key, posted_by, posted_at, created_at
          ) VALUES ($1, $2, $3, 'KIT_ISSUE', $4, 'ISSUE', $4, $5, $6, $7, $7)`,
          [txId, principal.tenantId, txNumber, kitId, randomUUID(), principal.subject, now],
        );

        await client.query(
          `INSERT INTO ${SCHEMA}.stock_ledger_entries (
            id, tenant_id, transaction_id, direction, warehouse_id, location_id, product_id,
            uom_id, quantity, base_quantity, lot_id, serial_id, stock_status, created_at
          ) VALUES ($1, $2, $3, 'CREDIT', $4, $5, $6, $7, $8, $8, NULL, NULL, 'AVAILABLE', $9)`,
          [
            randomUUID(),
            principal.tenantId,
            txId,
            kit.warehouseId,
            kit.stagingLocationId,
            line.productId,
            line.uomId,
            line.requestedQuantity,
            now,
          ],
        );

        // Update balance at staging location to maintain exact ledger parity
        const negativeIssueQty = ExactDecimal.subtract('0.000000', line.requestedQuantity);
        await client.query(
          `INSERT INTO ${SCHEMA}.stock_balances (
            id, tenant_id, warehouse_id, location_id, product_id, uom_id, lot_id, serial_id,
            stock_status, on_hand_quantity, reserved_quantity, available_quantity, last_movement_at, version, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, 'AVAILABLE', $7, 0, $7, $8, 1, $8)
          ON CONFLICT (
            tenant_id, warehouse_id, location_id, product_id, uom_id,
            (COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::uuid)),
            (COALESCE(serial_id, '00000000-0000-0000-0000-000000000000'::uuid)),
            stock_status
          ) DO UPDATE SET
            on_hand_quantity = stock_balances.on_hand_quantity + EXCLUDED.on_hand_quantity,
            available_quantity = (stock_balances.on_hand_quantity + EXCLUDED.on_hand_quantity) - stock_balances.reserved_quantity,
            last_movement_at = EXCLUDED.last_movement_at,
            updated_at = EXCLUDED.updated_at,
            version = stock_balances.version + 1`,
          [
            randomUUID(),
            principal.tenantId,
            kit.warehouseId,
            kit.stagingLocationId,
            line.productId,
            line.uomId,
            negativeIssueQty,
            now,
          ],
        );

        await client.query(
          `UPDATE ${SCHEMA}.kit_lines SET issued_quantity = requested_quantity, updated_at = $1 WHERE id = $2`,
          [now, line.id],
        );
      }

      await client.query(
        `UPDATE ${SCHEMA}.kits
         SET assigned_technician_id = $1, status = 'ISSUED', updated_at = $2, version = version + 1
         WHERE tenant_id = $3 AND id = $4`,
        [technicianId, now, principal.tenantId, kitId],
      );

      await client.query(
        `INSERT INTO ${SCHEMA}.outbox_events (
          id, tenant_id, event_type, payload, status, created_at
        ) VALUES ($1, $2, $3, $4, 'PENDING', $5)`,
        [
          randomUUID(),
          principal.tenantId,
          'inventory.kit.issued.v1',
          JSON.stringify({ kitId, assignedTechnicianId: technicianId }),
          now,
        ],
      );

      return this.fetchKit(client, principal.tenantId, kitId);
    });
  }

  // ─── Cycle Counts & Adjustments (Maker-Checker) ─────────────────────────────

  async createCountPlan(principal: ModulePrincipal, input: CreateCountPlanInputV1): Promise<CountPlanV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const id = randomUUID();
      const planNumber = `CNT-${Date.now()}-${documentSuffix()}`;
      const now = new Date().toISOString();

      const res = await client.query(
        `INSERT INTO ${SCHEMA}.count_plans (
          id, tenant_id, plan_number, name, plan_type, warehouse_id, status,
          is_blind_count, allow_movements_during_count, version, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'PLANNED', $7, $8, 1, $9, $9)
        RETURNING *`,
        [
          id,
          principal.tenantId,
          planNumber,
          input.name,
          input.planType,
          input.warehouseId,
          input.isBlindCount ?? true,
          input.allowMovementsDuringCount ?? false,
          now,
        ],
      );
      return mapCountPlan(res.rows[0]);
    });
  }

  async submitCountEntry(
    principal: ModulePrincipal,
    countPlanId: string,
    input: SubmitCountEntryInputV1,
  ): Promise<CountEntryV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      // Find current snapshot quantity
      const balRes = input.lotId
        ? await client.query(
            `SELECT COALESCE(SUM(on_hand_quantity), 0) as on_hand_quantity FROM ${SCHEMA}.stock_balances
             WHERE tenant_id = $1 AND location_id = $2 AND product_id = $3 AND lot_id = $4`,
            [principal.tenantId, input.locationId, input.productId, input.lotId],
          )
        : await client.query(
            `SELECT COALESCE(SUM(on_hand_quantity), 0) as on_hand_quantity FROM ${SCHEMA}.stock_balances
             WHERE tenant_id = $1 AND location_id = $2 AND product_id = $3`,
            [principal.tenantId, input.locationId, input.productId],
          );
      const snapshotQty = balRes.rowCount && balRes.rowCount > 0
        ? ExactDecimal.fromScaledBigInt(ExactDecimal.toScaledBigInt(String(balRes.rows[0].on_hand_quantity)))
        : '0.000000';
      const countedQty = input.countedQuantity;
      const varianceQty = ExactDecimal.subtract(countedQty, snapshotQty);

      const id = randomUUID();
      const now = new Date().toISOString();

      const res = await client.query(
        `INSERT INTO ${SCHEMA}.count_entries (
          id, tenant_id, count_plan_id, location_id, product_id, lot_id, serial_id,
          snapshot_quantity, counted_quantity, variance_quantity, counted_by, counted_at,
          recount_required, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, false, $12, $12)
        RETURNING *`,
        [
          id,
          principal.tenantId,
          countPlanId,
          input.locationId,
          input.productId,
          input.lotId ?? null,
          input.serialId ?? null,
          snapshotQty,
          input.countedQuantity,
          varianceQty,
          principal.subject,
          now,
        ],
      );

      // If there is variance, create a pending adjustment
      if (!ExactDecimal.isZero(varianceQty)) {
        const planRes = await client.query(
          `SELECT warehouse_id FROM ${SCHEMA}.count_plans WHERE tenant_id = $1 AND id = $2`,
          [principal.tenantId, countPlanId],
        );
        const warehouseId = planRes.rows[0].warehouse_id;
        const adjId = randomUUID();
        const adjNumber = `ADJ-${Date.now()}-${documentSuffix()}`;
        const reason = ExactDecimal.isPositive(varianceQty) ? 'COUNT_GAIN' : 'COUNT_LOSS';

        await client.query(
          `INSERT INTO ${SCHEMA}.inventory_adjustments (
            id, tenant_id, adjustment_number, count_plan_id, warehouse_id, location_id,
            product_id, lot_id, serial_id, quantity, reason, status, maker_actor_id,
            version, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'PENDING_APPROVAL', $12, 1, $13, $13)`,
          [
            adjId,
            principal.tenantId,
            adjNumber,
            countPlanId,
            warehouseId,
            input.locationId,
            input.productId,
            input.lotId ?? null,
            input.serialId ?? null,
            ExactDecimal.abs(varianceQty),
            reason,
            principal.subject,
            now,
          ],
        );
      }

      return mapCountEntry(res.rows[0]);
    });
  }

  async approveAdjustment(
    approverPrincipal: ModulePrincipal,
    adjustmentId: string,
    input: ApproveAdjustmentInputV1,
  ): Promise<InventoryAdjustmentV1> {
    return this.database.withTenantTransaction(approverPrincipal.tenantId, async (client) => {
      const adjRes = await client.query(
        `SELECT * FROM ${SCHEMA}.inventory_adjustments WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [approverPrincipal.tenantId, adjustmentId],
      );
      if (adjRes.rowCount === 0) throw new NotFoundException('Adjustment not found.');
      const adj = adjRes.rows[0];

      // Dual authorization / Four-eyes enforcement
      if (adj.maker_actor_id === approverPrincipal.subject) {
        throw new ForbiddenException(
          'Maker-checker policy violation: The approver must be distinct from the maker.',
        );
      }
      if (adj.status !== 'PENDING_APPROVAL') {
        throw new ConflictException(`Adjustment is already in status ${adj.status}.`);
      }

      const now = new Date().toISOString();
      const txId = randomUUID();
      const txNumber = `ADJ-MOV-${Date.now()}-${documentSuffix()}`;

      // Post compensating movement through the ledger
      await client.query(
        `INSERT INTO ${SCHEMA}.stock_ledger_transactions (
          id, tenant_id, transaction_number, document_type, document_reference_id,
          reason, correlation_id, idempotency_key, posted_by, posted_at, created_at
        ) VALUES ($1, $2, $3, 'ADJUSTMENT', $4, $5, $4, $6, $7, $8, $8)`,
        [
          txId,
          approverPrincipal.tenantId,
          txNumber,
          adjustmentId,
          adj.reason,
          randomUUID(),
          approverPrincipal.subject,
          now,
        ],
      );

      const direction = adj.reason === 'COUNT_GAIN' ? 'DEBIT' : 'CREDIT';

      // Find UOM of product
      const uomRes = await client.query(
        `SELECT uom_id FROM ${SCHEMA}.stock_balances
         WHERE tenant_id = $1 AND location_id = $2 AND product_id = $3 LIMIT 1`,
        [approverPrincipal.tenantId, adj.location_id, adj.product_id],
      );
      const uomId = uomRes.rowCount && uomRes.rowCount > 0 ? uomRes.rows[0].uom_id : randomUUID();

      await client.query(
        `INSERT INTO ${SCHEMA}.stock_ledger_entries (
          id, tenant_id, transaction_id, direction, warehouse_id, location_id, product_id,
          uom_id, quantity, base_quantity, lot_id, serial_id, stock_status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, $11, 'AVAILABLE', $12)`,
        [
          randomUUID(),
          approverPrincipal.tenantId,
          txId,
          direction,
          adj.warehouse_id,
          adj.location_id,
          adj.product_id,
          uomId,
          adj.quantity,
          adj.lot_id,
          adj.serial_id,
          now,
        ],
      );

      // Adjust balance using ExactDecimal
      const balRes = await client.query(
        `SELECT id, on_hand_quantity, reserved_quantity
         FROM ${SCHEMA}.stock_balances
         WHERE tenant_id = $1 AND location_id = $2 AND product_id = $3
         FOR UPDATE`,
        [approverPrincipal.tenantId, adj.location_id, adj.product_id],
      );

      if (balRes.rowCount && balRes.rowCount > 0) {
        const curOnHand = String(balRes.rows[0].on_hand_quantity);
        const curReserved = String(balRes.rows[0].reserved_quantity);
        const newOnHand = direction === 'DEBIT'
          ? ExactDecimal.add(curOnHand, adj.quantity)
          : ExactDecimal.subtract(curOnHand, adj.quantity);
        const newAvail = ExactDecimal.subtract(newOnHand, curReserved);

        await client.query(
          `UPDATE ${SCHEMA}.stock_balances
           SET on_hand_quantity = $1, available_quantity = $2, last_movement_at = $3, updated_at = $3, version = version + 1
           WHERE id = $4`,
          [newOnHand, newAvail, now, balRes.rows[0].id],
        );
      }

      const updatedAdj = await client.query(
        `UPDATE ${SCHEMA}.inventory_adjustments
         SET status = 'APPROVED', approver_actor_id = $1, approved_at = $2, notes = $3, updated_at = $2, version = version + 1
         WHERE id = $4
         RETURNING *`,
        [approverPrincipal.subject, now, input.notes ?? null, adjustmentId],
      );

      return mapAdjustment(updatedAdj.rows[0]);
    });
  }

  // ─── Barcode Resolution ─────────────────────────────────────────────────────

  async resolveBarcode(principal: ModulePrincipal, rawCode: string): Promise<BarcodeResolutionResultV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      // 1. Check locations by barcode or code
      const locRes = await client.query(
        `SELECT id, code, name FROM ${SCHEMA}.locations WHERE tenant_id = $1 AND (barcode = $2 OR code = $2) LIMIT 1`,
        [principal.tenantId, rawCode],
      );
      if (locRes.rowCount && locRes.rowCount > 0) {
        return {
          rawCode,
          entityType: 'LOCATION',
          matchedEntityId: locRes.rows[0].id,
          matchedCode: locRes.rows[0].code,
          metadata: { name: locRes.rows[0].name },
        };
      }

      // 2. Check lots
      const lotRes = await client.query(
        `SELECT id, lot_number, product_id FROM ${SCHEMA}.inventory_lots WHERE tenant_id = $1 AND lot_number = $2 LIMIT 1`,
        [principal.tenantId, rawCode],
      );
      if (lotRes.rowCount && lotRes.rowCount > 0) {
        return {
          rawCode,
          entityType: 'LOT',
          matchedEntityId: lotRes.rows[0].id,
          matchedCode: lotRes.rows[0].lot_number,
          metadata: { productId: lotRes.rows[0].product_id },
        };
      }

      // 3. Check serials
      const serRes = await client.query(
        `SELECT id, serial_number, product_id FROM ${SCHEMA}.inventory_serials WHERE tenant_id = $1 AND serial_number = $2 LIMIT 1`,
        [principal.tenantId, rawCode],
      );
      if (serRes.rowCount && serRes.rowCount > 0) {
        return {
          rawCode,
          entityType: 'SERIAL',
          matchedEntityId: serRes.rows[0].id,
          matchedCode: serRes.rows[0].serial_number,
          metadata: { productId: serRes.rows[0].product_id },
        };
      }

      // 4. Check kits
      const kitRes = await client.query(
        `SELECT id, kit_number FROM ${SCHEMA}.kits WHERE tenant_id = $1 AND kit_number = $2 LIMIT 1`,
        [principal.tenantId, rawCode],
      );
      if (kitRes.rowCount && kitRes.rowCount > 0) {
        return {
          rawCode,
          entityType: 'KIT',
          matchedEntityId: kitRes.rows[0].id,
          matchedCode: kitRes.rows[0].kit_number,
        };
      }

      return {
        rawCode,
        entityType: 'UNKNOWN',
        matchedEntityId: null,
        matchedCode: null,
      };
    });
  }

  // ─── Ledger Rebuild Integrity Check ─────────────────────────────────────────

  async rebuildBalances(
    principal: ModulePrincipal,
    warehouseId: string,
  ): Promise<{ reconciled: boolean; totalLedgerBalance: string; totalMaterializedBalance: string }> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      // Calculate net sum from immutable ledger entries (DEBIT - CREDIT)
      const ledgerSumRes = await client.query(
        `SELECT
           COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN quantity ELSE -quantity END), 0) as net_ledger
         FROM ${SCHEMA}.stock_ledger_entries
         WHERE tenant_id = $1 AND warehouse_id = $2`,
        [principal.tenantId, warehouseId],
      );
      const netLedger = ExactDecimal.fromScaledBigInt(ExactDecimal.toScaledBigInt(String(ledgerSumRes.rows[0].net_ledger)));

      // Calculate sum of materialized on_hand_quantity
      const matSumRes = await client.query(
        `SELECT COALESCE(SUM(on_hand_quantity), 0) as total_on_hand
         FROM ${SCHEMA}.stock_balances
         WHERE tenant_id = $1 AND warehouse_id = $2`,
        [principal.tenantId, warehouseId],
      );
      const totalMat = ExactDecimal.fromScaledBigInt(ExactDecimal.toScaledBigInt(String(matSumRes.rows[0].total_on_hand)));

      return {
        reconciled: netLedger === totalMat,
        totalLedgerBalance: netLedger,
        totalMaterializedBalance: totalMat,
      };
    });
  }
}

// ─── Mapping Helpers ─────────────────────────────────────────────────────────

export function mapWarehouse(row: any): InventoryWarehouseV1 {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    code: row.code,
    name: row.name,
    description: row.description,
    warehouseType: row.warehouse_type,
    orgUnitId: row.org_unit_id,
    placeId: row.place_id,
    address: row.address,
    isActive: row.active,
    version: row.version,
    createdAt: row.created_at.toISOString ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at.toISOString ? row.updated_at.toISOString() : row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

export function mapLocation(row: any): InventoryLocationV1 {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    warehouseId: row.warehouse_id,
    code: row.code,
    name: row.name,
    locationType: row.location_type,
    parentLocationId: row.parent_location_id,
    aisle: row.aisle,
    rack: row.rack,
    shelf: row.shelf,
    bin: row.bin,
    barcode: row.barcode,
    maxWeightKg: row.max_weight_kg ? String(row.max_weight_kg) : null,
    maxVolumeM3: row.max_volume_m3 ? String(row.max_volume_m3) : null,
    allowNegative: row.allow_negative,
    isActive: row.active,
    version: row.version,
    createdAt: row.created_at.toISOString ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at.toISOString ? row.updated_at.toISOString() : row.updated_at,
  };
}

export function mapItem(row: any): InventoryItemV1 {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    productId: row.product_id,
    defaultWarehouseId: row.default_warehouse_id,
    defaultLocationId: row.default_location_id,
    isLotTracked: row.is_lot_tracked,
    isSerialTracked: row.is_serial_tracked,
    shelfLifeDays: row.shelf_life_days,
    reorderPoint: row.reorder_point ? String(row.reorder_point) : null,
    safetyStock: row.safety_stock ? String(row.safety_stock) : null,
    valuationMethod: row.valuation_method,
    standardCostMinor: String(row.standard_cost_minor ?? '0'),
    isActive: row.active,
    version: row.version,
    createdAt: row.created_at.toISOString ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at.toISOString ? row.updated_at.toISOString() : row.updated_at,
  };
}

export function mapLot(row: any): InventoryLotV1 {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    productId: row.product_id,
    lotNumber: row.lot_number,
    batchCode: row.batch_code,
    supplierLotNumber: row.supplier_lot_number,
    manufacturedDate: row.manufactured_date ? (row.manufactured_date.toISOString ? row.manufactured_date.toISOString() : row.manufactured_date) : null,
    expiryDate: row.expiry_date ? (row.expiry_date.toISOString ? row.expiry_date.toISOString() : row.expiry_date) : null,
    status: row.status,
    customExtensions: typeof row.custom_extensions === 'string' ? JSON.parse(row.custom_extensions) : (row.custom_extensions ?? {}),
    manifestChecksum: row.manifest_checksum,
    version: row.version,
    createdAt: row.created_at.toISOString ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at.toISOString ? row.updated_at.toISOString() : row.updated_at,
  };
}

function mapLedgerTx(row: any): StockLedgerTransactionV1 {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    transactionNumber: row.transaction_number,
    documentType: row.document_type,
    documentReferenceId: row.document_reference_id,
    reason: row.reason,
    correlationId: row.correlation_id,
    idempotencyKey: row.idempotency_key,
    postedBy: row.posted_by,
    postedAt: row.posted_at.toISOString ? row.posted_at.toISOString() : row.posted_at,
    createdAt: row.created_at.toISOString ? row.created_at.toISOString() : row.created_at,
  };
}

export function mapLedgerEntry(row: any): StockLedgerEntryV1 {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    transactionId: row.transaction_id,
    direction: row.direction,
    warehouseId: row.warehouse_id,
    locationId: row.location_id,
    productId: row.product_id,
    uomId: row.uom_id,
    quantity: String(row.quantity),
    baseQuantity: String(row.base_quantity),
    lotId: row.lot_id,
    serialId: row.serial_id,
    stockStatus: row.stock_status,
    unitCostMinor: row.unit_cost_minor ? String(row.unit_cost_minor) : null,
    totalCostMinor: row.total_cost_minor ? String(row.total_cost_minor) : null,
    createdAt: row.created_at.toISOString ? row.created_at.toISOString() : row.created_at,
  };
}

export function mapBalance(row: any): StockBalanceV1 {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    warehouseId: row.warehouse_id,
    locationId: row.location_id,
    productId: row.product_id,
    uomId: row.uom_id,
    lotId: row.lot_id,
    serialId: row.serial_id,
    stockStatus: row.stock_status,
    onHandQuantity: String(row.on_hand_quantity),
    reservedQuantity: String(row.reserved_quantity),
    availableQuantity: String(row.available_quantity),
    lastMovementAt: row.last_movement_at.toISOString ? row.last_movement_at.toISOString() : row.last_movement_at,
    version: row.version,
    updatedAt: row.updated_at.toISOString ? row.updated_at.toISOString() : row.updated_at,
  };
}

function mapReservation(row: any): InventoryReservationV1 {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    reservationType: row.reservation_type,
    demandType: row.demand_type,
    demandReferenceId: row.demand_reference_id,
    demandLineId: row.demand_line_id,
    warehouseId: row.warehouse_id,
    locationId: row.location_id,
    productId: row.product_id,
    uomId: row.uom_id,
    quantity: String(row.quantity),
    fulfilledQuantity: String(row.fulfilled_quantity),
    status: row.status,
    expiryDate: row.expiry_date ? (row.expiry_date.toISOString ? row.expiry_date.toISOString() : row.expiry_date) : null,
    version: row.version,
    createdAt: row.created_at.toISOString ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at.toISOString ? row.updated_at.toISOString() : row.updated_at,
  };
}

export type ReceiptFinancePostingStatus =
  | 'NOT_APPLICABLE'
  | 'AWAITING_POSTING'
  | 'POSTED'
  | 'POSTING_REJECTED';

/** ADR-0033 D3: persisted Finance status, with outbox fallback before Finance sync. */
export function resolveReceiptFinancePostingStatus(row: {
  status: string;
  finance_posting_status?: string | null;
  outbox_status?: string | null;
}): ReceiptFinancePostingStatus {
  if (row.status !== 'COMPLETED') return 'NOT_APPLICABLE';
  const stored = row.finance_posting_status;
  if (stored === 'POSTED' || stored === 'POSTING_REJECTED' || stored === 'AWAITING_POSTING') {
    return stored;
  }
  if (row.outbox_status === 'FAILED') return 'POSTING_REJECTED';
  return 'AWAITING_POSTING';
}

export function mapReceipt(row: any, linesRows: any[]): InventoryReceiptV1 {
  const financePostingStatus = resolveReceiptFinancePostingStatus(row);
  return {
    id: row.id,
    tenantId: row.tenant_id,
    receiptNumber: row.receipt_number,
    warehouseId: row.warehouse_id,
    supplierPartyId: row.supplier_party_id,
    carrierPartyId: row.carrier_party_id,
    externalDocumentReference: row.external_document_reference,
    status: row.status,
    financePostingStatus,
    financePostingRejectionCode: row.finance_posting_rejection_code ?? null,
    notes: row.notes,
    version: row.version,
    createdAt: row.created_at.toISOString ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at.toISOString ? row.updated_at.toISOString() : row.updated_at,
    completedAt: row.completed_at ? (row.completed_at.toISOString ? row.completed_at.toISOString() : row.completed_at) : null,
    lines: linesRows.map((line) => ({
      id: line.id,
      tenantId: line.tenant_id,
      receiptId: line.receipt_id,
      lineNumber: line.line_number,
      productId: line.product_id,
      uomId: line.uom_id,
      expectedQuantity: String(line.expected_quantity),
      receivedQuantity: String(line.received_quantity),
      targetLocationId: line.target_location_id,
      lotNumber: line.lot_number,
      expiryDate: line.expiry_date ? (line.expiry_date.toISOString ? line.expiry_date.toISOString() : line.expiry_date) : null,
      inspectionStatus: line.inspection_status,
      purchaseOrderId: line.purchase_order_id ?? null,
      purchaseOrderLineId: line.purchase_order_line_id ?? null,
      customExtensions: typeof line.custom_extensions === 'string' ? JSON.parse(line.custom_extensions) : (line.custom_extensions ?? {}),
      createdAt: line.created_at.toISOString ? line.created_at.toISOString() : line.created_at,
      updatedAt: line.updated_at.toISOString ? line.updated_at.toISOString() : line.updated_at,
    })),
  };
}

function mapKit(row: any, linesRows: any[]): InventoryKitV1 {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    kitNumber: row.kit_number,
    workOrderId: row.work_order_id,
    workOrderTaskId: row.work_order_task_id,
    warehouseId: row.warehouse_id,
    stagingLocationId: row.staging_location_id,
    assignedTechnicianId: row.assigned_technician_id,
    status: row.status,
    version: row.version,
    createdAt: row.created_at.toISOString ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at.toISOString ? row.updated_at.toISOString() : row.updated_at,
    lines: linesRows.map((line) => ({
      id: line.id,
      tenantId: line.tenant_id,
      kitId: line.kit_id,
      productId: line.product_id,
      uomId: line.uom_id,
      requestedQuantity: String(line.requested_quantity),
      pickedQuantity: String(line.picked_quantity),
      issuedQuantity: String(line.issued_quantity),
      returnedQuantity: String(line.returned_quantity),
      lotId: line.lot_id,
      createdAt: line.created_at.toISOString ? line.created_at.toISOString() : line.created_at,
      updatedAt: line.updated_at.toISOString ? line.updated_at.toISOString() : line.updated_at,
    })),
  };
}

function mapCountPlan(row: any): CountPlanV1 {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    planNumber: row.plan_number,
    name: row.name,
    planType: row.plan_type,
    warehouseId: row.warehouse_id,
    status: row.status,
    isBlindCount: row.is_blind_count,
    allowMovementsDuringCount: row.allow_movements_during_count,
    version: row.version,
    createdAt: row.created_at.toISOString ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at.toISOString ? row.updated_at.toISOString() : row.updated_at,
  };
}

function mapCountEntry(row: any): CountEntryV1 {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    countPlanId: row.count_plan_id,
    locationId: row.location_id,
    productId: row.product_id,
    lotId: row.lot_id,
    serialId: row.serial_id,
    snapshotQuantity: String(row.snapshot_quantity),
    countedQuantity: String(row.counted_quantity),
    varianceQuantity: String(row.variance_quantity),
    countedBy: row.counted_by,
    countedAt: row.counted_at.toISOString ? row.counted_at.toISOString() : row.counted_at,
    recountRequired: row.recount_required,
    createdAt: row.created_at.toISOString ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at.toISOString ? row.updated_at.toISOString() : row.updated_at,
  };
}

function mapAdjustment(row: any): InventoryAdjustmentV1 {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    adjustmentNumber: row.adjustment_number,
    countPlanId: row.count_plan_id,
    warehouseId: row.warehouse_id,
    locationId: row.location_id,
    productId: row.product_id,
    lotId: row.lot_id,
    serialId: row.serial_id,
    quantity: String(row.quantity),
    reason: row.reason,
    status: row.status,
    makerActorId: row.maker_actor_id,
    approverActorId: row.approver_actor_id,
    approvedAt: row.approved_at ? (row.approved_at.toISOString ? row.approved_at.toISOString() : row.approved_at) : null,
    notes: row.notes,
    version: row.version,
    createdAt: row.created_at.toISOString ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at.toISOString ? row.updated_at.toISOString() : row.updated_at,
  };
}
