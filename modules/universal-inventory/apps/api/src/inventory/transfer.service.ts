import { randomUUID } from 'node:crypto';
import { ExactDecimal } from '@gigalibs/contracts';
import {
  type ModulePrincipal,
  OrganizationReplica,
  assertOrganizationWrite,
  organizationAccess,
} from '@gigalibs/module-sdk';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { SCHEMA } from '../config.js';
import { DatabaseService } from '../database.service.js';

const QUANTITY = z.string().regex(/^\d+(\.\d+)?$/, 'quantity must be a non-negative decimal');

/** WI-OI-125 S1: create an inter-warehouse transfer (DRAFT) with its lines. */
export const CreateTransferInputV1Schema = z
  .object({
    sourceWarehouseId: z.string().uuid(),
    targetWarehouseId: z.string().uuid(),
    notes: z.string().max(2000).optional(),
    lines: z
      .array(
        z
          .object({
            productId: z.string().uuid(),
            uomId: z.string().uuid(),
            sourceLocationId: z.string().uuid(),
            targetLocationId: z.string().uuid(),
            quantity: QUANTITY,
            lotId: z.string().uuid().optional(),
            serialId: z.string().uuid().optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type CreateTransferInputV1 = z.infer<typeof CreateTransferInputV1Schema>;

export interface TransferLineV1 {
  readonly id: string;
  readonly productId: string;
  readonly uomId: string;
  readonly sourceLocationId: string;
  readonly targetLocationId: string;
  readonly quantity: string;
  readonly lotId: string | null;
  readonly serialId: string | null;
  readonly pickedQuantity: string;
  readonly receivedQuantity: string;
}

export interface TransferV1 {
  readonly id: string;
  readonly transferNumber: string;
  readonly sourceWarehouseId: string;
  readonly targetWarehouseId: string;
  readonly status: string;
  readonly notes: string | null;
  readonly version: number;
  readonly lines: TransferLineV1[];
}

interface LineRow {
  id: string;
  product_id: string;
  uom_id: string;
  source_location_id: string;
  target_location_id: string;
  quantity: string;
  lot_id: string | null;
  serial_id: string | null;
  picked_quantity: string;
  received_quantity: string;
}

/**
 * WI-OI-125 (Advanced SCM, S1–S2/S6): inter-warehouse transfer document actions. Dispatch moves AVAILABLE stock out of
 * the source locator into the source warehouse's virtual in-transit (TRANSIT) locator as BLOCKED stock — excluded from
 * ATP at both ends — and receipt moves it into the destination locator as AVAILABLE (sellable). Every leg is a balanced
 * double-entry on the stock ledger under the verified tenant transaction, mirroring the Material Ledger movement.
 */
@Injectable()
export class TransferService {
  private readonly orgReplica = new OrganizationReplica(SCHEMA);

  constructor(private readonly database: DatabaseService) {}

  async createTransfer(principal: ModulePrincipal, input: CreateTransferInputV1): Promise<TransferV1> {
    if (input.sourceWarehouseId === input.targetWarehouseId) {
      throw new BadRequestException('A transfer must move stock between two different warehouses.');
    }
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      await this.requireWarehouseWrite(client, principal, input.sourceWarehouseId);
      await this.requireWarehouseWrite(client, principal, input.targetWarehouseId);
      const id = randomUUID();
      const now = new Date().toISOString();
      await client.query(
        `INSERT INTO ${SCHEMA}.transfers (id, tenant_id, transfer_number, source_warehouse_id, target_warehouse_id, status, notes, version, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'DRAFT', $6, 1, $7, $7)`,
        [id, principal.tenantId, `TRF-${Date.now()}-${randomUUID().slice(0, 8)}`, input.sourceWarehouseId, input.targetWarehouseId, input.notes ?? null, now],
      );
      for (const line of input.lines) {
        await client.query(
          `INSERT INTO ${SCHEMA}.transfer_lines (id, tenant_id, transfer_id, product_id, uom_id, source_location_id, target_location_id, quantity, lot_id, serial_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [randomUUID(), principal.tenantId, id, line.productId, line.uomId, line.sourceLocationId, line.targetLocationId, line.quantity, line.lotId ?? null, line.serialId ?? null, now],
        );
      }
      return this.loadTransfer(client, principal.tenantId, id);
    });
  }

  async dispatchTransfer(principal: ModulePrincipal, transferId: string): Promise<TransferV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const transfer = await this.lockTransfer(client, principal.tenantId, transferId);
      await this.requireWarehouseWrite(client, principal, transfer.sourceWarehouseId);
      await this.requireWarehouseWrite(client, principal, transfer.targetWarehouseId);
      if (transfer.status === 'IN_TRANSIT') return transfer; // already dispatched — idempotent replay
      if (transfer.status !== 'DRAFT') {
        throw new ConflictException(`Only a draft transfer can be dispatched (status is ${transfer.status}).`);
      }
      const transitLocationId = await this.ensureTransitLocation(client, principal.tenantId, transfer.sourceWarehouseId);
      const txId = await this.openLedgerTransaction(client, principal, 'STOCK_TRANSFER_DISPATCH', transfer.id);
      const now = new Date().toISOString();
      for (const line of transfer.lines) {
        await this.moveStock(client, principal.tenantId, txId, now, {
          fromWarehouseId: transfer.sourceWarehouseId,
          fromLocationId: line.sourceLocationId,
          fromStatus: 'AVAILABLE',
          toWarehouseId: transfer.sourceWarehouseId,
          toLocationId: transitLocationId,
          toStatus: 'BLOCKED',
          productId: line.productId,
          uomId: line.uomId,
          quantity: line.quantity,
          lotId: line.lotId,
          serialId: line.serialId,
        });
        await client.query(
          `UPDATE ${SCHEMA}.transfer_lines SET picked_quantity = quantity WHERE tenant_id = $1 AND id = $2`,
          [principal.tenantId, line.id],
        );
      }
      await this.advanceStatus(client, principal, transfer.id, 'IN_TRANSIT');
      return this.loadTransfer(client, principal.tenantId, transfer.id);
    });
  }

  async receiveTransfer(principal: ModulePrincipal, transferId: string): Promise<TransferV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const transfer = await this.lockTransfer(client, principal.tenantId, transferId);
      await this.requireWarehouseWrite(client, principal, transfer.sourceWarehouseId);
      await this.requireWarehouseWrite(client, principal, transfer.targetWarehouseId);
      if (transfer.status === 'RECEIVED') return transfer; // already received — idempotent replay
      if (transfer.status !== 'IN_TRANSIT') {
        throw new ConflictException(`Only an in-transit transfer can be received (status is ${transfer.status}).`);
      }
      const transitLocationId = await this.ensureTransitLocation(client, principal.tenantId, transfer.sourceWarehouseId);
      const txId = await this.openLedgerTransaction(client, principal, 'STOCK_TRANSFER_RECEIPT', transfer.id);
      const now = new Date().toISOString();
      for (const line of transfer.lines) {
        await this.moveStock(client, principal.tenantId, txId, now, {
          fromWarehouseId: transfer.sourceWarehouseId,
          fromLocationId: transitLocationId,
          fromStatus: 'BLOCKED',
          toWarehouseId: transfer.targetWarehouseId,
          toLocationId: line.targetLocationId,
          toStatus: 'AVAILABLE',
          productId: line.productId,
          uomId: line.uomId,
          quantity: line.quantity,
          lotId: line.lotId,
          serialId: line.serialId,
        });
        await client.query(
          `UPDATE ${SCHEMA}.transfer_lines SET received_quantity = quantity WHERE tenant_id = $1 AND id = $2`,
          [principal.tenantId, line.id],
        );
      }
      await this.advanceStatus(client, principal, transfer.id, 'RECEIVED');
      return this.loadTransfer(client, principal.tenantId, transfer.id);
    });
  }

  async getTransfer(principal: ModulePrincipal, transferId: string): Promise<TransferV1> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) =>
      this.loadTransfer(client, principal.tenantId, transferId),
    );
  }

  /** The tenant's transfers, newest first, optionally filtered by status — the Kanban transfer board (S4) reads this. */
  async listTransfers(principal: ModulePrincipal, status?: string): Promise<TransferV1[]> {
    return this.database.withTenantTransaction(principal.tenantId, async (client) => {
      const headers = await client.query<{ id: string }>(
        `SELECT id FROM ${SCHEMA}.transfers
          WHERE tenant_id = $1 ${status ? 'AND status = $2' : ''}
          ORDER BY created_at DESC, id
          LIMIT 200`,
        status ? [principal.tenantId, status] : [principal.tenantId],
      );
      const transfers: TransferV1[] = [];
      for (const header of headers.rows) transfers.push(await this.loadTransfer(client, principal.tenantId, header.id));
      return transfers;
    });
  }

  // ─── internals ───────────────────────────────────────────────────────────────

  private async requireWarehouseWrite(client: PoolClient, principal: ModulePrincipal, warehouseId: string): Promise<void> {
    const access = await organizationAccess(this.orgReplica, client, principal.tenantId, principal.organization ?? { mode: 'TENANT' });
    const result = await client.query<{ org_unit_id: string | null }>(
      `SELECT org_unit_id FROM ${SCHEMA}.warehouses WHERE tenant_id = $1 AND id = $2`,
      [principal.tenantId, warehouseId],
    );
    if (result.rowCount === 0) throw new NotFoundException('Warehouse not found.');
    assertOrganizationWrite(access, result.rows[0].org_unit_id);
  }

  /** The source warehouse's single virtual in-transit (TRANSIT) locator; created on first dispatch. */
  private async ensureTransitLocation(client: PoolClient, tenantId: string, warehouseId: string): Promise<string> {
    const existing = await client.query<{ id: string }>(
      `SELECT id FROM ${SCHEMA}.locations WHERE tenant_id = $1 AND warehouse_id = $2 AND location_type = 'TRANSIT' AND code = 'IN-TRANSIT'`,
      [tenantId, warehouseId],
    );
    if (existing.rows[0]) return existing.rows[0].id;
    const id = randomUUID();
    await client.query(
      `INSERT INTO ${SCHEMA}.locations (id, tenant_id, warehouse_id, code, name, location_type, active, created_at, updated_at)
       VALUES ($1, $2, $3, 'IN-TRANSIT', 'In transit', 'TRANSIT', true, now(), now())`,
      [id, tenantId, warehouseId],
    );
    return id;
  }

  private async openLedgerTransaction(client: PoolClient, principal: ModulePrincipal, documentType: string, transferId: string): Promise<string> {
    const txId = randomUUID();
    await client.query(
      `INSERT INTO ${SCHEMA}.stock_ledger_transactions (id, tenant_id, transaction_number, document_type, document_reference_id, reason, correlation_id, idempotency_key, posted_by, posted_at, created_at)
       VALUES ($1, $2, $3, $4, $5, 'TRANSFER', $6, $7, $8, now(), now())`,
      [txId, principal.tenantId, `MOV-${Date.now()}-${randomUUID().slice(0, 8)}`, documentType, transferId, `transfer:${transferId}`, `${documentType}:${transferId}`, principal.subject],
    );
    return txId;
  }

  private async advanceStatus(client: PoolClient, principal: ModulePrincipal, transferId: string, status: string): Promise<void> {
    await client.query(
      `UPDATE ${SCHEMA}.transfers SET status = $3, version = version + 1, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
      [principal.tenantId, transferId, status],
    );
  }

  private async moveStock(
    client: PoolClient,
    tenantId: string,
    txId: string,
    now: string,
    p: {
      fromWarehouseId: string;
      fromLocationId: string;
      fromStatus: string;
      toWarehouseId: string;
      toLocationId: string;
      toStatus: string;
      productId: string;
      uomId: string;
      quantity: string;
      lotId: string | null;
      serialId: string | null;
    },
  ): Promise<void> {
    // CREDIT the source: it must hold enough unreserved stock at the source status.
    const src = await client.query(
      `SELECT * FROM ${SCHEMA}.stock_balances
        WHERE tenant_id = $1 AND warehouse_id = $2 AND location_id = $3 AND product_id = $4 AND uom_id = $5
          AND COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE($6, '00000000-0000-0000-0000-000000000000'::uuid)
          AND COALESCE(serial_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE($7, '00000000-0000-0000-0000-000000000000'::uuid)
          AND stock_status = $8
        FOR UPDATE`,
      [tenantId, p.fromWarehouseId, p.fromLocationId, p.productId, p.uomId, p.lotId, p.serialId, p.fromStatus],
    );
    const srcOnHand = src.rows[0] ? String(src.rows[0].on_hand_quantity) : '0.000000';
    const srcReserved = src.rows[0] ? String(src.rows[0].reserved_quantity) : '0.000000';
    const movable = ExactDecimal.subtract(srcOnHand, srcReserved);
    if (ExactDecimal.isLessThan(movable, p.quantity)) {
      throw new BadRequestException(`Insufficient unreserved stock to transfer (available: ${movable}, requested: ${p.quantity}).`);
    }
    const srcNewOnHand = ExactDecimal.subtract(srcOnHand, p.quantity);
    await client.query(
      `UPDATE ${SCHEMA}.stock_balances SET on_hand_quantity = $1, available_quantity = $2, last_movement_at = $3, version = version + 1, updated_at = $3 WHERE id = $4`,
      [srcNewOnHand, ExactDecimal.subtract(srcNewOnHand, srcReserved), now, src.rows[0].id],
    );
    await this.writeLedgerEntry(client, tenantId, txId, 'CREDIT', now, p.fromWarehouseId, p.fromLocationId, p.fromStatus, p);

    // DEBIT the target at the target status (create the balance row if absent).
    const tgt = await client.query(
      `SELECT * FROM ${SCHEMA}.stock_balances
        WHERE tenant_id = $1 AND warehouse_id = $2 AND location_id = $3 AND product_id = $4 AND uom_id = $5
          AND COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE($6, '00000000-0000-0000-0000-000000000000'::uuid)
          AND COALESCE(serial_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE($7, '00000000-0000-0000-0000-000000000000'::uuid)
          AND stock_status = $8
        FOR UPDATE`,
      [tenantId, p.toWarehouseId, p.toLocationId, p.productId, p.uomId, p.lotId, p.serialId, p.toStatus],
    );
    const tgtOnHand = tgt.rows[0] ? String(tgt.rows[0].on_hand_quantity) : '0.000000';
    const tgtReserved = tgt.rows[0] ? String(tgt.rows[0].reserved_quantity) : '0.000000';
    const tgtNewOnHand = ExactDecimal.add(tgtOnHand, p.quantity);
    if (tgt.rows[0]) {
      await client.query(
        `UPDATE ${SCHEMA}.stock_balances SET on_hand_quantity = $1, available_quantity = $2, last_movement_at = $3, version = version + 1, updated_at = $3 WHERE id = $4`,
        [tgtNewOnHand, ExactDecimal.subtract(tgtNewOnHand, tgtReserved), now, tgt.rows[0].id],
      );
    } else {
      await client.query(
        `INSERT INTO ${SCHEMA}.stock_balances (id, tenant_id, warehouse_id, location_id, product_id, uom_id, lot_id, serial_id, stock_status, on_hand_quantity, reserved_quantity, available_quantity, last_movement_at, version, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $10, $11, 1, $11)`,
        [randomUUID(), tenantId, p.toWarehouseId, p.toLocationId, p.productId, p.uomId, p.lotId, p.serialId, p.toStatus, tgtNewOnHand, now],
      );
    }
    await this.writeLedgerEntry(client, tenantId, txId, 'DEBIT', now, p.toWarehouseId, p.toLocationId, p.toStatus, p);
  }

  private async writeLedgerEntry(
    client: PoolClient,
    tenantId: string,
    txId: string,
    direction: 'CREDIT' | 'DEBIT',
    now: string,
    warehouseId: string,
    locationId: string,
    stockStatus: string,
    p: { productId: string; uomId: string; quantity: string; lotId: string | null; serialId: string | null },
  ): Promise<void> {
    await client.query(
      `INSERT INTO ${SCHEMA}.stock_ledger_entries (id, tenant_id, transaction_id, direction, warehouse_id, location_id, product_id, uom_id, quantity, base_quantity, lot_id, serial_id, stock_status, unit_cost_minor, total_cost_minor, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, $11, $12, NULL, NULL, $13)`,
      [randomUUID(), tenantId, txId, direction, warehouseId, locationId, p.productId, p.uomId, p.quantity, p.lotId, p.serialId, stockStatus, now],
    );
  }

  private async lockTransfer(client: PoolClient, tenantId: string, transferId: string): Promise<TransferV1> {
    const header = await client.query(
      `SELECT * FROM ${SCHEMA}.transfers WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
      [tenantId, transferId],
    );
    if (header.rowCount === 0) throw new NotFoundException('Transfer not found.');
    return this.hydrate(client, tenantId, header.rows[0]);
  }

  private async loadTransfer(client: PoolClient, tenantId: string, transferId: string): Promise<TransferV1> {
    const header = await client.query(
      `SELECT * FROM ${SCHEMA}.transfers WHERE tenant_id = $1 AND id = $2`,
      [tenantId, transferId],
    );
    if (header.rowCount === 0) throw new NotFoundException('Transfer not found.');
    return this.hydrate(client, tenantId, header.rows[0]);
  }

  private async hydrate(client: PoolClient, tenantId: string, row: Record<string, unknown>): Promise<TransferV1> {
    const lines = await client.query<LineRow>(
      `SELECT * FROM ${SCHEMA}.transfer_lines WHERE tenant_id = $1 AND transfer_id = $2 ORDER BY created_at, id`,
      [tenantId, row.id],
    );
    return {
      id: row.id as string,
      transferNumber: row.transfer_number as string,
      sourceWarehouseId: row.source_warehouse_id as string,
      targetWarehouseId: row.target_warehouse_id as string,
      status: row.status as string,
      notes: (row.notes as string | null) ?? null,
      version: Number(row.version),
      lines: lines.rows.map((line) => ({
        id: line.id,
        productId: line.product_id,
        uomId: line.uom_id,
        sourceLocationId: line.source_location_id,
        targetLocationId: line.target_location_id,
        quantity: String(line.quantity),
        lotId: line.lot_id,
        serialId: line.serial_id,
        pickedQuantity: String(line.picked_quantity),
        receivedQuantity: String(line.received_quantity),
      })),
    };
  }
}
