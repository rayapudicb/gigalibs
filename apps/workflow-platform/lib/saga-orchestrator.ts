import { createHash, randomUUID } from 'node:crypto';
import type { SovereignTenantId } from './tenant-ingestion-store';

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

export interface SagaStep {
  stepIndex: number;
  name: string;
  targetSystem: 'SAP_S4HANA' | 'SALESFORCE_CRM' | 'TREASURY_DTS' | 'CRYPTOGRAPHIC_VAULT' | 'SCADA_GRID';
  forwardAction: string;
  compensatingAction: string;
  status: SagaStepStatus;
  fipsSha256Checksum?: string;
  executedAt?: string;
  compensatedAt?: string;
  error?: string;
}

export interface SagaInstance {
  sagaId: string;
  tenantId: SovereignTenantId;
  sagaType: 'DISPUTE_ESCROW_SETTLEMENT' | 'GRID_CONTINGENCY_FAILOVER' | 'TREASURY_RTGS_SETTLEMENT';
  status: SagaStatus;
  steps: SagaStep[];
  payload: Record<string, any>;
  compensationTriggered: boolean;
  auditLedgerDigest: string;
  createdAt: string;
  completedAt?: string;
  logSummary: string[];
}

class SagaOrchestratorStore {
  private sagas: Map<string, SagaInstance> = new Map();

  constructor() {
    this.seedInitialSagas();
  }

  private hash(data: any): string {
    return createHash('sha256').update(typeof data === 'string' ? data : JSON.stringify(data)).digest('hex');
  }

  private seedInitialSagas() {
    // 1. Initial Completed Saga (Defense)
    const defId = 'saga-def-001';
    const defSteps: SagaStep[] = [
      {
        stepIndex: 1,
        name: 'Suspend Invoice Disbursement in SAP S/4HANA General Ledger',
        targetSystem: 'SAP_S4HANA',
        forwardAction: 'POST /api/sap/v1/fi/disbursements/hold (Invoice INV-DOD-DISA)',
        compensatingAction: 'POST /api/sap/v1/fi/disbursements/release (Invoice INV-DOD-DISA)',
        status: 'SUCCESS',
        fipsSha256Checksum: this.hash({ step: 1, inv: 'INV-DOD-DISA', status: 'HELD' }),
        executedAt: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        stepIndex: 2,
        name: 'Generate Legal Notice & Contract Dispute Header in Salesforce CRM',
        targetSystem: 'SALESFORCE_CRM',
        forwardAction: 'POST /api/crm/v1/disputes/new (FAR Subpart 16.5 Overbilling Notice)',
        compensatingAction: 'DELETE /api/crm/v1/disputes/cancel',
        status: 'SUCCESS',
        fipsSha256Checksum: this.hash({ step: 2, notice: 'FAR_OVERBILLING_DISPUTE' }),
        executedAt: new Date(Date.now() - 3590000).toISOString(),
      },
      {
        stepIndex: 3,
        name: 'Reallocate $45M from Operating Cash to Escrow Contingency Ledger',
        targetSystem: 'TREASURY_DTS',
        forwardAction: 'POST /api/treasury/v1/ledger/escrow-reallocate ($45,000,000)',
        compensatingAction: 'POST /api/treasury/v1/ledger/escrow-revert ($45,000,000)',
        status: 'SUCCESS',
        fipsSha256Checksum: this.hash({ step: 3, escrowAmt: 45000000 }),
        executedAt: new Date(Date.now() - 3580000).toISOString(),
      },
      {
        stepIndex: 4,
        name: 'Seal Multi-System Transaction with FIPS 140-3 Hardware Signature',
        targetSystem: 'CRYPTOGRAPHIC_VAULT',
        forwardAction: 'POST /api/vault/v1/signatures/seal-saga (HMAC SHA-256)',
        compensatingAction: 'POST /api/vault/v1/signatures/revoke',
        status: 'SUCCESS',
        fipsSha256Checksum: this.hash({ step: 4, seal: 'FIPS_140_3_SEALED' }),
        executedAt: new Date(Date.now() - 3570000).toISOString(),
      },
    ];

    this.sagas.set(defId, {
      sagaId: defId,
      tenantId: 'defense',
      sagaType: 'DISPUTE_ESCROW_SETTLEMENT',
      status: 'COMPLETED',
      steps: defSteps,
      payload: { invoiceCode: 'INV-DOD-DISA-SEP2026', disputedAmountUsd: 45000000 },
      compensationTriggered: false,
      auditLedgerDigest: this.hash({ sagaId: defId, steps: defSteps }),
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      completedAt: new Date(Date.now() - 3570000).toISOString(),
      logSummary: [
        'Step 1 [SAP S/4HANA]: Disbursement successfully placed in escrow hold.',
        'Step 2 [Salesforce CRM]: Contract dispute case created with FAR citation.',
        'Step 3 [Treasury DTS]: $45M reallocated to secure escrow partition.',
        'Step 4 [Cryptographic Vault]: Transaction sealed with HSM signature.',
        'Saga completed successfully with 100% transactional integrity.',
      ],
    });

    // 2. Initial Compensated Saga (Demonstrating Automated Rollback on Step 3 Failure)
    const enId = 'saga-en-002';
    const enSteps: SagaStep[] = [
      {
        stepIndex: 1,
        name: 'Dispatch Isolation Command to 500kV Feeder Substation',
        targetSystem: 'SCADA_GRID',
        forwardAction: 'POST /api/scada/v1/breakers/open (Node CA-NORTH-500KV)',
        compensatingAction: 'POST /api/scada/v1/breakers/close (Restore Normal Feeder)',
        status: 'COMPENSATED',
        fipsSha256Checksum: this.hash({ step: 1, action: 'BREAKER_OPEN' }),
        executedAt: new Date(Date.now() - 1800000).toISOString(),
        compensatedAt: new Date(Date.now() - 1795000).toISOString(),
      },
      {
        stepIndex: 2,
        name: 'Ramp Up 2,500 MW Hydropower Reserve Capacity',
        targetSystem: 'SCADA_GRID',
        forwardAction: 'POST /api/grid/v1/hydro/ramp (+2,500 MW)',
        compensatingAction: 'POST /api/grid/v1/hydro/deramp (-2,500 MW)',
        status: 'COMPENSATED',
        fipsSha256Checksum: this.hash({ step: 2, action: 'HYDRO_RAMP' }),
        executedAt: new Date(Date.now() - 1799000).toISOString(),
        compensatedAt: new Date(Date.now() - 1796000).toISOString(),
      },
      {
        stepIndex: 3,
        name: 'Notify Regional Western Reliability Coordinator via Telemetry',
        targetSystem: 'SCADA_GRID',
        forwardAction: 'POST /api/rc-west/v1/contingency/notify',
        compensatingAction: 'POST /api/rc-west/v1/contingency/cancel',
        status: 'FAILED',
        error: 'Upstream RC-West Webhook ETIMEDOUT (HTTP 504 Gateway Timeout). Automatic Rollback Triggered.',
        executedAt: new Date(Date.now() - 1798000).toISOString(),
      },
    ];

    this.sagas.set(enId, {
      sagaId: enId,
      tenantId: 'energy',
      sagaType: 'GRID_CONTINGENCY_FAILOVER',
      status: 'COMPENSATED',
      steps: enSteps,
      payload: { substation: 'CA-NORTH-500KV', requestedMw: 2500 },
      compensationTriggered: true,
      auditLedgerDigest: this.hash({ sagaId: enId, steps: enSteps }),
      createdAt: new Date(Date.now() - 1800000).toISOString(),
      completedAt: new Date(Date.now() - 1795000).toISOString(),
      logSummary: [
        'Step 1 [SCADA]: Isolation breaker opened successfully.',
        'Step 2 [Grid]: Hydro reserves ramped by +2,500 MW.',
        'Step 3 [RC-West]: Webhook failed (HTTP 504 Gateway Timeout).',
        'COMPENSATION TRIGGERED: Commencing reverse distributed rollback.',
        'Rollback Step 2: Hydro reserves de-ramped (-2,500 MW).',
        'Rollback Step 1: Isolation breaker safely closed. Original state restored.',
        'Saga safely terminated with zero data corruption.',
      ],
    });
  }

  public getSagas(tenantId?: SovereignTenantId): SagaInstance[] {
    const list = Array.from(this.sagas.values());
    return list
      .filter((s) => !tenantId || s.tenantId === tenantId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getSaga(sagaId: string): SagaInstance | undefined {
    return this.sagas.get(sagaId);
  }

  public executeSaga(
    tenantId: SovereignTenantId,
    sagaType: 'DISPUTE_ESCROW_SETTLEMENT' | 'GRID_CONTINGENCY_FAILOVER' | 'TREASURY_RTGS_SETTLEMENT',
    payload: Record<string, any>,
    failAtStep?: number,
  ): SagaInstance {
    const sagaId = `saga-${randomUUID()}`;
    const now = new Date().toISOString();

    let stepTemplates: Array<{ name: string; target: any; forward: string; compensate: string }> = [];

    if (sagaType === 'DISPUTE_ESCROW_SETTLEMENT') {
      stepTemplates = [
        {
          name: 'Suspend Invoice Disbursement in SAP S/4HANA General Ledger',
          target: 'SAP_S4HANA',
          forward: `POST /api/sap/v1/fi/disbursements/hold (${payload.invoiceCode || 'INV-DOD-DISA'})`,
          compensate: `POST /api/sap/v1/fi/disbursements/release (${payload.invoiceCode || 'INV-DOD-DISA'})`,
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
          forward: `POST /api/treasury/v1/ledger/escrow-reallocate ($${(payload.disputedAmountUsd || 45000000).toLocaleString()})`,
          compensate: 'POST /api/treasury/v1/ledger/escrow-revert',
        },
        {
          name: 'Seal Multi-System Transaction with FIPS 140-3 Hardware Signature',
          target: 'CRYPTOGRAPHIC_VAULT',
          forward: 'POST /api/vault/v1/signatures/seal-saga (HMAC SHA-256)',
          compensate: 'POST /api/vault/v1/signatures/revoke',
        },
      ];
    } else if (sagaType === 'GRID_CONTINGENCY_FAILOVER') {
      stepTemplates = [
        {
          name: 'Dispatch Isolation Command to 500kV Feeder Substation',
          target: 'SCADA_GRID',
          forward: `POST /api/scada/v1/breakers/open (${payload.substation || 'CA-NORTH-500KV'})`,
          compensate: `POST /api/scada/v1/breakers/close (${payload.substation || 'CA-NORTH-500KV'})`,
        },
        {
          name: 'Ramp Up Hydropower Reserve Capacity',
          target: 'SCADA_GRID',
          forward: `POST /api/grid/v1/hydro/ramp (+${payload.requestedMw || 2500} MW)`,
          compensate: `POST /api/grid/v1/hydro/deramp (-${payload.requestedMw || 2500} MW)`,
        },
        {
          name: 'Notify Regional Western Reliability Coordinator via Telemetry',
          target: 'SCADA_GRID',
          forward: 'POST /api/rc-west/v1/contingency/notify',
          compensate: 'POST /api/rc-west/v1/contingency/cancel',
        },
      ];
    } else {
      stepTemplates = [
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

    const steps: SagaStep[] = stepTemplates.map((t, idx) => ({
      stepIndex: idx + 1,
      name: t.name,
      targetSystem: t.target,
      forwardAction: t.forward,
      compensatingAction: t.compensate,
      status: 'PENDING',
    }));

    const logSummary: string[] = [`Saga '${sagaId}' started for tenant '${tenantId}'.`];
    let failedIndex = -1;

    // Execute forward steps sequentially
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i]!;
      step.status = 'EXECUTING';

      // Check for simulated failure
      if (failAtStep && step.stepIndex === failAtStep) {
        step.status = 'FAILED';
        step.error = `Simulated Network/Protocol Failure at Step ${step.stepIndex} [${step.targetSystem}].`;
        logSummary.push(`Step ${step.stepIndex} [${step.targetSystem}] FAILED: ${step.error}`);
        failedIndex = i;
        break;
      } else {
        step.status = 'SUCCESS';
        step.executedAt = new Date().toISOString();
        step.fipsSha256Checksum = this.hash({ sagaId, stepIndex: step.stepIndex, payload });
        logSummary.push(`Step ${step.stepIndex} [${step.targetSystem}] SUCCESS: ${step.forwardAction}`);
      }
    }

    // If a step failed, execute reverse compensation (Rollback)
    let compensationTriggered = false;
    let finalStatus: SagaStatus = 'COMPLETED';

    if (failedIndex !== -1) {
      compensationTriggered = true;
      finalStatus = 'COMPENSATED';
      logSummary.push('AUTOMATIC SAGA COMPENSATION TRIGGERED: Rolling back executed forward steps in reverse order.');

      for (let j = failedIndex - 1; j >= 0; j--) {
        const stepToCompensate = steps[j]!;
        stepToCompensate.status = 'COMPENSATED';
        stepToCompensate.compensatedAt = new Date().toISOString();
        logSummary.push(
          `Compensating Step ${stepToCompensate.stepIndex} [${stepToCompensate.targetSystem}]: ${stepToCompensate.compensatingAction} -> COMPENSATED.`,
        );
      }
      logSummary.push('Rollback completed. Transaction safely restored to pre-saga state with zero ledger corruption.');
    } else {
      logSummary.push('All distributed steps committed successfully. Two-way write-back synchronized.');
    }

    const completedAt = new Date().toISOString();
    const digest = this.hash({ sagaId, tenantId, steps, finalStatus, completedAt });

    const sagaInstance: SagaInstance = {
      sagaId,
      tenantId,
      sagaType,
      status: finalStatus,
      steps,
      payload,
      compensationTriggered,
      auditLedgerDigest: digest,
      createdAt: now,
      completedAt,
      logSummary,
    };

    this.sagas.set(sagaId, sagaInstance);
    return sagaInstance;
  }
}

// Global singleton
const globalForSaga = globalThis as unknown as { sagaOrchestratorStore?: SagaOrchestratorStore };
export const sagaOrchestratorStore = globalForSaga.sagaOrchestratorStore ?? new SagaOrchestratorStore();
if (process.env.NODE_ENV !== 'production') {
  globalForSaga.sagaOrchestratorStore = sagaOrchestratorStore;
}
