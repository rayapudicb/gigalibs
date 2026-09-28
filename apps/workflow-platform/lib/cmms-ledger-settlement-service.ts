import { prisma } from '@gigalibs/db';
import type {
  CmmsWorkOrderFinancialsV1,
  SettleCmmsWorkOrderV1,
} from '@gigalibs/contracts';

interface WorkOrderRow {
  id: string;
  wo_number: string;
  financial_settlement_status: 'UNSETTLED' | 'PARTIALLY_SETTLED' | 'FULLY_SETTLED';
  settled_at: Date | null;
  currency_code: string | null;
}

interface LabourRow {
  id: string;
  hours: string | number;
  hourly_rate: string | number | null;
  currency_code: string | null;
  booking_id: string | null;
  settled_journal_entry_id: string | null;
}

interface MovementRow {
  id: string;
  quantity_delta: string | number;
  unit_cost: string | number | null;
  currency_code: string;
  settled_journal_entry_id: string | null;
}

interface JournalLineRow {
  entry_id: string;
  entry_number: string;
  memo: string;
  posted_at: Date;
  is_balanced: boolean;
  account_code: string;
  account_name: string;
  description: string | null;
  debit_cents: bigint | number;
  credit_cents: bigint | number;
}

export class CmmsLedgerSettlementService {
  /**
   * Retrieves live financial summary for a work order, including labor hours,
   * parts consumption, calculated costs, settlement status, and linked GAAP journal entries.
   */
  async getWorkOrderFinancials(
    tenantId: string,
    workOrderId: string
  ): Promise<CmmsWorkOrderFinancialsV1> {
    // 1. Fetch work order
    const woRows = await prisma.$queryRaw<WorkOrderRow[]>`
      SELECT
        id,
        wo_number,
        COALESCE(financial_settlement_status, 'UNSETTLED') as financial_settlement_status,
        settled_at,
        currency_code
      FROM gigalibs_cmms.work_orders
      WHERE tenant_id = ${tenantId}::gigalibs_cmms.tenant_ref
        AND id = ${workOrderId}::uuid
    `;

    if (!woRows || woRows.length === 0) {
      throw new Error(`Work order ${workOrderId} not found.`);
    }

    const wo = woRows[0];
    const currency = wo.currency_code || 'USD';

    // 2. Fetch labour rows
    const labourRows = await prisma.$queryRaw<LabourRow[]>`
      SELECT
        id,
        hours,
        hourly_rate,
        currency_code,
        booking_id,
        settled_journal_entry_id
      FROM gigalibs_cmms.work_order_labour
      WHERE tenant_id = ${tenantId}::gigalibs_cmms.tenant_ref
        AND work_order_id = ${workOrderId}::uuid
    `;

    let totalHours = 0;
    let totalLabourCostCents = 0;
    let settledLabourCount = 0;
    let latestLabourJournalEntryId: string | null = null;

    for (const l of labourRows) {
      const hours = Number(l.hours) || 0;
      const rate = Number(l.hourly_rate) || 0;
      totalHours += hours;
      totalLabourCostCents += Math.round(hours * rate * 100);
      if (l.settled_journal_entry_id) {
        settledLabourCount++;
        latestLabourJournalEntryId = l.settled_journal_entry_id;
      }
    }

    const isLabourSettled = labourRows.length > 0 && settledLabourCount === labourRows.length;

    // 3. Fetch parts issued
    const movementRows = await prisma.$queryRaw<MovementRow[]>`
      SELECT
        id,
        quantity_delta,
        unit_cost,
        currency_code,
        settled_journal_entry_id
      FROM gigalibs_cmms.stock_movements
      WHERE tenant_id = ${tenantId}::gigalibs_cmms.tenant_ref
        AND work_order_id = ${workOrderId}::uuid
        AND movement_type = 'ISSUE'
    `;

    let totalPartsQuantity = 0;
    let totalPartsCostCents = 0;
    let settledPartsCount = 0;
    let latestPartsJournalEntryId: string | null = null;

    for (const m of movementRows) {
      const qty = Math.abs(Number(m.quantity_delta) || 0);
      const cost = Number(m.unit_cost) || 0;
      totalPartsQuantity += qty;
      totalPartsCostCents += Math.round(qty * cost * 100);
      if (m.settled_journal_entry_id) {
        settledPartsCount++;
        latestPartsJournalEntryId = m.settled_journal_entry_id;
      }
    }

    const isPartsSettled = movementRows.length > 0 && settledPartsCount === movementRows.length;

    // 4. Fetch linked GAAP journal entries & line items
    const journalRows = await prisma.$queryRaw<JournalLineRow[]>`
      SELECT
        je.id AS entry_id,
        je."entryNumber" AS entry_number,
        je.memo,
        je."postedAt" AS posted_at,
        je."isBalanced" AS is_balanced,
        jli."accountCode" AS account_code,
        gla.name AS account_name,
        jli.description,
        jli."debitCents" AS debit_cents,
        jli."creditCents" AS credit_cents
      FROM journal_entries je
      JOIN journal_line_items jli ON jli."entryId" = je.id
      JOIN general_ledger_accounts gla ON gla.code = jli."accountCode"
      WHERE je."tenantId" = ${tenantId}
        AND je."referenceId" = ${workOrderId}
      ORDER BY je."postedAt" ASC, jli."debitCents" DESC
    `;

    // Group journal lines by entry
    const entryMap = new Map<string, {
      id: string;
      entryNumber: string;
      memo: string;
      postedAt: string;
      isBalanced: boolean;
      lines: Array<{
        accountCode: string;
        accountName: string;
        description: string | null;
        debitCents: number;
        creditCents: number;
      }>;
    }>();

    for (const r of journalRows) {
      if (!entryMap.has(r.entry_id)) {
        entryMap.set(r.entry_id, {
          id: r.entry_id,
          entryNumber: r.entry_number,
          memo: r.memo,
          postedAt: r.posted_at instanceof Date ? r.posted_at.toISOString() : String(r.posted_at),
          isBalanced: Boolean(r.is_balanced),
          lines: [],
        });
      }
      entryMap.get(r.entry_id)!.lines.push({
        accountCode: r.account_code,
        accountName: r.account_name,
        description: r.description,
        debitCents: Number(r.debit_cents),
        creditCents: Number(r.credit_cents),
      });
    }

    return {
      workOrderId: wo.id,
      woNumber: wo.wo_number,
      settlementStatus: wo.financial_settlement_status,
      currencyCode: currency,
      labour: {
        totalHours: Math.round(totalHours * 100) / 100,
        totalCostCents: totalLabourCostCents,
        entryCount: labourRows.length,
        settled: isLabourSettled,
        journalEntryId: latestLabourJournalEntryId,
      },
      parts: {
        totalQuantity: Math.round(totalPartsQuantity * 1000) / 1000,
        totalCostCents: totalPartsCostCents,
        movementCount: movementRows.length,
        settled: isPartsSettled,
        journalEntryId: latestPartsJournalEntryId,
      },
      totalCostCents: totalLabourCostCents + totalPartsCostCents,
      settledAt: wo.settled_at ? wo.settled_at.toISOString() : null,
      journalEntries: Array.from(entryMap.values()),
    };
  }

  /**
   * Settles unsettled parts and labour costs for a work order by generating
   * balanced GAAP Double-Entry General Ledger journal entries and line items.
   */
  async settleWorkOrderCosts(
    tenantId: string,
    workOrderId: string,
    options: SettleCmmsWorkOrderV1
  ): Promise<CmmsWorkOrderFinancialsV1> {
    const settleLabour = options.settleLabour !== false;
    const settleParts = options.settleParts !== false;

    // 1. Verify work order exists
    const woRows = await prisma.$queryRaw<WorkOrderRow[]>`
      SELECT
        id,
        wo_number,
        COALESCE(financial_settlement_status, 'UNSETTLED') as financial_settlement_status,
        settled_at,
        currency_code
      FROM gigalibs_cmms.work_orders
      WHERE tenant_id = ${tenantId}::gigalibs_cmms.tenant_ref
        AND id = ${workOrderId}::uuid
    `;

    if (!woRows || woRows.length === 0) {
      throw new Error(`Work order ${workOrderId} not found.`);
    }

    const wo = woRows[0];

    // 2. Settle parts if requested
    if (settleParts) {
      const unsettledParts = await prisma.$queryRaw<MovementRow[]>`
        SELECT id, quantity_delta, unit_cost, currency_code, settled_journal_entry_id
        FROM gigalibs_cmms.stock_movements
        WHERE tenant_id = ${tenantId}::gigalibs_cmms.tenant_ref
          AND work_order_id = ${workOrderId}::uuid
          AND movement_type = 'ISSUE'
          AND settled_journal_entry_id IS NULL
      `;

      let partsCents = 0;
      for (const p of unsettledParts) {
        const qty = Math.abs(Number(p.quantity_delta) || 0);
        const cost = Number(p.unit_cost) || 0;
        partsCents += Math.round(qty * cost * 100);
      }

      if (partsCents > 0 && unsettledParts.length > 0) {
        const entryId = `je_${crypto.randomUUID().replace(/-/g, '')}`;
        const entryNumber = `MRO-PARTS-${wo.wo_number}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
        const memo = `MRO parts consumption for WO ${wo.wo_number}${options.notes ? `: ${options.notes}` : ''}`;

        // Create JournalEntry
        await prisma.$executeRaw`
          INSERT INTO journal_entries (
            id, "tenantId", "entryNumber", memo, "sourceModule", "referenceId", "postedAt", "isBalanced", "createdAt", "updatedAt"
          ) VALUES (
            ${entryId},
            ${tenantId},
            ${entryNumber},
            ${memo},
            'CMMS_MAINTENANCE',
            ${workOrderId},
            NOW(),
            true,
            NOW(),
            NOW()
          )
        `;

        // Create Balanced JournalLineItems:
        // DEBIT 5100 (Maintenance Parts & Materials Expense)
        const lineDebitId = `jli_${crypto.randomUUID().replace(/-/g, '')}`;
        await prisma.$executeRaw`
          INSERT INTO journal_line_items (
            id, "entryId", "accountCode", description, "debitCents", "creditCents"
          ) VALUES (
            ${lineDebitId},
            ${entryId},
            '5100',
            ${'Maintenance Parts & Materials Expense - WO ' + wo.wo_number},
            ${partsCents},
            0
          )
        `;

        // CREDIT 1300 (Spare Parts & MRO Inventory)
        const lineCreditId = `jli_${crypto.randomUUID().replace(/-/g, '')}`;
        await prisma.$executeRaw`
          INSERT INTO journal_line_items (
            id, "entryId", "accountCode", description, "debitCents", "creditCents"
          ) VALUES (
            ${lineCreditId},
            ${entryId},
            '1300',
            ${'Spare Parts & MRO Inventory reduction - WO ' + wo.wo_number},
            0,
            ${partsCents}
          )
        `;

        // Mark stock movements as settled
        for (const p of unsettledParts) {
          await prisma.$executeRaw`
            UPDATE gigalibs_cmms.stock_movements
            SET settled_journal_entry_id = ${entryId}
            WHERE tenant_id = ${tenantId}::gigalibs_cmms.tenant_ref
              AND id = ${p.id}::uuid
          `;
        }
      }
    }

    // 3. Settle labour if requested
    if (settleLabour) {
      const unsettledLabour = await prisma.$queryRaw<LabourRow[]>`
        SELECT id, hours, hourly_rate, currency_code, booking_id, settled_journal_entry_id
        FROM gigalibs_cmms.work_order_labour
        WHERE tenant_id = ${tenantId}::gigalibs_cmms.tenant_ref
          AND work_order_id = ${workOrderId}::uuid
          AND settled_journal_entry_id IS NULL
      `;

      let labourCents = 0;
      for (const l of unsettledLabour) {
        const hours = Number(l.hours) || 0;
        const rate = Number(l.hourly_rate) || 0;
        labourCents += Math.round(hours * rate * 100);
      }

      if (labourCents > 0 && unsettledLabour.length > 0) {
        const entryId = `je_${crypto.randomUUID().replace(/-/g, '')}`;
        const entryNumber = `MRO-LABOUR-${wo.wo_number}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
        const memo = `Direct maintenance labour settlement for WO ${wo.wo_number}${options.notes ? `: ${options.notes}` : ''}`;

        // Create JournalEntry
        await prisma.$executeRaw`
          INSERT INTO journal_entries (
            id, "tenantId", "entryNumber", memo, "sourceModule", "referenceId", "postedAt", "isBalanced", "createdAt", "updatedAt"
          ) VALUES (
            ${entryId},
            ${tenantId},
            ${entryNumber},
            ${memo},
            'CMMS_MAINTENANCE',
            ${workOrderId},
            NOW(),
            true,
            NOW(),
            NOW()
          )
        `;

        // Create Balanced JournalLineItems:
        // DEBIT 5200 (Direct Maintenance Labour Expense)
        const lineDebitId = `jli_${crypto.randomUUID().replace(/-/g, '')}`;
        await prisma.$executeRaw`
          INSERT INTO journal_line_items (
            id, "entryId", "accountCode", description, "debitCents", "creditCents"
          ) VALUES (
            ${lineDebitId},
            ${entryId},
            '5200',
            ${'Direct Maintenance Labour Expense - WO ' + wo.wo_number},
            ${labourCents},
            0
          )
        `;

        // CREDIT 2100 (Accrued Payroll & Contractor Clearing)
        const lineCreditId = `jli_${crypto.randomUUID().replace(/-/g, '')}`;
        await prisma.$executeRaw`
          INSERT INTO journal_line_items (
            id, "entryId", "accountCode", description, "debitCents", "creditCents"
          ) VALUES (
            ${lineCreditId},
            ${entryId},
            '2100',
            ${'Accrued Payroll & Contractor Clearing - WO ' + wo.wo_number},
            0,
            ${labourCents}
          )
        `;

        // Mark labour rows as settled
        for (const l of unsettledLabour) {
          await prisma.$executeRaw`
            UPDATE gigalibs_cmms.work_order_labour
            SET settled_journal_entry_id = ${entryId}
            WHERE tenant_id = ${tenantId}::gigalibs_cmms.tenant_ref
              AND id = ${l.id}::uuid
          `;
        }
      }
    }

    // 4. Update work order settlement status
    const remainingUnsettled = await prisma.$queryRaw<Array<{ count: number }>>`
      SELECT
        (
          (SELECT COUNT(*)::int FROM gigalibs_cmms.work_order_labour
           WHERE tenant_id = ${tenantId}::gigalibs_cmms.tenant_ref
             AND work_order_id = ${workOrderId}::uuid
             AND settled_journal_entry_id IS NULL)
          +
          (SELECT COUNT(*)::int FROM gigalibs_cmms.stock_movements
           WHERE tenant_id = ${tenantId}::gigalibs_cmms.tenant_ref
             AND work_order_id = ${workOrderId}::uuid
             AND movement_type = 'ISSUE'
             AND settled_journal_entry_id IS NULL)
        ) AS count
    `;

    const remainingCount = Number(remainingUnsettled[0]?.count) || 0;
    const newStatus = remainingCount === 0 ? 'FULLY_SETTLED' : 'PARTIALLY_SETTLED';

    await prisma.$executeRaw`
      UPDATE gigalibs_cmms.work_orders
      SET financial_settlement_status = ${newStatus},
          settled_at = ${newStatus === 'FULLY_SETTLED' ? new Date() : null}
      WHERE tenant_id = ${tenantId}::gigalibs_cmms.tenant_ref
        AND id = ${workOrderId}::uuid
    `;

    return this.getWorkOrderFinancials(tenantId, workOrderId);
  }

  /**
   * Links a logged work order labour row directly to a workforce booking ID.
   * Enforces the ADR-0003 & ADR-0007 cross-module identity and execution handshake.
   */
  async linkLabourToBooking(
    tenantId: string,
    workOrderId: string,
    labourId: string,
    bookingId: string
  ): Promise<{ success: boolean; labourId: string; bookingId: string }> {
    await prisma.$executeRaw`
      UPDATE gigalibs_cmms.work_order_labour
      SET booking_id = ${bookingId}::uuid
      WHERE tenant_id = ${tenantId}::gigalibs_cmms.tenant_ref
        AND work_order_id = ${workOrderId}::uuid
        AND id = ${labourId}::uuid
    `;

    return {
      success: true,
      labourId,
      bookingId,
    };
  }

  /**
   * Links a CMMS work order to a Workforce demand requirement ID.
   */
  async linkWorkOrderToRequirement(
    tenantId: string,
    workOrderId: string,
    workRequirementId: string
  ): Promise<{ success: boolean; workOrderId: string; workRequirementId: string }> {
    await prisma.$executeRaw`
      UPDATE gigalibs_cmms.work_orders
      SET work_requirement_id = ${workRequirementId}::uuid
      WHERE tenant_id = ${tenantId}::gigalibs_cmms.tenant_ref
        AND id = ${workOrderId}::uuid
    `;

    return {
      success: true,
      workOrderId,
      workRequirementId,
    };
  }
}

export const cmmsLedgerSettlementService = new CmmsLedgerSettlementService();
