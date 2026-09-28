import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

export interface ImprestWallet {
  id: string;
  walletName: string;
  custodianName: string;
  custodianEmail: string;
  currency: string;
  targetBalanceMinor: number;
  currentBalanceMinor: number;
  lowBalanceThresholdMinor: number;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ImprestTransaction {
  id: string;
  walletId: string;
  voucherNumber: string;
  transactionType: string;
  recipientName: string;
  amountMinor: number;
  balanceAfterMinor: number;
  purpose: string;
  receiptAttached: boolean;
  recordedBy: string;
  createdAt: string;
}

@Injectable()
export class ImprestService {
  constructor(private readonly db: DatabaseService) {}

  async listWallets(tenantId: string): Promise<ImprestWallet[]> {
    const pool = this.db.getPool();
    const result = await pool.query(
      `SELECT
        id, wallet_name, custodian_name, custodian_email, currency,
        target_balance_minor, current_balance_minor, low_balance_threshold_minor,
        status, version, created_at, updated_at
      FROM gigalibs_spend.imprest_wallets
      WHERE tenant_id = $1
      ORDER BY wallet_name ASC`,
      [tenantId],
    );

    return result.rows.map((row: any) => ({
      id: row.id,
      walletName: row.wallet_name,
      custodianName: row.custodian_name,
      custodianEmail: row.custodian_email,
      currency: row.currency,
      targetBalanceMinor: Number(row.target_balance_minor),
      currentBalanceMinor: Number(row.current_balance_minor),
      lowBalanceThresholdMinor: Number(row.low_balance_threshold_minor),
      status: row.status,
      version: Number(row.version),
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async createWallet(
    tenantId: string,
    data: {
      walletName: string;
      custodianName: string;
      custodianEmail: string;
      currency?: string;
      targetBalanceMinor: number;
      initialFundingMinor?: number;
      fundingVoucherNumber?: string;
      lowBalanceThresholdMinor?: number;
    },
  ): Promise<ImprestWallet> {
    const id = randomUUID();
    const currency = (data.currency || 'USD').toUpperCase();
    const threshold = data.lowBalanceThresholdMinor || Math.floor(data.targetBalanceMinor * 0.25);
    const initialFunding = data.initialFundingMinor || 0;

    return this.db.withTenantTransaction(tenantId, async (client) => {
      const result = await client.query(
        `INSERT INTO gigalibs_spend.imprest_wallets (
          tenant_id, id, wallet_name, custodian_name, custodian_email, currency,
          target_balance_minor, current_balance_minor, low_balance_threshold_minor, status, version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1)
        RETURNING *`,
        [
          tenantId,
          id,
          data.walletName.trim(),
          data.custodianName.trim(),
          data.custodianEmail.trim(),
          currency,
          data.targetBalanceMinor,
          initialFunding,
          threshold,
          initialFunding <= threshold ? 'REPLENISHMENT_PENDING' : 'ACTIVE',
        ],
      );

      if (initialFunding > 0) {
        const voucherNumber = data.fundingVoucherNumber || `FUND-${Date.now().toString().slice(-6)}`;
        await client.query(
          `INSERT INTO gigalibs_spend.imprest_transactions (
            tenant_id, id, wallet_id, voucher_number, transaction_type, recipient_name,
            amount_minor, balance_after_minor, purpose, receipt_attached, recorded_by
          ) VALUES ($1, $2, $3, $4, 'REPLENISHMENT', $5, $6, $6, 'Initial treasury imprest funding', true, $5)`,
          [
            tenantId,
            randomUUID(),
            id,
            voucherNumber,
            data.custodianName.trim(),
            initialFunding,
          ],
        );
      }

      const row = result.rows[0];
      return {
        id: row.id,
        walletName: row.wallet_name,
        custodianName: row.custodian_name,
        custodianEmail: row.custodian_email,
        currency: row.currency,
        targetBalanceMinor: Number(row.target_balance_minor),
        currentBalanceMinor: Number(row.current_balance_minor),
        lowBalanceThresholdMinor: Number(row.low_balance_threshold_minor),
        status: row.status,
        version: Number(row.version),
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
      };
    });
  }

  async listTransactions(tenantId: string, walletId?: string): Promise<ImprestTransaction[]> {
    const pool = this.db.getPool();
    let query = `
      SELECT
        id, wallet_id, voucher_number, transaction_type, recipient_name,
        amount_minor, balance_after_minor, purpose, receipt_attached, recorded_by, created_at
      FROM gigalibs_spend.imprest_transactions
      WHERE tenant_id = $1
    `;
    const params: string[] = [tenantId];
    if (walletId) {
      params.push(walletId);
      query += ` AND wallet_id = $2`;
    }
    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);
    return result.rows.map((row: any) => ({
      id: row.id,
      walletId: row.wallet_id,
      voucherNumber: row.voucher_number,
      transactionType: row.transaction_type,
      recipientName: row.recipient_name,
      amountMinor: Number(row.amount_minor),
      balanceAfterMinor: Number(row.balance_after_minor),
      purpose: row.purpose,
      receiptAttached: Boolean(row.receipt_attached),
      recordedBy: row.recorded_by,
      createdAt: row.created_at.toISOString(),
    }));
  }

  async recordDisbursement(
    tenantId: string,
    data: {
      walletId: string;
      voucherNumber?: string;
      recipientName: string;
      amountMinor: number;
      purpose: string;
      receiptAttached?: boolean;
      recordedBy: string;
    },
  ): Promise<ImprestTransaction> {
    return this.db.withTenantTransaction(tenantId, async (client) => {
      const walletRes = await client.query(
        `SELECT * FROM gigalibs_spend.imprest_wallets WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, data.walletId],
      );

      if (walletRes.rows.length === 0) {
        throw new NotFoundException(`Imprest wallet ${data.walletId} not found.`);
      }

      const wallet = walletRes.rows[0];
      const currentBalance = Number(wallet.current_balance_minor);
      if (currentBalance < data.amountMinor) {
        throw new BadRequestException(
          `Insufficient petty cash balance: current is ${currentBalance}, requested is ${data.amountMinor}`,
        );
      }

      const balanceAfter = currentBalance - data.amountMinor;
      const voucherNumber =
        data.voucherNumber || `VOUCH-${Date.now().toString().slice(-6)}`;
      const txId = randomUUID();

      const receiptAttached = data.receiptAttached === true;
      if (!receiptAttached && data.amountMinor >= 5000) { // $50 threshold for petty cash receipt policy
        throw new BadRequestException('Disbursements of $50.00 or more require an attached physical/digital receipt.');
      }

      // Insert transaction
      const txRes = await client.query(
        `INSERT INTO gigalibs_spend.imprest_transactions (
          tenant_id, id, wallet_id, voucher_number, transaction_type, recipient_name,
          amount_minor, balance_after_minor, purpose, receipt_attached, recorded_by
        ) VALUES ($1, $2, $3, $4, 'DISBURSEMENT', $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          tenantId,
          txId,
          data.walletId,
          voucherNumber,
          data.recipientName.trim(),
          data.amountMinor,
          balanceAfter,
          data.purpose.trim(),
          receiptAttached,
          data.recordedBy.trim(),
        ],
      );

      // Update wallet balance and status
      const newStatus =
        balanceAfter <= Number(wallet.low_balance_threshold_minor)
          ? 'REPLENISHMENT_PENDING'
          : 'ACTIVE';

      await client.query(
        `UPDATE gigalibs_spend.imprest_wallets
         SET current_balance_minor = $1, status = $2, version = version + 1, updated_at = transaction_timestamp()
         WHERE tenant_id = $3 AND id = $4`,
        [balanceAfter, newStatus, tenantId, data.walletId],
      );

      // If low balance threshold is reached, trigger outbox replenishment notification
      if (newStatus === 'REPLENISHMENT_PENDING') {
        await client.query(
          `INSERT INTO gigalibs_spend.outbox_events (
            tenant_id, id, event_type, payload
          ) VALUES ($1, $2, 'spend.imprest.replenishment_needed.v1', $3)`,
          [
            tenantId,
            randomUUID(),
            JSON.stringify({
              walletId: data.walletId,
              walletName: wallet.wallet_name,
              currentBalanceMinor: balanceAfter,
              thresholdMinor: Number(wallet.low_balance_threshold_minor),
              targetBalanceMinor: Number(wallet.target_balance_minor),
            }),
          ],
        );
      }

      const row = txRes.rows[0];
      return {
        id: row.id,
        walletId: row.wallet_id,
        voucherNumber: row.voucher_number,
        transactionType: row.transaction_type,
        recipientName: row.recipient_name,
        amountMinor: Number(row.amount_minor),
        balanceAfterMinor: Number(row.balance_after_minor),
        purpose: row.purpose,
        receiptAttached: Boolean(row.receipt_attached),
        recordedBy: row.recorded_by,
        createdAt: row.created_at.toISOString(),
      };
    });
  }

  async recordReplenishment(
    tenantId: string,
    data: {
      walletId: string;
      amountMinor: number;
      recordedBy: string;
    },
  ): Promise<ImprestTransaction> {
    return this.db.withTenantTransaction(tenantId, async (client) => {
      const walletRes = await client.query(
        `SELECT * FROM gigalibs_spend.imprest_wallets WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, data.walletId],
      );

      if (walletRes.rows.length === 0) {
        throw new NotFoundException(`Imprest wallet ${data.walletId} not found.`);
      }

      const wallet = walletRes.rows[0];
      const balanceAfter = Number(wallet.current_balance_minor) + data.amountMinor;
      const voucherNumber = `REPL-${Date.now().toString().slice(-6)}`;
      const txId = randomUUID();

      const txRes = await client.query(
        `INSERT INTO gigalibs_spend.imprest_transactions (
          tenant_id, id, wallet_id, voucher_number, transaction_type, recipient_name,
          amount_minor, balance_after_minor, purpose, receipt_attached, recorded_by
        ) VALUES ($1, $2, $3, $4, 'REPLENISHMENT', 'Custodian Replenishment', $5, $6, 'Treasury petty cash replenishment', true, $7)
        RETURNING *`,
        [tenantId, txId, data.walletId, voucherNumber, data.amountMinor, balanceAfter, data.recordedBy],
      );

      await client.query(
        `UPDATE gigalibs_spend.imprest_wallets
         SET current_balance_minor = $1, status = 'ACTIVE', version = version + 1, updated_at = transaction_timestamp()
         WHERE tenant_id = $2 AND id = $3`,
        [balanceAfter, tenantId, data.walletId],
      );

      const row = txRes.rows[0];
      return {
        id: row.id,
        walletId: row.wallet_id,
        voucherNumber: row.voucher_number,
        transactionType: row.transaction_type,
        recipientName: row.recipient_name,
        amountMinor: Number(row.amount_minor),
        balanceAfterMinor: Number(row.balance_after_minor),
        purpose: row.purpose,
        receiptAttached: Boolean(row.receipt_attached),
        recordedBy: row.recorded_by,
        createdAt: row.created_at.toISOString(),
      };
    });
  }
}
