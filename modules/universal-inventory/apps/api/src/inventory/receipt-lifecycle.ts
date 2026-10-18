import type { ReceiptStatus } from '@gigalibs/contracts';
import {
  DocumentGuardRefusedError,
  DocumentLifecycleRunner,
  DocumentTransitionRefusedError,
  DocumentVersionConflictError,
  defineDocumentGraph,
  type TransitionContext,
  type VersionedDocument,
} from '@gigalibs/document-lifecycle';
import { BadRequestException, ConflictException } from '@nestjs/common';

/** States that may move to COMPLETED via the `complete` action (ADR-0033 F1.3). */
export const INVENTORY_RECEIPT_COMPLETE_FROM: readonly ReceiptStatus[] = [
  'DRAFT',
  'EXPECTED',
  'RECEIVING',
];

export type ReceiptLifecycleDocument = VersionedDocument & {
  readonly id: string;
  readonly status: ReceiptStatus;
};

export type InventoryReceiptLifecycleAction = 'complete';

export interface InventoryReceiptLifecycleDeps<TResult> {
  readonly tenantId: string;
  readonly actorId: string;
  readonly lineCount: number;
  /** When set, runs before stock effects (ADR-0033 F1.4 / audit P1-07). */
  readonly assertFinancePeriodOpen?: (receivedAtIso: string) => Promise<void>;
  readonly persistComplete: (context: TransitionContext<ReceiptLifecycleDocument>) => Promise<TResult>;
}

function graphFor<TResult>(deps: InventoryReceiptLifecycleDeps<TResult>) {
  return defineDocumentGraph<ReceiptLifecycleDocument>({
    complete: {
      from: INVENTORY_RECEIPT_COMPLETE_FROM,
      to: 'COMPLETED',
      guards: [
        (context) => {
          if (deps.lineCount < 1) {
            throw new DocumentGuardRefusedError(
              context.action,
              'Add at least one receipt line before completing.',
            );
          }
        },
        async () => {
          if (deps.assertFinancePeriodOpen) {
            await deps.assertFinancePeriodOpen(new Date().toISOString());
          }
        },
      ],
      effect: (context) => deps.persistComplete(context),
    },
  });
}

export function mapInventoryReceiptLifecycleError(error: unknown): never {
  if (error instanceof DocumentVersionConflictError) {
    throw new ConflictException(
      `Version conflict: expected ${error.expectedVersion}, found ${error.actualVersion}.`,
    );
  }
  if (error instanceof DocumentGuardRefusedError) {
    throw new BadRequestException(error.reason);
  }
  if (error instanceof DocumentTransitionRefusedError) {
    if (error.fromStatus === 'COMPLETED') {
      throw new ConflictException('Receipt is already completed.');
    }
    if (error.fromStatus === 'CANCELLED') {
      throw new ConflictException('A cancelled receipt cannot be completed.');
    }
    throw new ConflictException(
      `Receipt is ${String(error.fromStatus).toLowerCase()}, so it cannot be completed now.`,
    );
  }
  throw error;
}

/** WI-OI-120fy (F1.3): run receipt `complete` through ADR-0033 F1 primitives. */
export async function runInventoryReceiptTransition<TResult>(
  deps: InventoryReceiptLifecycleDeps<TResult>,
  document: ReceiptLifecycleDocument,
  action: InventoryReceiptLifecycleAction,
  expectedVersion: number,
): Promise<TResult> {
  const runner = new DocumentLifecycleRunner(graphFor(deps));
  const context: TransitionContext<ReceiptLifecycleDocument> = {
    tenantId: deps.tenantId,
    actorId: deps.actorId,
    documentId: document.id,
    action,
    expectedVersion,
    document,
  };
  try {
    return (await runner.run(context)) as TResult;
  } catch (error) {
    mapInventoryReceiptLifecycleError(error);
  }
}
