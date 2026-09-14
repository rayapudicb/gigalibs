/**
 * PrismaSagaService — Durable Saga State Machine (Phase 3)
 *
 * Replaces the in-memory sagaOrchestratorStore with PostgreSQL-backed persistence.
 * Every SagaInstance and SagaStep is written to the database, surviving process
 * restarts and enabling cross-replica saga visibility.
 *
 * Interface is intentionally compatible with sagaOrchestratorStore so call sites
 * can swap the import without changing business logic.
 */

import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '@gigalibs/db';

// ─── Domain types ────────────────────────────────────────────────────────────

export type SagaStatus =
  | 'STARTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'COMPENSATING'
  | 'COMPENSATED'
  | 'FAILED';

export type SagaStepStatus =
  | 'PENDING'
  | 'EXECUTING'
  | 'SUCCESS'
  | 'FAILED'
  | 'COMPENSATED';

export type SagaType =
  | 'DISPUTE_ESCROW_SETTLEMENT'
  | 'GRID_CONTINGENCY_FAILOVER'
  | 'TREASURY_RTGS_SETTLEMENT';

export type TargetSystem =
  | 'SAP_S4HANA'
  | 'SALESFORCE_CRM'
  | 'TREASURY_DTS'
  | 'CRYPTOGRAPHIC_VAULT'
  | 'SCADA_GRID';

export interface SagaStepRecord {
  id: string;
  sagaInstanceId: string;
  stepIndex: number;
  name: string;
  targetSystem: TargetSystem;
  forwardAction: string;
  compensatingAction: string;
  status: SagaStepStatus;
  fipsSha256Checksum?: string;
  error?: string;
  executedAt?: string;
  compensatedAt?: string;
}

export interface SagaInstanceRecord {
  sagaId: string;
  tenantId: string;
  sagaType: SagaType;
  status: SagaStatus;
  steps: SagaStepRecord[];
  payload: Record<string, unknown>;
  compensationTriggered: boolean;
  auditLedgerDigest: string;
  createdAt: string;
  completedAt?: string;
  logSummary: string[];
}

// ─── Step template definitions ────────────────────────────────────────────────

interface StepTemplate {
  name: string;
  target: TargetSystem;
  forward: string;
  compensate: string;
}

function buildStepTemplates(
  sagaType: SagaType,
  payload: Record<string, unknown>,
): StepTemplate[] {
  if (sagaType === 'DISPUTE_ESCROW_SETTLEMENT') {
    return [
      {
        name: 'Suspend Invoice Disbursement in SAP S/4HANA General Ledger',
        target: 'SAP_S4HANA',
        forward: `POST /api/sap/v1/fi/disbursements/hold (${payload['invoiceCode'] ?? 'INV-DOD-DISA'})`,
        compensate: `POST /api/sap/v1/fi/disbursements/release (${payload['invoiceCode'] ?? 'INV-DOD-DISA'})`,
      },
      {
        name: 'Generate Legal Notice & Contract Dispute Header in Salesforce CRM',
        target: 'SALESFORCE_CRM',
        forward: 'POST /api/crm/v1/disputes/new (FAR Subpart 16.5 Notice)',
        compensate: 'DELETE /api/crm/v1/disputes/cancel',
      },
      {
        name: 'Reallocate Funds to Secure Escrow Contingency Ledger',
        target: 'TREASURY_DTS',
        forward: `POST /api/treasury/v1/ledger/escrow-reallocate ($${(Number(payload['disputedAmountUsd']) || 45_000_000).toLocaleString()})`,
        compensate: 'POST /api/treasury/v1/ledger/escrow-revert',
      },
      {
        name: 'Seal Multi-System Transaction with FIPS 140-3 Hardware Signature',
        target: 'CRYPTOGRAPHIC_VAULT',
        forward: 'POST /api/vault/v1/signatures/seal-saga (HMAC SHA-256)',
        compensate: 'POST /api/vault/v1/signatures/revoke',
      },
    ];
  }

  if (sagaType === 'GRID_CONTINGENCY_FAILOVER') {
    return [
      {
        name: 'Dispatch Isolation Command to 500kV Feeder Substation',
        target: 'SCADA_GRID',
        forward: `POST /api/scada/v1/breakers/open (${payload['substation'] ?? 'CA-NORTH-500KV'})`,
        compensate: `POST /api/scada/v1/breakers/close (${payload['substation'] ?? 'CA-NORTH-500KV'})`,
      },
      {
        name: 'Ramp Up Hydropower Reserve Capacity',
        target: 'SCADA_GRID',
        forward: `POST /api/grid/v1/hydro/ramp (+${payload['requestedMw'] ?? 2500} MW)`,
        compensate: `POST /api/grid/v1/hydro/deramp (-${payload['requestedMw'] ?? 2500} MW)`,
      },
      {
        name: 'Notify Regional Western Reliability Coordinator via Telemetry',
        target: 'SCADA_GRID',
        forward: 'POST /api/rc-west/v1/contingency/notify',
        compensate: 'POST /api/rc-west/v1/contingency/cancel',
      },
    ];
  }

  // TREASURY_RTGS_SETTLEMENT
  return [
    {
      name: 'Initiate Fedwire RTGS Cash Draw from Treasury Reserve Account',
      target: 'TREASURY_DTS',
      forward: 'POST /api/fedwire/v1/draw ($100,000,000)',
      compensate: 'POST /api/fedwire/v1/refund ($100,000,000)',
    },
    {
      name: 'Credit Federal Reserve Central Depository General Account (TGA)',
      target: 'TREASURY_DTS',
      forward: 'POST /api/tga/v1/credit ($100,000,000)',
      compensate: 'POST /api/tga/v1/debit ($100,000,000)',
    },
    {
      name: 'Commit Dual-Sign Ledger Record with FIPS 186-4 Digest',
      target: 'CRYPTOGRAPHIC_VAULT',
      forward: 'POST /api/vault/v1/ledger/commit',
      compensate: 'POST /api/vault/v1/ledger/rollback',
    },
  ];
}

// ─── Raw DB row types (matching migration SQL) ────────────────────────────────

interface SagaInstanceRow {
  id: string;
  tenant_id: string;
  saga_type: string;
  status: string;
  payload: unknown;
  compensation_triggered: boolean;
  audit_ledger_digest: string | null;
  log_summary: string[];
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

interface SagaStepRow {
  id: string;
  saga_instance_id: string;
  step_index: number;
  name: string;
  target_system: string;
  forward_action: string;
  compensating_action: string;
  status: string;
  fips_sha256_checksum: string | null;
  error_message: string | null;
  executed_at: Date | null;
  compensated_at: Date | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sha256(data: unknown): string {
  return createHash('sha256')
    .update(typeof data === 'string' ? data : JSON.stringify(data))
    .digest('hex');
}

function rowToStepRecord(row: SagaStepRow): SagaStepRecord {
  return {
    id: row.id,
    sagaInstanceId: row.saga_instance_id,
    stepIndex: row.step_index,
    name: row.name,
    targetSystem: row.target_system as TargetSystem,
    forwardAction: row.forward_action,
    compensatingAction: row.compensating_action,
    status: row.status as SagaStepStatus,
    fipsSha256Checksum: row.fips_sha256_checksum ?? undefined,
    error: row.error_message ?? undefined,
    executedAt: row.executed_at?.toISOString(),
    compensatedAt: row.compensated_at?.toISOString(),
  };
}

function rowToInstanceRecord(
  row: SagaInstanceRow,
  steps: SagaStepRow[],
): SagaInstanceRecord {
  return {
    sagaId: row.id,
    tenantId: row.tenant_id,
    sagaType: row.saga_type as SagaType,
    status: row.status as SagaStatus,
    steps: steps.map(rowToStepRecord),
    payload: row.payload as Record<string, unknown>,
    compensationTriggered: row.compensation_triggered,
    auditLedgerDigest: row.audit_ledger_digest ?? '',
    createdAt: row.created_at.toISOString(),
    completedAt: row.completed_at?.toISOString(),
    logSummary: row.log_summary,
  };
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class PrismaSagaService {
  // ── Queries ─────────────────────────────────────────────────────────────────

  async getSagas(tenantId?: string): Promise<SagaInstanceRecord[]> {
    const rows = tenantId
      ? await prisma.$queryRaw<SagaInstanceRow[]>`
          SELECT * FROM saga_instances
          WHERE tenant_id = ${tenantId}
          ORDER BY created_at DESC
          LIMIT 200
        `
      : await prisma.$queryRaw<SagaInstanceRow[]>`
          SELECT * FROM saga_instances
          ORDER BY created_at DESC
          LIMIT 200
        `;

    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const steps = await prisma.$queryRaw<SagaStepRow[]>`
      SELECT * FROM saga_steps
      WHERE saga_instance_id = ANY(${ids}::text[])
      ORDER BY saga_instance_id, step_index
    `;

    return rows.map((row) =>
      rowToInstanceRecord(
        row,
        steps.filter((s) => s.saga_instance_id === row.id),
      ),
    );
  }

  async getSaga(sagaId: string): Promise<SagaInstanceRecord | undefined> {
    const rows = await prisma.$queryRaw<SagaInstanceRow[]>`
      SELECT * FROM saga_instances WHERE id = ${sagaId} LIMIT 1
    `;
    if (rows.length === 0) return undefined;

    const steps = await prisma.$queryRaw<SagaStepRow[]>`
      SELECT * FROM saga_steps
      WHERE saga_instance_id = ${sagaId}
      ORDER BY step_index
    `;

    return rowToInstanceRecord(rows[0]!, steps);
  }

  // ── Execution ─────────────────────────────────────────────────────────────

  async executeSaga(
    tenantId: string,
    sagaType: SagaType,
    payload: Record<string, unknown>,
    failAtStep?: number,
  ): Promise<SagaInstanceRecord> {
    const sagaId = `saga-${randomUUID()}`;
    const now = new Date();
    const templates = buildStepTemplates(sagaType, payload);
    const logSummary: string[] = [
      `Saga '${sagaId}' initiated for tenant '${tenantId}'.`,
    ];

    // Persist the new SagaInstance in STARTED state
    await prisma.$executeRaw`
      INSERT INTO saga_instances
        (id, tenant_id, saga_type, status, payload, compensation_triggered, log_summary, created_at, updated_at)
      VALUES
        (${sagaId}, ${tenantId}, ${sagaType}, 'STARTED', ${JSON.stringify(payload)}::jsonb,
         false, ARRAY[]::text[], ${now}, ${now})
    `;

    // Persist all steps as PENDING
    const stepIds: string[] = [];
    for (let i = 0; i < templates.length; i++) {
      const t = templates[i]!;
      const stepId = `step-${randomUUID()}`;
      stepIds.push(stepId);
      await prisma.$executeRaw`
        INSERT INTO saga_steps
          (id, saga_instance_id, step_index, name, target_system, forward_action, compensating_action, status)
        VALUES
          (${stepId}, ${sagaId}, ${i + 1}, ${t.name}, ${t.target}, ${t.forward}, ${t.compensate}, 'PENDING')
      `;
    }

    // Execute forward steps
    let failedStepIndex = -1;
    for (let i = 0; i < templates.length; i++) {
      const t = templates[i]!;
      const stepId = stepIds[i]!;
      const stepNumber = i + 1;
      const executedAt = new Date();

      if (failAtStep !== undefined && stepNumber === failAtStep) {
        // Simulated failure (injection point for testing / real error propagation)
        const errMsg = `Step ${stepNumber} failed at ${t.target}: downstream system unavailable.`;
        await prisma.$executeRaw`
          UPDATE saga_steps
          SET status = 'FAILED', error_message = ${errMsg}
          WHERE id = ${stepId}
        `;
        logSummary.push(`Step ${stepNumber} [${t.target}] FAILED: ${errMsg}`);
        failedStepIndex = i;
        break;
      }

      const checksum = sha256({ sagaId, stepIndex: stepNumber, payload });
      await prisma.$executeRaw`
        UPDATE saga_steps
        SET status = 'SUCCESS',
            fips_sha256_checksum = ${checksum},
            executed_at = ${executedAt}
        WHERE id = ${stepId}
      `;
      logSummary.push(`Step ${stepNumber} [${t.target}] SUCCESS: ${t.forward}`);
    }

    // Compensation (reverse rollback)
    let compensationTriggered = false;
    let finalStatus: SagaStatus = 'COMPLETED';

    if (failedStepIndex !== -1) {
      compensationTriggered = true;
      finalStatus = 'COMPENSATED';
      logSummary.push(
        'AUTOMATIC SAGA COMPENSATION TRIGGERED: rolling back executed steps in reverse order.',
      );

      await prisma.$executeRaw`
        UPDATE saga_instances SET status = 'COMPENSATING' WHERE id = ${sagaId}
      `;

      for (let j = failedStepIndex - 1; j >= 0; j--) {
        const t = templates[j]!;
        const stepId = stepIds[j]!;
        const compensatedAt = new Date();
        await prisma.$executeRaw`
          UPDATE saga_steps
          SET status = 'COMPENSATED', compensated_at = ${compensatedAt}
          WHERE id = ${stepId}
        `;
        logSummary.push(
          `Compensating Step ${j + 1} [${t.target}]: ${t.compensate} -> COMPENSATED.`,
        );
      }
      logSummary.push(
        'Rollback complete. Transaction restored to pre-saga state.',
      );
    }

    const completedAt = new Date();
    // Re-read steps for digest computation
    const allStepRows = await prisma.$queryRaw<SagaStepRow[]>`
      SELECT * FROM saga_steps WHERE saga_instance_id = ${sagaId} ORDER BY step_index
    `;
    const auditLedgerDigest = sha256({
      sagaId,
      tenantId,
      steps: allStepRows,
      finalStatus,
      completedAt: completedAt.toISOString(),
    });

    // Finalise the instance record
    await prisma.$executeRaw`
      UPDATE saga_instances
      SET status = ${finalStatus},
          compensation_triggered = ${compensationTriggered},
          audit_ledger_digest = ${auditLedgerDigest},
          log_summary = ${logSummary}::text[],
          completed_at = ${completedAt},
          updated_at = ${completedAt}
      WHERE id = ${sagaId}
    `;

    return {
      sagaId,
      tenantId,
      sagaType,
      status: finalStatus,
      steps: allStepRows.map(rowToStepRecord),
      payload,
      compensationTriggered,
      auditLedgerDigest,
      createdAt: now.toISOString(),
      completedAt: completedAt.toISOString(),
      logSummary,
    };
  }
}

export const prismaSagaService = new PrismaSagaService();
