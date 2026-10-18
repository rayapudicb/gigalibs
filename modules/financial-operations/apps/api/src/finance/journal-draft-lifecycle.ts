import {
  DocumentGuardRefusedError,
  DocumentLifecycleRunner,
  DocumentTransitionRefusedError,
  DocumentVersionConflictError,
  defineDocumentGraph,
  type TransitionContext,
} from '@gigalibs/document-lifecycle';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { FinanceVersionConflict, type JournalDraftV1 } from './journal-drafts.service.js';

export type JournalDraftAction = 'submit' | 'approve' | 'returnToDraft';

type DraftTransitionContext = TransitionContext<JournalDraftV1> & { readonly reason?: string };

function readTransitionReason(context: DraftTransitionContext): string | undefined {
  const trimmed = context.reason?.trim();
  return trimmed ? trimmed : undefined;
}

export interface JournalDraftLifecycleDeps {
  readonly client: PoolClient;
  readonly tenantId: string;
  readonly actorId: string;
  readonly assertOpenPeriod: (bookId: string, postingDate: string) => Promise<void>;
  readonly persistSubmit: (draft: JournalDraftV1) => Promise<JournalDraftV1>;
  readonly persistApprove: (draft: JournalDraftV1, reason: string) => Promise<JournalDraftV1>;
  readonly persistReturn: (draft: JournalDraftV1, reason: string) => Promise<JournalDraftV1>;
}

function guardBalancedJournal(context: TransitionContext<JournalDraftV1>): void {
  const draft = context.document;
  if (draft.lineCount < 2) {
    throw new DocumentGuardRefusedError(context.action, 'A journal needs at least two lines.');
  }
  if (BigInt(draft.totalDebitMinor) !== BigInt(draft.totalCreditMinor)) {
    throw new DocumentGuardRefusedError(
      context.action,
      `The journal does not balance: debits ${draft.totalDebitMinor}, credits ${draft.totalCreditMinor} (minor units).`,
    );
  }
  if (BigInt(draft.totalDebitMinor) === 0n) {
    throw new DocumentGuardRefusedError(context.action, 'The journal has no amounts.');
  }
}

function guardSecondPersonApproval(context: TransitionContext<JournalDraftV1>): void {
  if (context.document.submittedBy === context.actorId) {
    throw new DocumentGuardRefusedError(context.action, 'The person who submitted a journal cannot approve it.');
  }
}

function graphFor(deps: JournalDraftLifecycleDeps) {
  return defineDocumentGraph<JournalDraftV1>({
    submit: {
      from: ['DRAFT'],
      to: 'SUBMITTED',
      guards: [
        guardBalancedJournal,
        async (context) => {
          await deps.assertOpenPeriod(context.document.accountingBookId, context.document.postingDate);
        },
      ],
      effect: async (context) => deps.persistSubmit(context.document),
    },
    approve: {
      from: ['SUBMITTED'],
      to: 'POSTED',
      guards: [
        guardSecondPersonApproval,
        async (context) => {
          await deps.assertOpenPeriod(context.document.accountingBookId, context.document.postingDate);
        },
      ],
      effect: async (context) => {
        const reason = readTransitionReason(context);
        if (!reason) {
          throw new DocumentGuardRefusedError(context.action, 'An approval reason is required.');
        }
        return deps.persistApprove(context.document, reason);
      },
    },
    returnToDraft: {
      from: ['SUBMITTED'],
      to: 'DRAFT',
      effect: async (context) => {
        const reason = readTransitionReason(context);
        if (!reason) {
          throw new DocumentGuardRefusedError(context.action, 'Say why the journal goes back to its author.');
        }
        return deps.persistReturn(context.document, reason);
      },
    },
  });
}

export function mapJournalDraftLifecycleError(error: unknown): never {
  if (error instanceof DocumentVersionConflictError) throw new FinanceVersionConflict();
  if (error instanceof DocumentGuardRefusedError) {
    if (error.reason.includes('cannot approve')) throw new ForbiddenException(error.reason);
    throw new BadRequestException(error.reason);
  }
  if (error instanceof DocumentTransitionRefusedError) {
    const status = error.fromStatus;
    throw new ConflictException({
      code: 'FINANCE_DRAFT_STATE',
      message:
        status === 'POSTED'
          ? 'The journal is already posted; reverse it instead.'
          : `The journal is ${status.toLowerCase()}, so it cannot change now.`,
    });
  }
  throw error;
}

/** WI-OI-120fm (F1.2): run submit / approve / returnToDraft through ADR-0033 F1 primitives. */
export async function runJournalDraftTransition(
  deps: JournalDraftLifecycleDeps,
  draft: JournalDraftV1,
  action: JournalDraftAction,
  expectedVersion: number,
  options: { readonly reason?: string } = {},
): Promise<JournalDraftV1> {
  const runner = new DocumentLifecycleRunner(graphFor(deps));
  const context: DraftTransitionContext = {
    tenantId: deps.tenantId,
    actorId: deps.actorId,
    documentId: draft.id,
    action,
    expectedVersion,
    document: draft,
    reason: options.reason,
  };
  try {
    return (await runner.run(context)) as JournalDraftV1;
  } catch (error) {
    mapJournalDraftLifecycleError(error);
  }
}
